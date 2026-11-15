import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

const emptyClaudeDir = mkdtempSync(join(tmpdir(), "funtown-e2e-claude-"));

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
