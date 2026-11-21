import { execFileSync, spawn } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import WebSocket from "ws";
import { startServer } from "../server/app.ts";
import { FakeClaude } from "./fake-claude.ts";
import type { Town } from "../server/types.ts";

export type Json = Record<string, unknown>;

type Server = Awaited<ReturnType<typeof startServer>> & { fake: FakeClaude };
type StartOptions = Omit<Parameters<typeof startServer>[0], "port" | "claude">;
const open: Server[] = [];
const fakes: FakeClaude[] = [];
const dirs: string[] = [];
const holds: AbortController[] = [];
const sockets: WebSocket[] = [];

/** Sets the variables a real terminal gives the server, runs `body`, and puts the old values back. */
export async function inTerminal(body: () => Promise<void>): Promise<void> {
  const set = {
    TERM: "screen", COLORTERM: "24bit", TERM_PROGRAM: "iTerm.app", TERM_PROGRAM_VERSION: "3.5", TERM_SESSION_ID: "w0t0p0",
    LC_TERMINAL: "iTerm2", LC_TERMINAL_VERSION: "3.5", TMUX: "/tmp/tmux-1/default,1,0", TMUX_PANE: "%1", STY: "123.pts-0",
    VTE_VERSION: "7000", WT_SESSION: "abc", TERMINAL_EMULATOR: "JetBrains", ITERM_SESSION_ID: "w0t0p0", KITTY_WINDOW_ID: "1",
    GHOSTTY_RESOURCES_DIR: "/x", WEZTERM_PANE: "1", ALACRITTY_LOG: "/x", KONSOLE_VERSION: "1",
  };
  const before = Object.fromEntries(Object.keys(set).map((k) => [k, process.env[k]]));
  Object.assign(process.env, set);
  try {
    await body();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

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
 * Starts a server on a free port with a fake `claude` (never the real one), also used as its
 * `gh` unless one is given, polling every `pollMs` (default 100). `fake.list(...)` before or
 * after steers what it lists, `fake.prs(...)` the PRs. Closed after each test.
 */
export async function start(opts: StartOptions & { fake?: FakeClaude } = {}): Promise<Server> {
  const { fake = fakeClaude(), ...rest } = opts;
  const s = await startServer({ port: 0, pollMs: 100, distDir: minimalPage(), gh: fake.path, shell: fake.shell, ...rest, claude: fake.path });
  const server = { ...s, fake };
  open.push(server);
  return server;
}
afterEach(async () => {
  for (const h of holds.splice(0)) h.abort();
  for (const w of sockets.splice(0)) w.terminate();
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

export { listed, listedBg, pr } from "./fake-claude.ts";

/** The text of each request in what an `attach` received: a bracketed paste followed by `\r`. */
export const pastes = (input: string) => [...input.matchAll(/\x1b\[200~([\s\S]*?)\x1b\[201~\r/g)].map((m) => m[1]);

/** The house whose folder is `cwd`, if the town has one. */
export const houseAt = (t: Town, cwd: string) => t.houses.find((h) => h.cwd === cwd);

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

/** POSTs a hook payload to /hold; `reply` settles when the server answers, `abort` closes the request (at the latest after the test). */
export function hold(url: string, payload: Json, headers: Record<string, string> = {}) {
  const ctl = new AbortController();
  holds.push(ctl);
  const reply = fetch(`${url}/hold`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(payload),
    signal: ctl.signal,
  });
  reply.catch(() => {});
  return { reply, abort: () => ctl.abort() };
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

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The first lead of the first Town state in which `ok(firstLead)` holds. */
export const leadWhere = async (url: string, ok: (l: ReturnType<typeof leadsOf>[number]) => boolean) =>
  leadsOf(await townWhere(url, (t) => ok(leadsOf(t)[0])))[0];

export const CWD = "/work/demo-app";
let clock = Date.now();
/** A hook event for `session` in CWD whose `funtown.at` is strictly later than any made before. */
export const ev = (name: string, extra: Json = {}, session = "s1") => ({
  hook_event_name: name,
  session_id: session,
  cwd: CWD,
  funtown: { tty: "ttys009", term_program: "TestTerm", at: (clock = Math.max(clock + 1, Date.now())) },
  ...extra,
});

export type ErrorLine = { source: string; step: string; message: string };
const ERROR_LINE = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z) (hook|hold|server) (.+?): (.*)$/;

/**
 * The lines of the error log at `path` (none when the file doesn't exist), each split into
 * source, step and message. Throws on a line that is not `<ISO time> <source> <step>: <message>`.
 */
export function errorLines(path: string): ErrorLine[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => {
    const m = ERROR_LINE.exec(line);
    if (!m || new Date(m[1]).toISOString() !== m[1]) throw new Error(`not an error-log line: ${JSON.stringify(line)}`);
    return { source: m[2], step: m[3], message: m[4] };
  });
}

/** The JSON lines of the file at `path`, parsed (none when the file doesn't exist). */
export function jsonLines<T = Json>(path: string): T[] {
  return existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as T) : [];
}

let fakePsDir: string | undefined;

/**
 * A folder holding a `ps` that answers at once "no tty, parent 1", made once per test worker
 * in the run's temp folder. It is run once here, so macOS's first-run check of a new
 * executable (about a second) never lands inside a hook's 300 ms ps timeout.
 */
function fakePs(): string {
  if (!fakePsDir) {
    fakePsDir = mkdtempSync(join(tmpdir(), "funtown-fake-ps-"));
    const ps = join(fakePsDir, "ps");
    writeFileSync(ps, "#!/bin/sh\necho '?? 1'\n");
    chmodSync(ps, 0o755);
    execFileSync(ps);
  }
  return fakePsDir;
}

/**
 * Runs the hook `script` against `url` with `input` on stdin and its error log in a fresh temp
 * folder; resolves with its exit code, stdout, run time and error-log lines. Its tty lookup
 * uses the fake `ps`, so how fast the machine's own `ps` is never adds a line.
 */
export async function runScript(script: string, url: string, input: string) {
  const log = join(realDir(), "errors.log");
  const env = { ...process.env, PATH: `${fakePs()}:${process.env.PATH}`, FUNTOWN_URL: url, FUNTOWN_LOG: log };
  const t0 = Date.now();
  // Asynchronous, as spawnSync would block a test server's event loop.
  const child = spawn(process.execPath, [script], { env });
  let out = "";
  child.stdout.on("data", (c) => (out += c));
  child.stdin.end(input);
  const code = await new Promise((r) => child.on("close", r));
  return { code, out, ms: Date.now() - t0, lines: errorLines(log) };
}

/**
 * Paths and env for one `node server/main.ts` child: every Funtown file, and HOME, in a fresh
 * temp folder, a fake `claude` that is also its `gh`, and port 0.
 */
export function mainEnv() {
  const dir = realDir();
  const fake = fakeClaude();
  const paths = {
    log: join(dir, "errors.log"), run: join(dir, "running.json"), switches: join(dir, "switches.jsonl"),
    home: join(dir, "home"), steward: join(dir, "steward"),
  };
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: paths.home,
    FUNTOWN_PORT: "0",
    FUNTOWN_CLAUDE: fake.path,
    FUNTOWN_GH: fake.path,
    FUNTOWN_STEWARD: paths.steward,
    FUNTOWN_LOG: paths.log,
    FUNTOWN_RUN: paths.run,
    FUNTOWN_SWITCHES: paths.switches,
    FUNTOWN_ANSWERS: join(dir, "answers.jsonl"),
    FUNTOWN_JOURNAL: join(dir, "journal.jsonl"),
  };
  return { dir, ...paths, env, fake };
}

/** A loopback URL with no listener: a free port, closed again, so a connection to it is refused. */
export async function refusedUrl(): Promise<string> {
  const s = createNetServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as { port: number }).port;
  await new Promise((r) => s.close(r));
  return `http://127.0.0.1:${port}`;
}

/** POSTs JSON to `path` as the page would: its Origin and token, unless `headers` replaces them. */
export async function postPage(s: { url: string }, path: string, body: unknown, headers?: Record<string, string>): Promise<Response> {
  const h = headers ?? { origin: s.url, "x-funtown-token": await tokenOf(s.url) };
  return fetch(`${s.url}${path}`, { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(body) });
}

/** A path for a projects file in a fresh temp folder; the file itself does not exist yet. */
export const projectsPath = () => join(realDir(), "projects.json");

/** An open /term socket: the output so far, the `shared` counts heard, whether it closed, and a frame sender. */
/** An open /term socket: `closed` says whether it has closed, and `code` the close code it got (null until then). */
export type Conn = { ws: WebSocket; out: () => string; shared: number[]; closed: () => boolean; code: () => number | null; send: (f: object) => void };

/**
 * Opens /term for a session (`{ lead }`) or a project's shell (`{ shell }` a cwd) at 100x30
 * unless sized; `token` and `origin` default to the page's and null leaves them out. Resolves
 * once open, rejects with the HTTP status when the upgrade is refused. Terminated after the test.
 */
export function connect(
  s: { url: string; token: string },
  target: { lead: string } | { shell: string },
  q: { cols?: number; rows?: number; token?: string | null; origin?: string | null } = {},
): Promise<Conn> {
  const params = new URLSearchParams({ ...target, cols: String(q.cols ?? 100), rows: String(q.rows ?? 30) });
  if (q.token !== null) params.set("token", q.token ?? s.token);
  const headers = q.origin === null ? {} : { origin: q.origin ?? s.url };
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${s.url.replace("http", "ws")}/term?${params}`, { headers });
    sockets.push(ws);
    let out = "";
    let closed: number | null = null;
    const shared: number[] = [];
    ws.on("message", (m) => {
      const f = JSON.parse(m.toString());
      if (f.t === "out") out += f.d;
      if (f.t === "shared") shared.push(f.n);
    });
    ws.on("close", (code) => (closed = code));
    ws.on("open", () => resolve({ ws, out: () => out, shared, closed: () => closed !== null, code: () => closed, send: (f) => ws.send(JSON.stringify(f)) }));
    ws.on("unexpected-response", (_req, res) => reject(new Error(`status ${res.statusCode}`)));
    ws.on("error", () => {});
  });
}

/** True while a process with `pid` exists. */
export const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
