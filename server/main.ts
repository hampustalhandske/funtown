import { startServer } from "./app.ts";

const { url } = await startServer({ port: Number(process.env.FUNTOWN_PORT ?? 4777) });
console.log(`Funtown running at ${url}`);
