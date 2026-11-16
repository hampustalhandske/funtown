import { homedir } from "node:os";
import { join } from "node:path";
import { startServer } from "./app.ts";

const { url, claude } = await startServer({
  port: Number(process.env.FUNTOWN_PORT ?? 4777),
  claude: process.env.FUNTOWN_CLAUDE,
  answerLog: process.env.FUNTOWN_ANSWERS ?? join(homedir(), ".funtown", "answers.jsonl"),
  journal: process.env.FUNTOWN_JOURNAL ?? join(homedir(), ".funtown", "journal.jsonl"),
});
for (const problem of claude.problems) console.error(`funtown: ${problem}`);
console.log(`Funtown running at ${url}`);
