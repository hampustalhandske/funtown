import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const url = process.env.FUNTOWN_URL ?? "http://127.0.0.1:4777";
const logPath = process.env.FUNTOWN_LOG ?? join(homedir(), ".funtown", "hook.log");

const deadline = Date.now() + 900;

/** Milliseconds left before the overall deadline; throws once it has passed. */
function remaining(): number {
  const left = deadline - Date.now();
  if (left <= 0) throw new Error("deadline exceeded (900 ms)");
  return left;
}

function log(line: string): void {
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // Logging is best effort; the hook still exits 0.
  }
}

/** Returns a process's tty (null when it has none) and parent pid, or null when it is gone. */
function psRow(pid: number): { tty: string | null; ppid: number } | null {
  try {
    const out = execFileSync("ps", ["-o", "tty=,ppid=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: Math.min(300, remaining()),
    }).trim();
    const [tty, ppid] = out.split(/\s+/);
    if (!ppid) return null;
    return { tty: tty === "??" || tty === "?" ? null : tty, ppid: Number(ppid) };
  } catch {
    return null;
  }
}

/** The tty of the nearest ancestor that has one: the claude session. */
function findTty(): string | null {
  let pid = process.ppid;
  for (let depth = 0; depth < 4 && pid > 1; depth++) {
    if (deadline - Date.now() <= 0) return null;
    const row = psRow(pid);
    if (!row) return null;
    if (row.tty) return row.tty;
    pid = row.ppid;
  }
  return null;
}

// The hook must never fail or stall Claude: any error is logged and the exit code stays 0.
try {
  const event = JSON.parse(readFileSync(0, "utf8"));
  event.funtown = {
    tty: findTty(),
    term_program: process.env.TERM_PROGRAM ?? null,
    at: Date.now(),
  };
  const res = await fetch(`${url}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(remaining()),
  });
  if (!res.ok) log(`POST ${url}/events returned ${res.status}`);
} catch (err) {
  log(String(err));
}
process.exit(0);
