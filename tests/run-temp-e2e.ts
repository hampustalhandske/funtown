import { rmSync } from "node:fs";
import { runTemp } from "./run-temp.ts";

// Imported first by playwright.config.ts: gives the run (and the web server it starts) one temp folder.
runTemp();

/** Playwright's global teardown: removes the run's temp folder. */
export default function teardown(): void {
  const root = process.env.FUNTOWN_TEST_TMP;
  if (root) rmSync(root, { recursive: true, force: true });
}
