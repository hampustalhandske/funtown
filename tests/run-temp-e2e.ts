import { runTemp } from "./run-temp.ts";

// Imported first by playwright.config.ts: gives the run (and the web server it starts) one
// temp folder, removed when Playwright's own process exits, after it has stopped the server.
process.on("exit", runTemp());
