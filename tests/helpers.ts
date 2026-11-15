import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { startServer } from "../server/app.ts";
import { FakeClaude, type Listed } from "./fake-claude.ts";
import type { Town } from "../server/types.ts";

export type Json = Record<string, unknown>;

type Server = Awaited<ReturnType<typeof startServer>> & { fake: FakeClaude };
type StartOptions = Omit<Parameters<typeof startServer>[0], "port" | "claude">;
const open: Server[] = [];
const fakes: FakeClaude[] = [];
const dirs: string[] = [];

/** A folder that exists, with symlinks resolved so a child process reports the same path. */
export function realDir(): string {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "funtown-proj-")));
  dirs.push(d);
  return d;
}

/** A fake `claude` removed after the test. */
export function fakeClaude(): FakeClaude {
  const f = FakeClaude.create();
  fakes.push(f);
  return f;
}

/** A minimal built page in a fresh temp folder, so served-page tests do not depend on `vite build`. */
function minimalPage(): string {
  const page = mkdtempSync(join(tmpdir(), "funtown-page-"));
  dirs.push(page);
  writeFileSync(join(page, "index.html"), "<!doctype html><html><head><title>t</title></head><body></body></html>");
  return page;
}

/**
 * Starts a server on a free port with a fake `claude` (never the real one), polling every
 * `pollMs` (default 100). `fake.list(...)` before or after steers what it lists. Closed after each test.
 */
export async function start(opts: StartOptions & { fake?: FakeClaude } = {}): Promise<Server> {
  const { fake = fakeClaude(), ...rest } = opts;
  const s = await startServer({ port: 0, pollMs: 100, distDir: minimalPage(), ...rest, claude: fake.path });
  const server = { ...s, fake };
  open.push(server);
  return server;
}
afterEach(async () => {
  await Promise.all(open.splice(0).map((s) => s.close()));
  for (const f of fakes.splice(0)) f.dispose();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** The token the server put in the served page. */
export async function tokenOf(url: string): Promise<string> {
  const html = await (await fetch(`${url}/`)).text();
  const m = /<meta name="funtown-token" content="([0-9a-f]+)"/.exec(html);
  if (!m) throw new Error("the served page has no funtown-token meta tag");
  return m[1];
}

/** A listed session; `sessionId` and `cwd` are required, the rest has fixed defaults. */
export const listed = (sessionId: string, cwd: string, over: Partial<Listed> = {}): Listed => ({
  sessionId, cwd, kind: "interactive", status: "idle", name: sessionId, pid: 1, startedAt: 1, ...over,
});

/** A listed background session whose short id is the first 8 characters of `sessionId`. */
export const listedBg = (sessionId: string, cwd: string, over: Partial<Listed> = {}): Listed =>
  listed(sessionId, cwd, { kind: "background", id: sessionId.slice(0, 8), ...over });

/** Resolves once `ok()` holds, polling every 20 ms; throws after `ms`. */
export async function until(ok: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error("condition never held");
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Posts one hook event to a running server and returns the HTTP status. */
export async function post(url: string, event: Json, headers: Record<string, string> = {}): Promise<number> {
  const res = await fetch(`${url}/events`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(event),
  });
  return res.status;
}

/** Opens GET /stream and resolves with the first Town state satisfying `ok`, or rejects after `ms`. */
export async function townWhere(url: string, ok: (t: Town) => boolean, ms = 3000): Promise<Town> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  let last: Town | undefined;
  try {
    const res = await fetch(`${url}/stream`, { signal: ctl.signal });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const frames = buf.split("\n\n");
      buf = frames.pop()!;
      for (const f of frames) {
        if (!f.includes("event: state")) continue;
        const data = f.split("\n").find((l) => l.startsWith("data:"))!.slice(5).trim();
        last = JSON.parse(data) as Town;
        if (ok(last)) return last;
      }
    }
  } catch (e) {
    if (!ctl.signal.aborted) throw e;
  } finally {
    clearTimeout(timer);
    ctl.abort();
  }
  throw new Error(`town never matched; last state: ${JSON.stringify(last)}`);
}

export const leadsOf = (t: Town) => t.houses.flatMap((h) => h.leads);
