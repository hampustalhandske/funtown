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
};
export type Lead = Character & {
  tty: string | null;
  termProgram: string | null;
  subagents: Character[];
  kind: "terminal" | "background";
  /** The id `claude attach` takes; null for a terminal session. */
  shortId: string | null;
};
export type House = { project: string; cwd: string; leads: Lead[] };
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
};
export type Town = {
  houses: House[];
  /** The open cards of listed leads, oldest first. */
  cards: Card[];
  /** When this server started (Date.now()); a page that sees it change holds a stale token. */
  started: number;
  /** The installed Claude Code's version, and one line per feature that won't work with it. */
  claude: { version: string | null; problems: string[] };
};
