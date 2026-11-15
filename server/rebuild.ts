import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { HookEvent, TownState } from "./town.ts";

type Exec = (file: string, args: string[]) => Promise<string>;
export type Session = { pid: number; sessionId: string; cwd: string; startedAt: number; status?: string; procStart?: string };
type Line = { type?: string; timestamp?: string; message?: { content?: unknown } };
type ToolUse = { name: string; input?: { command?: unknown } };

/** Directory entries, or none when the directory does not exist. */
async function list(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/** Writes one stderr line naming what rebuild skipped and why. */
export function warn(what: string, err: unknown): void {
  console.error(`funtown: rebuild skipped ${what}: ${(err as Error).message}`);
}

/** The JSON objects on a transcript's lines; a line that is not JSON is skipped. */
async function readLines(file: string): Promise<Line[]> {
  const lines: Line[] = [];
  for (const text of (await readFile(file, "utf8")).split("\n")) {
    try {
      lines.push(JSON.parse(text));
    } catch {
      // a blank or half-written line
    }
  }
  return lines;
}

/** The last tool call in a transcript, or null when it has none. */
function lastToolUse(lines: Line[]): ToolUse | null {
  for (const line of lines.toReversed()) {
    const content = line.type === "assistant" ? line.message?.content : null;
    if (!Array.isArray(content)) continue;
    const tool = (content as (ToolUse & { type?: string })[]).findLast((c) => c?.type === "tool_use");
    if (tool) return tool;
  }
  return null;
}

/** Events that give a character the step `tool` and no current activity. */
function stepEvents(base: HookEvent, tool: ToolUse | null): HookEvent[] {
  if (!tool) return [];
  const call = { ...base, tool_name: tool.name, tool_input: { command: tool.input?.command } };
  return [{ ...call, hook_event_name: "PreToolUse" }, { ...call, hook_event_name: "PostToolUse" }];
}

/** True unless no process has this pid. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ESRCH") return false;
    if ((err as NodeJS.ErrnoException).code === "EPERM") return true;
    throw err;
  }
}

/**
 * The session files under `claudeDir`, and the pids (from the file names) of those that can't
 * be read or parsed; each of those is skipped with a stderr line.
 */
export async function readSessions(claudeDir: string): Promise<{ sessions: Session[]; unreadable: Set<number> }> {
  const sessions: Session[] = [];
  const unreadable = new Set<number>();
  for (const name of (await list(join(claudeDir, "sessions"))).filter((n) => n.endsWith(".json"))) {
    try {
      sessions.push(JSON.parse(await readFile(join(claudeDir, "sessions", name), "utf8")) as Session);
    } catch (err) {
      warn(`session file ${name}`, err);
      unreadable.add(Number.parseInt(name, 10));
    }
  }
  return { sessions, unreadable };
}

/**
 * The tty and TERM_PROGRAM of a session's process, or null when the session is not live: its
 * pid is dead, or `ps` reports a start time other than `procStart` (a session file without
 * `procStart` needs only a live pid). Rejects when the `ps` call fails.
 */
export async function liveCheck(
  s: Session,
  exec: Exec,
): Promise<{ tty: string | null; termProgram: string | null } | null> {
  if (!isAlive(s.pid)) return null;
  const out = await exec("env", ["LC_ALL=C", "TZ=UTC", "ps", "-wwE", "-o", "lstart=,tty=,command=", "-p", String(s.pid)]);
  const tokens = out.trim().split(/\s+/);
  if (s.procStart !== undefined && tokens.slice(0, 5).join(" ") !== s.procStart.trim().split(/\s+/).join(" ")) return null;
  return {
    tty: tokens[5] && tokens[5] !== "??" ? tokens[5] : null,
    termProgram: out.match(/(?:^|\s)TERM_PROGRAM=(\S+)/)?.[1] ?? null,
  };
}

/**
 * Applies to `town` the events that bring it to the state of the sessions already running
 * under `claudeDir`: live ones in `startedAt` order, with their step, subagents, tty and
 * terminal program. Returns those sessions' pids by session id. A missing `sessions/` folder changes
 * nothing. Skipped, each with one line on stderr: a session file that can't be read or parsed,
 * a session whose `ps` call fails, and a subagent whose `.meta.json` can't be read or parsed.
 * A subagent without a transcript has no step.
 */
export async function rebuild(town: TownState, claudeDir: string, exec: Exec): Promise<Map<string, number>> {
  const sessions: (Session & { tty: string | null; termProgram: string | null })[] = [];
  for (const s of (await readSessions(claudeDir)).sessions) {
    try {
      const live = await liveCheck(s, exec);
      if (live) sessions.push({ ...s, tty: live.tty, termProgram: live.termProgram });
    } catch (err) {
      warn(`pid ${s.pid}`, err);
    }
  }
  sessions.sort((a, b) => a.startedAt - b.startedAt);

  const projectsDir = join(claudeDir, "projects");
  const projects = await list(projectsDir);
  for (const s of sessions) {
    let projectDir: string | null = null;
    let leadLines: Line[] = [];
    for (const p of projects) {
      try {
        leadLines = await readLines(join(projectsDir, p, `${s.sessionId}.jsonl`));
        projectDir = join(projectsDir, p);
        break;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== "ENOENT" && code !== "ENOTDIR") throw err;
      }
    }
    const base: HookEvent = { session_id: s.sessionId, cwd: s.cwd };
    town.apply({ ...base, hook_event_name: "SessionStart", funtown: { tty: s.tty, term_program: s.termProgram } });

    if (projectDir) {
      const subDir = join(projectDir, s.sessionId, "subagents");
      const agents: { id: string; type: string; finished: boolean; at: string; tool: ToolUse | null }[] = [];
      for (const name of (await list(subDir)).filter((n) => n.endsWith(".meta.json"))) {
        const id = name.slice("agent-".length, -".meta.json".length);
        let meta: { agentType: string; finished: boolean };
        try {
          meta = JSON.parse(await readFile(join(subDir, name), "utf8"));
        } catch (err) {
          warn(`subagent file ${name}`, err);
          continue;
        }
        const lines = await readLines(join(subDir, `agent-${id}.jsonl`)).catch((err) => {
          if (err.code !== "ENOENT") throw err;
          return [];
        });
        agents.push({ id, type: meta.agentType, finished: meta.finished, at: String(lines[0]?.timestamp ?? ""), tool: lastToolUse(lines) });
      }
      agents.sort((a, b) => a.at.localeCompare(b.at));
      for (const a of agents) {
        const agent = { ...base, agent_id: a.id, agent_type: a.type };
        town.apply({ ...agent, hook_event_name: "SubagentStart" });
        for (const e of stepEvents(agent, a.tool)) town.apply(e);
        if (a.finished) town.apply({ ...agent, hook_event_name: "SubagentStop" });
      }
      for (const e of stepEvents(base, lastToolUse(leadLines))) town.apply(e);
    }
    if (s.status === "idle") town.apply({ ...base, hook_event_name: "Stop" });
  }
  return new Map(sessions.map((s) => [s.sessionId, s.pid]));
}
