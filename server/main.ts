import { startServer } from "./app.ts";

const { url, claude } = await startServer({
  port: Number(process.env.FUNTOWN_PORT ?? 4777),
  claude: process.env.FUNTOWN_CLAUDE,
});
for (const problem of claude.problems) console.error(`funtown: ${problem}`);
console.log(`Funtown running at ${url}`);
