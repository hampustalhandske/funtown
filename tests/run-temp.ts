import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Puts a whole test run under one temp folder, so no test leaves files behind, locally or on
 * CI. The first call in a run makes the folder and points `TMPDIR` (what `os.tmpdir()` gives)
 * at it; worker and child processes started afterwards inherit it. Later calls, such as the
 * config being loaded again inside a worker, change nothing. Gives a function that removes the
 * folder; only the call that made it removes anything.
 */
export function runTemp(): () => void {
  if (process.env.FUNTOWN_TEST_TMP) return () => {};
  const root = mkdtempSync(join(tmpdir(), "funtown-test-"));
  process.env.FUNTOWN_TEST_TMP = root;
  process.env.TMPDIR = root;
  return () => rmSync(root, { recursive: true, force: true });
}

/**
 * Vitest's global setup: one temp folder for the run, removed when it ends. Runs the fake
 * `claude` and the fake shell once each, so macOS checks their one copies before the workers
 * start (see fake-claude.ts).
 */
export default async function setup(): Promise<() => void> {
  const done = runTemp();
  const { FakeClaude } = await import("./fake-claude.ts");
  const fake = FakeClaude.create();
  execFileSync(fake.path, ["--version"]);
  execFileSync(fake.shell, [], { env: { ...process.env, FAKE_SHELL_EXIT: "0" } });
  return done;
}
