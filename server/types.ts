export type Stage = "working" | "needs_you" | "done";
export type Character = {
  id: string;
  name: string;
  stage: Stage;
  activity: string | null;
  step: string | null;
  needs?: string;
  /** Date.now() (server or hook clock) when it began waiting; set while stage is needs_you. */
  since?: number;
  /** Why it is stuck, when needs is "stuck": "rate limit", "server error", "loop: Bash: npm test", ... */
  reason?: string;
  /** `at` of its newest letter; absent when it has none. */
  letter?: number;
  /** A subagent's SubagentStart agent_type; absent for leads and untyped agents. */
  role?: string;
  /** Labels from the phase file for this role or name; absent when none. */
  tags?: string[];
};
/** A lead's end-of-turn message or a subagent's result. */
export type Letter = {
  /** Server-made, unique across restarts. */
  id: string;
  /** The writer's character id: the lead's session id or the subagent's agent id. */
  from: string;
  /** The writer's name when it was written. */
  name: string;
  /** `last_assistant_message` as sent (Markdown); over 65,536 characters (UTF-16 units) it is cut, never inside a surrogate pair, and ends with "…". */
  text: string;
  /** The event's `funtown.at`, or the server's Date.now() when absent. */
  at: number;
};
/** One line of the journal file. */
export type JournalEntry =
  | { kind: "letter"; at: number; cwd: string; lead: string; letter: Letter }
  | { kind: "stuck"; at: number; cwd: string; lead: string; who: string; name: string; reason: string }
  | { kind: "steward"; at: number; shortId: string }
  | { kind: "review"; at: number; cwd: string; pr: number; head: string }
  | { kind: "reviewed"; at: number; pr: number; head: string; letter: string };
/** What the morning view shows from the journal. */
export type Morning = {
  since: number;
  /** One per cwd with entries at or after `since`, newest entry first. */
  projects: {
    /** basename of cwd */
    project: string;
    cwd: string;
    /** Per lead, its newest letter of its own (from === lead) in the window; newest first. */
    done: (Letter & { lead: string })[];
    /** Newest first. */
    stuck: { at: number; lead: string; who: string; name: string; reason: string }[];
  }[];
};
export type Lead = Character & {
  tty: string | null;
  termProgram: string | null;
  subagents: Character[];
  kind: "terminal" | "background";
  /** The id `claude attach` takes; null for a terminal session. */
  shortId: string | null;
  /** Files this run and another listed run both touched; absent when none. */
  overlaps?: { file: string; with: string; withName: string }[];
  /** True on the listed session the steward module tracks as the steward; absent on every other lead. */
  steward?: true;
};
/** An open pull request of a house's project. */
export type Parcel = {
  number: number;
  title: string;
  url: string;
  draft: boolean;
  /** The steward's review of the current head commit; absent for a draft or with reviews off. "idle": not asked for. */
  review?: {
    state: "idle" | "queued" | "reviewing" | "ready";
    /** The steward's session id once it is listed. */
    steward?: string;
    /** The review letter's id, when ready. */
    letter?: string;
  };
};
export type House = {
  project: string;
  cwd: string;
  leads: Lead[];
  /** From .claude/phase.json; absent when there is none or it is unreadable. */
  phase?: { phase: string; note?: string; steps?: string[]; goal?: string; spec?: string };
  /** Open PRs, newest number first; absent until the first gh list succeeds. */
  parcels?: Parcel[];
  /** True when the user added this folder in the app (it stays with no sessions). */
  added?: boolean;
  /** True once a session has been listed here since the server started. */
  seen?: boolean;
};
/** How much a decision can cost if it goes wrong; `unstated` is shown as "not stated". */
export type Level = "low" | "medium" | "high" | "unstated";
/** A card's severity: where the level came from (`rule` Funtown's permission rule, `agent` a header word or a plan's "How serious" line, `kind` a plan's default) and why, in one line. */
export type Severity = { level: Level; reason: string; source: "rule" | "agent" | "kind" };
/** What one question of a question card carries: the agent's level for it and the index of its recommended option, or null. */
export type QuestionRating = { level: Level; pick: number | null };
/** A held request waiting for the user's answer. */
export type Card = {
  /** Server-made, unique per start. */
  id: string;
  /** The session_id of the lead it came from. */
  lead: string;
  /** The agent_id when a subagent asks, else null. */
  agent: string | null;
  kind: "permission" | "question" | "plan";
  tool: string;
  /** The tool_input as sent. */
  input: Record<string, unknown>;
  /** The hook payload's cwd. */
  cwd: string;
  /** The hook's `funtown.at`. */
  at: number;
  /** How serious the card is; on a question card, the several-questions rule over `questions`. */
  severity: Severity;
  /** On a question card only: one entry per question of `input.questions`, in order. */
  questions?: QuestionRating[];
};
export type Town = {
  houses: House[];
  /** The open cards of listed leads, oldest first. */
  cards: Card[];
  /** When this server started (Date.now()); a page that sees it change holds a stale token. */
  started: number;
  /** The installed Claude Code's version, and one line per feature that won't work with it. */
  claude: { version: string | null; problems: string[] };
  /** The id of the avatar the user chose for the king; absent when none is chosen. */
  avatar?: string;
};
