import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { appendError, defaultErrorLog, isRefused } from "../server/errors.ts";

const url = process.env.FUNTOWN_URL ?? "http://127.0.0.1:4777";
const logPath = process.env.FUNTOWN_LOG ?? defaultErrorLog();

const deadline = Date.now() + 800;

/** Milliseconds left before the overall deadline; throws once it has passed. */
function remaining(): number {
  const left = deadline - Date.now();
  if (left <= 0) throw new Error("deadline exceeded (800 ms)");
  return left;
}

const log = (step: string, err: unknown) => appendError(logPath, "hook", step, err);

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
  } catch (err) {
    log("find tty", err);
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
let step = "read event";
try {
  // Input that parses but isn't an object (e.g. `null`) fails below, still under "read event".
  const event = JSON.parse(readFileSync(0, "utf8"));
  const at = Date.now();
  event.funtown = {
    tty: findTty(),
    term_program: process.env.TERM_PROGRAM ?? null,
    at,
  };
  step = "post /events";
  const res = await fetch(`${url}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(remaining()),
  });
  if (!res.ok) log("post /events", `returned ${res.status}`);
} catch (err) {
  if (!(step === "post /events" && isRefused(err))) log(step, err);
}
process.exit(0);
