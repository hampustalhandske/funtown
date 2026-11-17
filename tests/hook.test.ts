import { spawn, spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { refusedUrl, runScript } from "./helpers.ts";

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

const input = JSON.stringify(event);

/** Starts `server` on a free loopback port and returns its URL. */
async function listen(s: Server): Promise<string> {
  server = s;
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(s.address() as { port: number }).port}`;
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

it("hook_exits_0_within_1s_prints_nothing_and_logs_nothing_when_funtown_is_not_running", async () => {
  const r = await runScript(HOOK, await refusedUrl(), input);
  expect(r).toMatchObject({ code: 0, out: "", lines: [] });
  expect(r.ms).toBeLessThan(1000);
});

it("hook_exits_0_within_1s_and_logs_post_events_when_the_server_never_replies", async () => {
  const sockets: import("node:net").Socket[] = [];
  const s = createServer(() => {
    // Accept the request and never answer.
  });
  s.on("connection", (c) => sockets.push(c));
  const url = await listen(s);

  const r = await runScript(HOOK, url, input);
  sockets.forEach((c) => c.destroy());

  expect(r).toMatchObject({ code: 0, out: "" });
  expect(r.ms).toBeLessThan(1500);
  expect(r.lines).toEqual([expect.objectContaining({ source: "hook", step: "post /events" })]);
});

it("hook_exits_0_and_logs_post_events_with_the_status_when_the_server_answers_500", async () => {
  const url = await listen(
    createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        res.statusCode = 500;
        res.end();
      });
    }),
  );
  const r = await runScript(HOOK, url, input);
  expect(r).toMatchObject({ code: 0, out: "" });
  expect(r.lines).toEqual([expect.objectContaining({ source: "hook", step: "post /events" })]);
  expect(r.lines[0].message).toContain("500");
});

it("hook_exits_0_and_logs_post_events_when_the_server_drops_the_connection", async () => {
  const url = await listen(createServer((req) => req.socket.destroy()));
  const r = await runScript(HOOK, url, input);
  expect(r).toMatchObject({ code: 0, out: "" });
  expect(r.lines).toEqual([expect.objectContaining({ source: "hook", step: "post /events" })]);
});

it("hook_exits_0_logs_read_event_and_posts_nothing_when_stdin_is_not_json", async () => {
  const { port, bodies } = await captureServer();
  const r = await runScript(HOOK, `http://127.0.0.1:${port}`, "not json {");
  expect(r).toMatchObject({ code: 0, out: "" });
  expect(r.lines).toEqual([expect.objectContaining({ source: "hook", step: "read event" })]);
  expect(bodies).toEqual([]);
});

it("hook_logs_read_event_not_post_events_and_posts_nothing_when_stdin_is_json_null", async () => {
  const { port, bodies } = await captureServer();
  const r = await runScript(HOOK, `http://127.0.0.1:${port}`, "null");
  expect(r).toMatchObject({ code: 0, out: "" });
  expect(r.lines).toEqual([expect.objectContaining({ source: "hook", step: "read event" })]);
  expect(bodies).toEqual([]);
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
