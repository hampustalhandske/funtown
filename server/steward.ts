import { mkdirSync } from "node:fs";
import { basename } from "node:path";
import { spawn, type IPty } from "node-pty";
import { attachEnv, startBackground } from "./agents.ts";
import type { LogError } from "./errors.ts";
import type { Journal } from "./journal.ts";
import type { HookEvent, TownState } from "./town.ts";
import type { Card, Lead, Parcel, Word } from "./types.ts";
import { ASKABLE, brief, WORD_LABELS, WORD_MS } from "./word.ts";
import type { Pr } from "./workflow.ts";

/** How long its output must pause before the request is written: the screen has been drawn. */
const QUIET_MS = 500;
/** How long the attach stays open after the request, so the session reads it before the detach. */
const LINGER_MS = 1_000;
/** How long a started steward may go unlisted before another is started. */
const LISTED_MS = 5 * 60_000;

const key = (pr: number, head: string) => `${pr}\0${head}`;
/** The labels a reply must hold to count as a review: the three parts `steward.md` asks for. */
const REVIEW_LABELS = ["Squash title", "Merge text", "Before merging"];
/** Whether `lead` is stuck repeating a tool call: its turn still runs, unlike one stuck on an error. */
const inLoop = (lead: Lead) => lead.needs === "stuck" && lead.reason?.startsWith("loop:") === true;

/** `template` with each `{name}` of `fields` filled in once, and control characters other than newline and tab dropped, so no field can end the paste or press keys. */
const fill = (template: string, fields: Record<string, string>) =>
  template
    .replace(/\{(\w+)\}/g, (all, name: string) => (Object.hasOwn(fields, name) ? fields[name] : all))
    .replace(/\p{Cc}/gu, (c) => (c === "\n" || c === "\t" ? c : ""));

/** A request the steward is sent: a PR review or her word on a card. */
type Request = { kind: "review"; cwd: string; pr: Pr } | { kind: "word"; card: Card };

/**
 * The steward: one background `claude` session in `dir` that pre-reviews the ready PRs in
 * `lists` (open PRs by cwd) the user has asked for with `ask`, once per head commit, pasting
 * `prompt` filled in for it over `claude attach`, and gives her word on the open cards asked for
 * with `askWord`, pasting `cardPrompt` filled with the card's brief; an absent prompt turns its
 * requests off. Words go before reviews. `journal` carries the session, the review requests
 * and their reviews across restarts; `cards` gives the open cards; a failed start or attach is
 * retried after `retryMs`; `readyMs` bounds an attach and `answerMs` a review request. `changed` runs when a request has been sent.
 */
