import { defineConfig } from "@playwright/test";
// First, so the run's temp folder is set before fake-claude.ts reads os.tmpdir().
import "./tests/run-temp-e2e.ts";
import { join } from "node:path";
import { E2E_FAKE_DIR, E2E_PORT, E2E_URL, FakeClaude } from "./tests/fake-claude.ts";

// The web server runs this fake `claude`; the specs steer it through files in its folder.
const fake = FakeClaude.install(E2E_FAKE_DIR);

export default defineConfig({
  testDir: "tests/e2e",
  // Every spec steers the one fake `claude` list, so spec files must not run side by side.
  workers: 1,
  // On CI a committed `test.only` fails the run instead of skipping every other test.
  forbidOnly: !!process.env.CI,
  // Chromium draws WebGL on the Mac's GPU through Metal, as the app does; headless it would fall back to a software
  // renderer, where one frame of the island takes about 450 ms and blocks the page between frames.
  use: { baseURL: E2E_URL, launchOptions: { args: ["--use-angle=metal"] } },
  webServer: {
    command: "vite build && node server/main.ts",
    url: E2E_URL,
    // Every file the server writes goes to the run's temp folder, never the home folder.
    env: {
      FUNTOWN_PORT: E2E_PORT,
      FUNTOWN_CLAUDE: fake.path,
      FUNTOWN_JOURNAL: join(E2E_FAKE_DIR, "journal.jsonl"),
      FUNTOWN_ANSWERS: join(E2E_FAKE_DIR, "answers.jsonl"),
      FUNTOWN_LOG: join(E2E_FAKE_DIR, "errors.log"),
      FUNTOWN_RUN: join(E2E_FAKE_DIR, "running.json"),
      FUNTOWN_SWITCHES: join(E2E_FAKE_DIR, "switches.jsonl"),
      // The fake `claude` also answers `gh pr list`, so no test runs the real gh.
      FUNTOWN_GH: fake.path,
      FUNTOWN_STEWARD: join(E2E_FAKE_DIR, "steward"),
      // The Shell tab runs this fake login shell, never the user's own, and the project list stays out of the home folder.
      SHELL: fake.shell,
      FUNTOWN_PROJECTS: join(E2E_FAKE_DIR, "projects.json"),
      FUNTOWN_AVATAR: join(E2E_FAKE_DIR, "avatar.json"),
    },
    reuseExistingServer: false,
  },
});
