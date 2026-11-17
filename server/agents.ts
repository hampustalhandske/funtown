import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Town } from "./types.ts";

export const execFileAsync = promisify(execFile);

/** One entry of `claude agents --json`, as far as Funtown reads it. */
export type Listed = {
  sessionId: string;
  id?: string;
  name?: string;
  kind: string;
  cwd: string;
  status?: string;
  /** "failed" when the session's last turn failed. */
  state?: string;
  waitingFor?: string;
};

const MIN_VERSION = "2.1.325";
const FEATURES = [
  "Session list (claude agents --json)",
  "Live terminal (claude attach)",
  "New session (claude --bg)",
];
const BG_SETTINGS = JSON.stringify({ worktree: { bgIsolation: "none" } });

/**
 * The server's environment without the `CLAUDE*` (except `CLAUDE_CONFIG_DIR`) and `AI_AGENT`
 * variables, which make a child `claude` behave as part of the session that started Funtown.
 */
export function claudeEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => k === "CLAUDE_CONFIG_DIR" || !/^(CLAUDE|AI_AGENT)/.test(k)));
}

/** Runs `claude` with `args` (never through a shell) and gives its stdout; kills it after `timeout` ms. */
async function run(claude: string, args: string[], cwd?: string, timeout = 30_000): Promise<string> {
  return (await execFileAsync(claude, args, { env: claudeEnv(), cwd, timeout })).stdout;
}

/** True when dotted version `a` is lower than `b`. */
function older(a: string, b: string): boolean {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
}

/**
 * Asks `claude --version` and gives the version (null when the call fails or prints none)
 * and one line per feature that won't work; no lines at `MIN_VERSION` or later.
 */
export async function checkVersion(claude: string): Promise<Town["claude"]> {
  let reason: string;
  let version: string | null = null;
  try {
    version = /^(\d+\.\d+\.\d+)/.exec((await run(claude, ["--version"])).trim())?.[1] ?? null;
    if (version && !older(version, MIN_VERSION)) return { version, problems: [] };
    reason = version ? `Claude Code ${version} is older than ${MIN_VERSION}` : "`claude --version` printed no version";
  } catch (err) {
    const { stderr, message } = err as { stderr?: string; message: string };
    reason = `\`claude --version\` failed: ${(stderr?.trim() || message).replace(/\s*\n\s*/g, " ")}`;
  }
  return { version, problems: FEATURES.map((f) => `${f} won't work: ${reason}.`) };
}

/** The sessions `claude agents --json` lists; rejects when the call fails or its output isn't a list of sessions. */
export async function listAgents(claude: string): Promise<Listed[]> {
  const list: unknown = JSON.parse(await run(claude, ["agents", "--json"]));
  const valid = (s: Partial<Listed> | null) => typeof s?.sessionId === "string" && typeof s.cwd === "string";
  if (!Array.isArray(list) || !list.every(valid)) throw new Error("output is not a list of sessions");
  return list;
}

/**
 * Starts `claude --bg` in `cwd` and gives the short id it prints; rejects with the reason.
 * Without a `prompt` it is an empty session with no worktree; with one, a run of that prompt
 * (one argument) in its own worktree, Claude Code's default isolation.
 */
export async function startBackground(claude: string, cwd: string, prompt?: string): Promise<string> {
  let out: string;
  try {
    out = await run(claude, prompt === undefined ? ["--bg", "--settings", BG_SETTINGS] : ["--bg", prompt], cwd, 120_000);
  } catch (err) {
    const { stderr, message } = err as { stderr?: string; message: string };
    throw new Error(stderr?.trim() || message, { cause: err });
  }
  const id = /\b[0-9a-f]{8}\b/.exec(out)?.[0];
  if (!id) throw new Error(`claude --bg printed no session id: ${out.trim()}`);
  return id;
}
