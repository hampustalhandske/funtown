import { defineConfig } from "@playwright/test";
import { E2E_FAKE_DIR, FakeClaude } from "./tests/fake-claude.ts";

// The web server runs this fake `claude`; the specs steer it through files in its folder.
const fake = FakeClaude.install(E2E_FAKE_DIR);

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://127.0.0.1:4799" },
  webServer: {
    command: "vite build && node server/main.ts",
    url: "http://127.0.0.1:4799",
    env: { FUNTOWN_PORT: "4799", FUNTOWN_CLAUDE: fake.path },
    reuseExistingServer: false,
  },
});
