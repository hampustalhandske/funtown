import { mkdirSync } from "node:fs";
import { spawn, type IPty } from "node-pty";
import { claudeEnv, startBackground } from "./agents.ts";
import type { LogError } from "./errors.ts";
import type { Journal } from "./journal.ts";
import type { HookEvent, TownState } from "./town.ts";
import type { Card, Lead, Parcel } from "./types.ts";
import type { Pr } from "./workflow.ts";

/** How long its output must pause before the request is written: the screen has been drawn. */
const QUIET_MS = 500;
/** How long the attach stays open after the request, so the session reads it before the detach. */
const LINGER_MS = 1_000;
/** How long a started steward may go unlisted before another is started. */
const LISTED_MS = 5 * 60_000;

const key = (pr: number, head: string) => `${pr}\0${head}`;
/** Whether `lead` is stuck repeating a tool call: its turn still runs, unlike one stuck on an error. */
const inLoop = (lead: Lead) => lead.needs === "stuck" && lead.reason?.startsWith("loop:") === true;

/**
 * The steward: one background `claude` session in `dir` that pre-reviews each ready PR in
 * `lists` (open PRs by cwd) once per head commit, pasting `prompt` filled in for it over
 * `claude attach`. `journal` carries the session, the requests and their reviews across
 * restarts; `cards` gives the open cards; a failed start or attach is retried after `retryMs`;
 * `readyMs` bounds an attach and `answerMs` a request. `changed` runs when a request has been sent.
 */
export function createSteward(opts: {
  claude: string;
  dir: string;
  prompt: string;
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
  const { claude, dir, prompt, town, lists, cards, journal, logError, retryMs, readyMs, answerMs, changed } = opts;
  // PR number and head commit -> when its request was sent
  const sent = new Map<string, number>();
  // PR number and head commit -> the id of the steward's letter that answered its request
  const reviewed = new Map<string, string>();
  // PR number and head commit of each open PR due -> its place in the order first seen, so the oldest goes first
  const seen = new Map<string, number>();
  let seenCount = 0;
  let stewardId: string | undefined;
  let startedAt = -Infinity;
  for (const e of journal?.kept ?? []) {
    if (e.kind === "steward") [stewardId, startedAt] = [e.shortId, e.at];
    else if (e.kind === "review") sent.set(key(e.pr, e.head), e.at);
    else if (e.kind === "reviewed") reviewed.set(key(e.pr, e.head), e.letter);
  }
  let busy = false;
  // the request sent whose Stop or StopFailure hasn't come yet
  let inFlight: { pr: number; head: string; at: number } | undefined;
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

  /** The ready PRs with no request sent for their head commit, oldest first; forgets the order of the rest. */
  const due = () => {
    const found = new Map<string, { cwd: string; pr: Pr }>();
    for (const [cwd, prs] of lists) {
      for (const pr of [...prs].reverse()) {
        const k = key(pr.number, pr.head);
        if (pr.draft || sent.has(k) || found.has(k)) continue;
        if (!seen.has(k)) seen.set(k, seenCount++);
        found.set(k, { cwd, pr });
      }
    }
    for (const k of seen.keys()) if (!found.has(k)) seen.delete(k);
    return [...found].sort(([a], [b]) => seen.get(a)! - seen.get(b)!).map(([, item]) => item);
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

  /** Attaches to the steward, pastes the request for `pr` once the screen is drawn, and detaches. */
  const send = (steward: Lead, cwd: string, pr: Pr) => {
    busy = true;
    // Control characters are dropped, so a PR title can't end the paste or press keys.
    const text = prompt
      .replace(/\{(number|title|url)\}/g, (_, name: "number" | "title" | "url") => String(pr[name]))
      .replace(/\p{Cc}/gu, (c) => (c === "\n" || c === "\t" ? c : ""));
    let pty: IPty;
    try {
      pty = spawn(claude, ["attach", steward.shortId!], { name: "xterm-256color", cols: 120, rows: 40, env: claudeEnv() });
    } catch (err) {
      busy = false;
      fail("attach", err);
      return;
    }
    let written = false;
    let gaveUp = false;
    let exited = false;
    const detach = () => {
      if (!exited) pty.kill();
    };
    let onExited!: () => void;
    attach = { detach, exited: new Promise((resolve) => (onExited = resolve)) };
    const write = () => {
      written = true;
      pty.write(`\x1b[200~${text}\x1b[201~`);
      pty.write("\r");
      const at = Date.now();
      sent.set(key(pr.number, pr.head), at);
      inFlight = { pr: pr.number, head: pr.head, at };
      failing.delete("attach");
      journal?.append({ kind: "review", at, cwd, pr: pr.number, head: pr.head });
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
      if (!written && !gaveUp && !closed) fail("attach", new Error(`claude attach ${steward.shortId} exited (${exitCode}) before the request was written`));
      onExited();
    });
  };

  return {
    /** The steward's lead while it is listed. */
    lead,

    /** The short id of the steward session started or reused last, or undefined before one is. */
    shortId: () => stewardId,

    /** Starts the steward or sends the next request, when one is due and the steward can take it. */
    pump(): void {
      if (closed) return;
      if (inFlight && Date.now() - inFlight.at >= answerMs) {
        const limit = answerMs >= 60_000 ? `${answerMs / 60_000} min` : `${answerMs} ms`;
        logError("steward", `no answer to #${inFlight.pr} after ${limit}`);
        inFlight = undefined;
      }
      if (busy || Date.now() < retryAt) return;
      const next = due()[0];
      const steward = lead();
      if (steward) wasListed = true;
      else inFlight = undefined;
      if (!next) return;
      if (!steward) {
        if (stewardId === undefined || wasListed || Date.now() - startedAt >= LISTED_MS) starting = start().finally(() => (starting = undefined));
      } else if (!inFlight && steward.stage !== "working" && (turnOver || !inLoop(steward)) && steward.shortId && !cards().some((c) => c.lead === steward.id)) {
        send(steward, next.cwd, next.pr);
      }
    },

    /**
     * Notes an applied hook event: the steward's own Stop or StopFailure ends its turn and the
     * request in flight, and a Stop's letter, when it is new since the request, is journaled as
     * its review.
     */
    event(event: HookEvent): void {
      const steward = lead();
      if (!steward || event.agent_id !== undefined || event.session_id !== steward.id) return;
      const name = event.hook_event_name;
      if (name === "Stop" || name === "StopFailure") turnOver = true;
      else if (name === "UserPromptSubmit" || name === "PreToolUse") turnOver = false;
      if (!inFlight) return;
      if (name === "Stop") {
        const { pr, head, at } = inFlight;
        const letter = town.letters(steward.id)?.find((l) => l.from === steward.id);
        if (letter && letter.at >= at) {
          reviewed.set(key(pr, head), letter.id);
          journal?.append({ kind: "reviewed", at: Date.now(), pr, head, letter: letter.id });
        }
      } else if (name !== "StopFailure") {
        return;
      }
      inFlight = undefined;
    },

    /** The review of `pr` for its parcel; undefined for a draft. */
    review(pr: Pr): Parcel["review"] {
      if (pr.draft) return undefined;
      const steward = lead();
      const k = key(pr.number, pr.head);
      const base = steward ? { steward: steward.id } : {};
      const letter = reviewed.get(k);
      if (letter !== undefined) return { state: "ready", ...base, letter };
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