export function createSteward(opts: {
  claude: string;
  dir: string;
  prompt?: string;
  cardPrompt?: string;
  town: TownState;
  lists: Map<string, Pr[]>;
  cards: () => Card[];
  journal?: Journal;
  logError: LogError;
  retryMs: number;
  readyMs: number;
  answerMs: number;
  changed: () => void;
}) {
  const { claude, dir, prompt, cardPrompt, town, lists, cards, journal, logError, retryMs, readyMs, answerMs, changed } = opts;
  // card id -> its word once asked; queued words wait in the order they were asked (a re-ask goes last)
  const words = new Map<string, Word>();
  // PR number and head commit -> when its request was sent; a re-ask forgets it
  const sent = new Map<string, number>();
  // PR number and head commit -> the id of the steward's letter that answered its request with a review
  const reviewed = new Map<string, string>();
  // PR number and head commit of each open PR the user asked for -> its place in the order asked, so the oldest goes first
  const asked = new Map<string, number>();
  let askedCount = 0;
  // whether the user wrote to the steward, outside a request, since the last ask; it stops further requests
  let paused = false;
  let stewardId: string | undefined;
  let startedAt = -Infinity;
  for (const e of journal?.kept ?? []) {
    if (e.kind === "steward") [stewardId, startedAt] = [e.shortId, e.at];
    else if (e.kind === "review") sent.set(key(e.pr, e.head), e.at);
    else if (e.kind === "reviewed") reviewed.set(key(e.pr, e.head), e.letter);
  }
  let busy = false;
  // the request sent whose Stop or StopFailure hasn't come yet
  let inFlight: ({ kind: "review"; pr: number; head: string } | { kind: "word"; card: string }) & { at: number } | undefined;
  // whether the steward's last turn has ended (its Stop or StopFailure came after its last prompt or tool call)
  let turnOver = false;
  // whether the steward named by stewardId has been seen listed
  let wasListed = false;
  let retryAt = -Infinity;
  const failing = new Set<"start" | "attach">();
  // the attach writing a request, while it runs
  let attach: { detach(): void; exited: Promise<void> } | undefined;
  // the `claude --bg` starting the steward, while it runs
  let starting: Promise<void> | undefined;
  let closed = false;

  const fail = (step: "start" | "attach", err: unknown) => {
    if (!failing.has(step)) logError("steward", err);
    failing.add(step);
    retryAt = Date.now() + retryMs;
  };
  const lead = () => (stewardId ? town.byShortId(stewardId) : undefined);

  /** The asked ready PRs with no request sent for their head commit, oldest asked first; forgets the asks of PRs no longer open and ready. */
  const due = () => {
    const open = new Map<string, { cwd: string; pr: Pr }>();
    for (const [cwd, prs] of lists) for (const pr of prs) if (!pr.draft) open.set(key(pr.number, pr.head), { cwd, pr });
    for (const k of asked.keys()) if (!open.has(k)) asked.delete(k);
    return [...asked]
      .filter(([k]) => !sent.has(k))
      .sort(([, a], [, b]) => a - b)
      .map(([k]) => open.get(k)!);
  };

  const start = async () => {
    busy = true;
    try {
      mkdirSync(dir, { recursive: true });
      stewardId = await startBackground(claude, dir);
      startedAt = Date.now();
      wasListed = false;
      failing.delete("start");
      journal?.append({ kind: "steward", at: startedAt, shortId: stewardId });
    } catch (err) {
      fail("start", err);
    } finally {
      busy = false;
    }
  };

  /** The prompt text for `req`. */
  const textOf = (req: Request) => {
    if (req.kind === "word") {
      const house = town.cwds().get(req.card.lead) ?? req.card.cwd;
      return fill(cardPrompt!, { project: basename(house), brief: brief(req.card, town.lead(req.card.lead), house, town.phase(house)) });
    }
    const { pr, cwd } = req;
    return fill(prompt!, { number: String(pr.number), title: pr.title, url: pr.url, project: basename(cwd), repo: /^https?:\/\/[^/]+\/([^/]+\/[^/]+)/.exec(pr.url)?.[1] ?? pr.url });
  };

  /** Attaches to the steward, pastes `req` once the screen is drawn, and detaches; a word whose card has closed by then is dropped unsent. */
  const send = (steward: Lead, req: Request) => {
    busy = true;
    const text = textOf(req);
    let pty: IPty;
    try {
      pty = spawn(claude, ["attach", steward.shortId!], { name: "xterm-256color", cols: 120, rows: 40, env: attachEnv() });
    } catch (err) {
      busy = false;
      fail("attach", err);
      return;
    }
    let written = false;
    let gaveUp = false;
    let dropped = false;
    let exited = false;
    const detach = () => {
      if (!exited) pty.kill();
    };
    let onExited!: () => void;
    attach = { detach, exited: new Promise((resolve) => (onExited = resolve)) };
    const write = () => {
      if (req.kind === "word" && !cards().some((c) => c.id === req.card.id)) {
        dropped = true;
        words.delete(req.card.id);
        clearTimeout(giveUp);
        detach();
        return;
      }
      written = true;
      pty.write(`\x1b[200~${text}\x1b[201~`);
      pty.write("\r");
      const at = Date.now();
      if (req.kind === "word") {
        words.set(req.card.id, { state: "writing" });
        inFlight = { kind: "word", card: req.card.id, at };
      } else {
        const { cwd, pr } = req;
        sent.set(key(pr.number, pr.head), at);
        inFlight = { kind: "review", pr: pr.number, head: pr.head, at };
        journal?.append({ kind: "review", at, cwd, pr: pr.number, head: pr.head });
      }
      failing.delete("attach");
      changed();
      clearTimeout(giveUp);
      timer = setTimeout(detach, LINGER_MS);
    };
    // Output that never pauses for QUIET_MS still ends the attach here.
    const giveUp = setTimeout(() => {
      gaveUp = true;
      clearTimeout(timer);
      fail("attach", new Error(`claude attach ${steward.shortId} wasn't quiet for ${QUIET_MS} ms within ${readyMs} ms`));
      detach();
    }, readyMs);
    let timer: NodeJS.Timeout | undefined;
    pty.onData(() => {
      if (written || gaveUp) return;
      clearTimeout(timer);
      timer = setTimeout(write, QUIET_MS);
    });
    pty.onExit(({ exitCode }) => {
      exited = true;
      clearTimeout(giveUp);
      clearTimeout(timer);
      attach = undefined;
      busy = false;
      if (!written && !gaveUp && !dropped && !closed) fail("attach", new Error(`claude attach ${steward.shortId} exited (${exitCode}) before the request was written`));
      onExited();
    });
  };

  return {
    /** The steward's lead while it is listed. */
    lead,

    /** The short id of the steward session started or reused last, or undefined before one is. */
    shortId: () => stewardId,

    /**
     * Starts the steward or sends the next request, words before reviews, when one is due and
     * the steward can take it; drops the words of closed cards, except the one in flight.
     */
    pump(): void {
      if (closed) return;
      const open = cards();
      for (const id of words.keys()) if (!open.some((c) => c.id === id) && !(inFlight?.kind === "word" && inFlight.card === id)) words.delete(id);
      if (inFlight?.kind === "word" && Date.now() - inFlight.at >= WORD_MS) {
        logError("steward", `no word on card ${inFlight.card} after ${WORD_MS / 60_000} min`);
        words.set(inFlight.card, { state: "failed", reason: `no reply in ${WORD_MS / 60_000} minutes` });
        inFlight = undefined;
      } else if (inFlight?.kind === "review" && Date.now() - inFlight.at >= answerMs) {
        const limit = answerMs >= 60_000 ? `${answerMs / 60_000} min` : `${answerMs} ms`;
        logError("steward", `no answer to #${inFlight.pr} after ${limit}`);
        inFlight = undefined;
      }
      if (paused || busy || Date.now() < retryAt) return;
      const word = [...words].find(([, w]) => w.state === "queued")?.[0];
      const review = due()[0];
      const next: Request | undefined = word !== undefined ? { kind: "word", card: open.find((c) => c.id === word)! } : review && { kind: "review", ...review };
      const steward = lead();
      if (steward) wasListed = true;
      else if (inFlight) {
        if (inFlight.kind === "word") words.set(inFlight.card, { state: "failed", reason: "the steward left the list" });
        inFlight = undefined;
      }
      if (!next) return;
      if (!steward) {
        if (stewardId === undefined || wasListed || Date.now() - startedAt >= LISTED_MS) starting = start().finally(() => (starting = undefined));
      } else if (!inFlight && steward.stage !== "working" && (turnOver || !inLoop(steward)) && steward.shortId && !open.some((c) => c.lead === steward.id)) {
        send(steward, next);
      }
    },

    /**
     * Asks for the review of PR `number` in the house `cwd` at its current head: 204 when it is
     * queued, being reviewed or reviewed already, or now queued (an ask also lifts a pause), 404
     * for an unknown house or PR, 409 with reviews off or for a draft.
     */
    ask(cwd: string, number: number): 204 | 404 | 409 {
      if (!prompt) return 409;
      const pr = lists.get(cwd)?.find((p) => p.number === number);
      if (!pr) return 404;
      if (pr.draft) return 409;
      paused = false;
      const k = key(pr.number, pr.head);
      const requested = inFlight?.kind === "review" && key(inFlight.pr, inFlight.head) === k;
      if (reviewed.has(k) || (asked.has(k) && (!sent.has(k) || requested))) return 204;
      sent.delete(k);
      asked.set(k, askedCount++);
      return 204;
    },

    /**
     * Asks for the steward's word on the open card `id`: 204 when it is now queued (an idle or
     * failed word; an ask also lifts a pause) or already queued, writing or ready, 404 for an
     * unknown or closed card, 409 with words off or for the steward's own card.
     */
    askWord(id: string): 204 | 404 | 409 {
      if (!cardPrompt) return 409;
      const card = cards().find((c) => c.id === id);
      if (!card) return 404;
      if (card.lead === lead()?.id) return 409;
      paused = false;
      if (!ASKABLE.includes(words.get(id)?.state ?? "idle")) return 204;
      words.delete(id);
      words.set(id, { state: "queued" });
      return 204;
    },

    /** The word on `card` for the State: idle until asked; undefined with words off or on the steward's own card. */
    word(card: Card): Word | undefined {
      if (!cardPrompt || card.lead === lead()?.id) return undefined;
      return words.get(card.id) ?? { state: "idle" };
    },

    /**
     * Notes an applied hook event: the steward's own Stop or StopFailure ends its turn and the
     * request in flight; a prompt with no request in flight is the user's own and pauses requests
     * until the next ask; and a Stop's letter, when it is new since the request and holds all of
     * the labelled parts, is journaled as its review or makes the word ready, while any other
     * reply is logged and leaves the PR not asked or fails the word, naming the missing labels.
     */
    event(event: HookEvent): void {
      const steward = lead();
      if (!steward || event.agent_id !== undefined || event.session_id !== steward.id) return;
      const name = event.hook_event_name;
      if (name === "Stop" || name === "StopFailure") turnOver = true;
      else if (name === "UserPromptSubmit" || name === "PreToolUse") turnOver = false;
      if (name === "UserPromptSubmit" && !inFlight) paused = true;
      if (!inFlight || (name !== "Stop" && name !== "StopFailure")) return;
      if (inFlight.kind === "word") {
        const { card, at } = inFlight;
        const letter = name === "Stop" ? town.letters(steward.id)?.find((l) => l.from === steward.id && l.at >= at) : undefined;
        const missing = WORD_LABELS.filter((label) => !(letter?.text ?? "").includes(`${label}:`));
        if (name === "StopFailure") {
          words.set(card, { state: "failed", reason: "the steward's turn failed" });
        } else if (letter && missing.length === 0) {
          words.set(card, { state: "ready", letter: letter.id });
        } else {
          logError("steward", `reply on card ${card} lacks ${missing.join(", ")}`);
          words.set(card, { state: "failed", reason: `the reply lacks ${missing.join(", ")}` });
        }
      } else if (name === "Stop") {
        const { pr, head, at } = inFlight;
        const letter = town.letters(steward.id)?.find((l) => l.from === steward.id);
        if (letter && letter.at >= at && REVIEW_LABELS.every((label) => letter.text.includes(label))) {
          reviewed.set(key(pr, head), letter.id);
          journal?.append({ kind: "reviewed", at: Date.now(), pr, head, letter: letter.id });
        } else {
          logError("steward", `reply to #${pr} lacks ${REVIEW_LABELS.filter((label) => !(letter?.text ?? "").includes(label)).join(", ")}`);
          asked.delete(key(pr, head));
        }
      }
      inFlight = undefined;
    },

    /** The review of `pr` for its parcel: idle until asked for; undefined with reviews off or for a draft. */
    review(pr: Pr): Parcel["review"] {
      if (!prompt || pr.draft) return undefined;
      const steward = lead();
      const k = key(pr.number, pr.head);
      const base = steward ? { steward: steward.id } : {};
      const letter = reviewed.get(k);
      if (letter !== undefined) return { state: "ready", ...base, letter };
      if (!asked.has(k)) return { state: "idle", ...base };
      return { state: sent.has(k) ? "reviewing" : "queued", ...base };
    },

    /**
     * Detaches a request still being written; resolves once its `claude attach` has exited and a
     * steward being started is journaled, so a restart finds it.
     */
    async close(): Promise<void> {
      closed = true;
      attach?.detach();
      await Promise.all([attach?.exited, starting]);
    },
  };
}
