import { defineConfig } from "@playwright/test";
// First, so the run's temp folder is set before fake-claude.ts reads os.tmpdir().
import "./tests/run-temp-e2e.ts";
import { join } from "node:path";
import { E2E_FAKE_DIR, FakeClaude } from "./tests/fake-claude.ts";

// The web server runs this fake `claude`; the specs steer it through files in its folder.
const fake = FakeClaude.install(E2E_FAKE_DIR);

export default defineConfig({
  testDir: "tests/e2e",
  // Removes the run's temp folder (see tests/run-temp-e2e.ts) when the run ends.
  globalTeardown: "./tests/run-temp-e2e.ts",
  // Every spec steers the one fake `claude` list, so spec files must not run side by side.
  workers: 1,
  // On CI a committed `test.only` fails the run instead of skipping every other test.
  forbidOnly: !!process.env.CI,
  use: { baseURL: "http://127.0.0.1:4799" },
  webServer: {
    command: "vite build && node server/main.ts",
    url: "http://127.0.0.1:4799",
    env: { FUNTOWN_PORT: "4799", FUNTOWN_CLAUDE: fake.path, FUNTOWN_JOURNAL: join(E2E_FAKE_DIR, "journal.jsonl") },
    reuseExistingServer: false,
  },
});
