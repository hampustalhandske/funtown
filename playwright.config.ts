import { join } from "node:path";
import { tmpdir } from "node:os";
import { defineConfig } from "@playwright/test";

// A path that does not exist: the rebuild finds no sessions there.
const emptyClaudeDir = join(tmpdir(), "funtown-e2e-no-claude-dir");

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://127.0.0.1:4799" },
  webServer: {
    command: "vite build && node server/main.ts",
    url: "http://127.0.0.1:4799",
    env: { FUNTOWN_PORT: "4799", FUNTOWN_CLAUDE_DIR: emptyClaudeDir },
    reuseExistingServer: false,
  },
});
