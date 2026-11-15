import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://127.0.0.1:4799" },
  webServer: {
    command: "vite build && node server/main.ts",
    url: "http://127.0.0.1:4799",
    env: { FUNTOWN_PORT: "4799" },
    reuseExistingServer: false,
  },
});
