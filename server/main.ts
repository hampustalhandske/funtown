import { homedir } from "node:os";
import { join } from "node:path";
import { startServer } from "./app.ts";

const { url } = await startServer({
  port: Number(process.env.FUNTOWN_PORT ?? 4777),
  claudeDir: process.env.FUNTOWN_CLAUDE_DIR ?? join(homedir(), ".claude"),
});
console.log(`Funtown running at ${url}`);
