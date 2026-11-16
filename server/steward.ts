import { mkdirSync } from "node:fs";
import { spawn, type IPty } from "node-pty";
import { claudeEnv, startBackground } from "./agents.ts";
import type { LogError } from "./errors.ts";
import type { Journal } from "./journal.ts";
import type { HookEvent, TownState } from "./town.ts";
import type { Lead, Parcel } from "./types.ts";
import type { Pr } from "./workflow.ts";

/** How long `claude attach` may stay silent before the request is given up. */
const READY_MS = 15_000;
/** How long its output must pause before the request is written: the screen has been drawn. */
const QUIET_MS = 500;
/** How long the attach stays open after the request, so the session reads it before the detach. */
const LINGER_MS = 1_000;

const key = (pr: number, head: string) => `${pr}\0${head}`;

/**
 * The steward: one background `claude` session in `dir` that pre-reviews each ready PR (open,
 * not a draft) once per head commit. `lists` holds each house's open PRs by cwd. A request is
 * `prompt` with `{number}`, `{title}` and `{url}` filled in, pasted into the steward over
 * `claude attach` while it isn't working and has no request in flight (sent, its next Stop not
 * yet seen); requests go oldest first. The steward is started (`claude --bg`) the first time a
 * review is due and none is listed, and journaled, so a restart reuses it; each sent request is
 * journaled too, so a restart never sends it again. A failed start or attach is logged once
 * until one works, and tried again after `retryMs`; a started steward that isn't listed within
 * `listedMs` is started again. `changed` runs when a request has been sent.
 */
export function createSteward(opts: {
  claude: string;
  dir: string;
  prompt: string;
  town: TownState;
  lists: Map<string, Pr[]>;
  journal?: Journal;
  logError: LogError;
  retryMs: number;
  listedMs: number;
  changed: () => void;
}) {
  const { claude, dir, prompt, town, lists, journal, logError, retryMs, listedMs, changed } = opts;
  // PR number and head commit -> when its request was sent
  const sent = new Map<string, number>();
  // PR number and head commit -> when it was first seen due, so the oldest goes first
  const seen = new Map<string, number>();
  let stewardId: string | undefined;
  for (const e of journal?.kept ?? []) {
    if (e.kind === "steward") stewardId = e.shortId;
    else if (e.kind === "review") sent.set(key(e.pr, e.head), e.at);
  }
  let busy = false;
  let inFlight = false;
  let startedAt = -Infinity;
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

  /** The ready PRs with no request sent for their head commit, oldest first. */
  const due = () => {
    const found = new Map<string, { cwd: string; pr: Pr }>();
    for (const [cwd, prs] of lists) {
      for (const pr of [...prs].reverse()) {
        const k = key(pr.number, pr.head);
        if (pr.draft || sent.has(k) || found.has(k)) continue;
        if (!seen.has(k)) seen.set(k, seen.size);
        found.set(k, { cwd, pr });
      }
    }
    return [...found].sort(([a], [b]) => seen.get(a)! - seen.get(b)!).map(([, item]) => item);
  };

  const start = async () => {
    busy = true;
    try {
      mkdirSync(dir, { recursive: true });
      stewardId = await startBackground(claude, dir);
      startedAt = Date.now();
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
      inFlight = true;
      failing.delete("attach");
      journal?.append({ kind: "review", at, cwd, pr: pr.number, head: pr.head });
      changed();
      timer = setTimeout(detach, LINGER_MS);
    };
    let timer = setTimeout(() => {
      fail("attach", new Error(`claude attach ${steward.shortId} showed nothing within ${READY_MS} ms`));
      detach();
    }, READY_MS);
    pty.onData(() => {
      if (written) return;
      clearTimeout(timer);
      timer = setTimeout(write, QUIET_MS);
    });
    pty.onExit(({ exitCode }) => {
      exited = true;
      clearTimeout(timer);
      attach = undefined;
      busy = false;
      if (!written && !closed) fail("attach", new Error(`claude attach ${steward.shortId} exited (${exitCode}) before the request was written`));
      onExited();
    });
  };

  return {
    /** The steward's lead while it is listed. */
    lead,

    /** Starts the steward or sends the next request, when one is due and the steward can take it. */
    pump(): void {
      if (closed || busy || Date.now() < retryAt) return;
      const next = due()[0];
      const steward = lead();
      if (!steward) inFlight = false;
      if (!next) return;
      if (!steward) {
        if (Date.now() - startedAt >= listedMs) starting = start().finally(() => (starting = undefined));
      } else if (!inFlight && steward.stage !== "working" && steward.shortId) {
        send(steward, next.cwd, next.pr);
      }
    },

    /** Notes an applied hook event: the steward's own Stop ends the request in flight. */
    event(event: HookEvent): void {
      if (event.hook_event_name === "Stop" && event.agent_id === undefined && event.session_id === lead()?.id) inFlight = false;
    },

    /** The review of `pr` for its parcel; undefined for a draft. */
    review(pr: Pr): Parcel["review"] {
      if (pr.draft) return undefined;
      const steward = lead();
      const at = sent.get(key(pr.number, pr.head));
      const base = steward ? { steward: steward.id } : {};
      if (at === undefined) return { state: "queued", ...base };
      const letter = steward && town.letters(steward.id)?.filter((l) => l.from === steward.id && l.at >= at).at(-1);
      return letter ? { state: "ready", ...base, letter: letter.id } : { state: "reviewing", ...base };
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
