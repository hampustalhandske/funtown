import { spawn, spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";

const HOOK = resolve(import.meta.dirname, "../hooks/funtown-hook.ts");
const event = {
  hook_event_name: "PreToolUse",
  session_id: "abc123",
  cwd: "/work/demo-app",
  transcript_path: "/work/.claude/projects/demo/abc123.jsonl",
  tool_name: "Bash",
  tool_input: { command: "npm test" },
  extra_unknown_key: { keep: ["me", 1] },
};

function runHook(env: Record<string, string>) {
  const t0 = Date.now();
  const r = spawnSync("node", [HOOK], {
    input: JSON.stringify(event),
    env: { ...process.env, ...env },
    timeout: 5000,
    encoding: "utf8",
  });
  return { status: r.status, ms: Date.now() - t0 };
}

let server: Server | undefined;
afterEach(() => server?.close());

/** A loopback server answering 204 that records each request's method, path, body and arrival time. */
async function captureServer() {
  const bodies: { method?: string; path?: string; body: string; receivedAt: number }[] = [];
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      bodies.push({ method: req.method, path: req.url, body, receivedAt: Date.now() });
      res.statusCode = 204;
      res.end();
    });
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return { port: (server.address() as { port: number }).port, bodies };
}

it("hook_posts_the_event_unchanged_plus_a_funtown_block_to_events", async () => {
  const { port, bodies: got } = await captureServer();

  // spawnSync would block the server's event loop, so run the hook asynchronously.
  const child = spawn("node", [HOOK], {
    env: {
      ...process.env,
      FUNTOWN_URL: `http://127.0.0.1:${port}`,
      FUNTOWN_LOG: join(mkdtempSync(join(tmpdir(), "funtown-hook-")), "hook.log"),
      TERM_PROGRAM: "TestTerm",
    },
  });
  child.stdin.end(JSON.stringify(event));
  const code = await new Promise((r) => child.on("close", r));

  expect(code).toBe(0);
  expect(got).toHaveLength(1);
  expect(got[0]).toMatchObject({ method: "POST", path: "/events" });
  const { funtown, ...rest } = JSON.parse(got[0].body);
  expect(rest).toEqual(event);
  const ps = spawnSync("ps", ["-o", "tty=", "-p", String(process.pid)], { encoding: "utf8" }).stdout.trim();
  expect(funtown.tty).toBe(ps === "??" ? null : ps);
  expect(funtown.term_program).toBe("TestTerm");
  expect(typeof funtown.at).toBe("number");
});

it("hook_exits_0_within_1s_and_logs_one_line_when_funtown_is_not_running", () => {
  const log = join(mkdtempSync(join(tmpdir(), "funtown-hook-")), "hook.log");
  // Port 1 on loopback has no listener.
  const { status, ms } = runHook({ FUNTOWN_URL: "http://127.0.0.1:1", FUNTOWN_LOG: log });
  expect(status).toBe(0);
  expect(ms).toBeLessThan(1000);
  expect(readFileSync(log, "utf8").trimEnd().split("\n")).toHaveLength(1);
});

it("hook_exits_0_within_1s_and_logs_one_line_when_the_server_never_replies", async () => {
  const log = join(mkdtempSync(join(tmpdir(), "funtown-hook-")), "hook.log");
  const sockets: import("node:net").Socket[] = [];
  server = createServer(() => {
    // Accept the request and never answer.
  });
  server.on("connection", (s) => sockets.push(s));
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;

  const t0 = Date.now();
  const child = spawn("node", [HOOK], {
    env: { ...process.env, FUNTOWN_URL: `http://127.0.0.1:${port}`, FUNTOWN_LOG: log },
  });
  child.stdin.end(JSON.stringify(event));
  const code = await new Promise((r) => child.on("close", r));
  const ms = Date.now() - t0;
  sockets.forEach((s) => s.destroy());

  expect(code).toBe(0);
  expect(ms).toBeLessThan(1000);
  expect(readFileSync(log, "utf8").trimEnd().split("\n")).toHaveLength(1);
});

it("hook_exits_0_and_logs_the_status_when_the_server_answers_500", async () => {
  const log = join(mkdtempSync(join(tmpdir(), "funtown-hook-")), "hook.log");
  server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.statusCode = 500;
      res.end();
    });
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;

  const child = spawn("node", [HOOK], {
    env: { ...process.env, FUNTOWN_URL: `http://127.0.0.1:${port}`, FUNTOWN_LOG: log },
  });
  child.stdin.end(JSON.stringify(event));
  const code = await new Promise((r) => child.on("close", r));

  expect(code).toBe(0);
  const lines = readFileSync(log, "utf8").trimEnd().split("\n");
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain("500");
});

it("hook_stamps_at_before_its_ps_calls_so_a_slow_ps_does_not_make_the_event_late", async () => {
  // A `ps` that hangs until the hook's 300 ms ps timeout kills it.
  const bin = mkdtempSync(join(tmpdir(), "funtown-slow-ps-"));
  writeFileSync(join(bin, "ps"), "#!/bin/sh\nexec sleep 2\n");
  chmodSync(join(bin, "ps"), 0o755);
  const { port, bodies: got } = await captureServer();

  const child = spawn(process.execPath, [HOOK], {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FUNTOWN_URL: `http://127.0.0.1:${port}`,
      FUNTOWN_LOG: join(mkdtempSync(join(tmpdir(), "funtown-hook-")), "hook.log"),
    },
  });
  child.stdin.end(JSON.stringify(event));
  expect(await new Promise((r) => child.on("close", r))).toBe(0);

  expect(got).toHaveLength(1);
  // Stamped before ps, `at` is at least the ps timeout older than the POST; stamped after, only milliseconds.
  expect(got[0].receivedAt - JSON.parse(got[0].body).funtown.at).toBeGreaterThanOrEqual(250);
});
