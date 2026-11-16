import { readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { startServer } from "./app.ts";
import { defaultErrorLog, serverLogger } from "./errors.ts";

const errorLog = process.env.FUNTOWN_LOG ?? defaultErrorLog();
const runFile = process.env.FUNTOWN_RUN ?? join(homedir(), ".funtown", "running.json");
const logError = serverLogger(errorLog);
const fail = (step: string, err: unknown) => {
  logError(step, err);
  process.exit(1);
};
const crash = (err: unknown) => fail("crash", err);
process.on("uncaughtException", crash);
process.on("unhandledRejection", crash);

/** True when a process with `pid` is alive. */
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
};

let started;
try {
  started = await startServer({
    port: Number(process.env.FUNTOWN_PORT ?? 4777),
    claude: process.env.FUNTOWN_CLAUDE,
    answerLog: process.env.FUNTOWN_ANSWERS ?? join(homedir(), ".funtown", "answers.jsonl"),
    journal: process.env.FUNTOWN_JOURNAL ?? join(homedir(), ".funtown", "journal.jsonl"),
    errorLog,
    switchLog: process.env.FUNTOWN_SWITCHES ?? join(homedir(), ".funtown", "switches.jsonl"),
  });
} catch (err) {
  fail("start", err);
}
const { url, claude, close } = started!;

try {
  const last = JSON.parse(readFileSync(runFile, "utf8")) as { pid: number; startedAt: number };
  if (last.pid !== process.pid && !alive(last.pid)) {
    const msg = `the last run (pid ${last.pid}, started ${new Date(last.startedAt).toISOString()}) ended without shutting down`;
    logError("unclean-exit", msg);
  }
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") logError("unclean-exit", err);
}
try {
  mkdirSync(dirname(runFile), { recursive: true });
  writeFileSync(runFile, JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
} catch (err) {
  logError("run file", err);
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void close().finally(() => {
      rmSync(runFile, { force: true });
      process.exit(0);
    });
  });
}

for (const problem of claude.problems) console.error(`funtown: ${problem}`);
console.log(`Funtown running at ${url}`);
