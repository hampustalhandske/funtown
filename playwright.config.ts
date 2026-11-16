import { defineConfig } from "@playwright/test";
// First, so the run's temp folder is set before fake-claude.ts reads os.tmpdir().
import "./tests/run-temp-e2e.ts";
import { join } from "node:path";
import { E2E_FAKE_DIR, FakeClaude } from "./tests/fake-claude.ts";

// The web server runs this fake `claude`; the specs steer it through files in its folder.
const fake = FakeClaude.install(E2E_FAKE_DIR);
// Set FUNTOWN_E2E_PORT to run beside another checkout's browser tests.
const port = process.env.FUNTOWN_E2E_PORT ?? "4799";

export default defineConfig({
  testDir: "tests/e2e",
  // Every spec steers the one fake `claude` list, so spec files must not run side by side.
  workers: 1,
  // On CI a committed `test.only` fails the run instead of skipping every other test.
  forbidOnly: !!process.env.CI,
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: "vite build && node server/main.ts",
    url: `http://127.0.0.1:${port}`,
    // Every file the server writes goes to the run's temp folder, never the home folder.
    env: {
      FUNTOWN_PORT: port,
      FUNTOWN_CLAUDE: fake.path,
      FUNTOWN_JOURNAL: join(E2E_FAKE_DIR, "journal.jsonl"),
      FUNTOWN_ANSWERS: join(E2E_FAKE_DIR, "answers.jsonl"),
      FUNTOWN_LOG: join(E2E_FAKE_DIR, "errors.log"),
      FUNTOWN_RUN: join(E2E_FAKE_DIR, "running.json"),
      FUNTOWN_SWITCHES: join(E2E_FAKE_DIR, "switches.jsonl"),
    },
    reuseExistingServer: false,
  },
});
