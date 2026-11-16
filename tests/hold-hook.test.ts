import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { errorLines, refusedUrl } from "./helpers.ts";

const HOLD = resolve(import.meta.dirname, "../hooks/funtown-hold.ts");
const event = {
  hook_event_name: "PermissionRequest",
  session_id: "abc123",
  cwd: "/work/demo-app",
  tool_name: "Bash",
  tool_input: { command: "npm test" },
};

let server: Server | undefined;
afterEach(() => server?.close());

/** Runs the hold hook against `url` with `input` on stdin; resolves with its exit code, stdout, run time and error-log lines. */
async function runHold(url: string, input = JSON.stringify(event)) {
  const log = join(mkdtempSync(join(tmpdir(), "funtown-hold-")), "errors.log");
  const t0 = Date.now();
  const child = spawn("node", [HOLD], { env: { ...process.env, FUNTOWN_URL: url, FUNTOWN_LOG: log } });
  let out = "";
  child.stdout.on("data", (c) => (out += c));
  child.stdin.end(input);
  const code = await new Promise((r) => child.on("close", r));
  return { code, out, ms: Date.now() - t0, lines: errorLines(log) };
}

/** A server answering every request with `status` and `body` after `delayMs`; records what it received. */
async function serve(status: number, body: string, delayMs = 0) {
  const got: { method?: string; path?: string; origin?: string; body: string }[] = [];
  server = createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      got.push({ method: req.method, path: req.url, origin: req.headers.origin, body: b });
      setTimeout(() => {
        res.statusCode = status;
        res.end(body);
      }, delayMs);
    });
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return { got, url: `http://127.0.0.1:${(server.address() as { port: number }).port}` };
}

it("hold_hook_prints_the_200_body_verbatim_even_when_the_reply_takes_longer_than_the_event_hooks_deadline", async () => {
  const reply = '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}';
  const s = await serve(200, reply, 1500);
  const r = await runHold(s.url);
  expect(r.code).toBe(0);
  expect(r.out).toBe(reply);
  expect(s.got).toHaveLength(1);
  expect(s.got[0]).toMatchObject({ method: "POST", path: "/hold", origin: undefined });
  const { funtown, ...rest } = JSON.parse(s.got[0].body);
  expect(rest).toEqual(event);
  expect(typeof funtown.at).toBe("number");
});

it("hold_hook_prints_nothing_and_exits_0_on_204_and_on_500_and_logs_post_hold_with_the_status_only_for_500", async () => {
  const s204 = await serve(204, "");
  expect(await runHold(s204.url)).toMatchObject({ code: 0, out: "", lines: [] });
  server!.close();

  const s500 = await serve(500, '{"hookSpecificOutput":"must not be printed"}');
  const r = await runHold(s500.url);
  expect(r).toMatchObject({ code: 0, out: "" });
  expect(r.lines).toEqual([expect.objectContaining({ source: "hold", step: "post /hold" })]);
  expect(r.lines[0].message).toContain("500");
});

it("hold_hook_prints_nothing_exits_0_at_once_and_logs_nothing_when_no_server_is_running", async () => {
  const r = await runHold(await refusedUrl());
  expect(r).toMatchObject({ code: 0, out: "", lines: [] });
  expect(r.ms).toBeLessThan(2000);
});

it("hold_hook_prints_nothing_exits_0_and_logs_post_hold_when_the_server_drops_the_connection", async () => {
  server = createServer((req) => req.socket.destroy());
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  const r = await runHold(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
  expect(r).toMatchObject({ code: 0, out: "" });
  expect(r.lines).toEqual([expect.objectContaining({ source: "hold", step: "post /hold" })]);
});

it("hold_hook_prints_nothing_exits_0_logs_read_event_and_posts_nothing_when_stdin_is_not_json", async () => {
  const s = await serve(200, '{"must":"not be printed"}');
  const r = await runHold(s.url, "not json {");
  expect(r).toMatchObject({ code: 0, out: "" });
  expect(r.lines).toEqual([expect.objectContaining({ source: "hold", step: "read event" })]);
  expect(s.got).toEqual([]);
});

it("hold_hook_prints_a_300_kb_reply_in_full_through_the_pipe", async () => {
  const reply = JSON.stringify({ pad: "x".repeat(300_000) });
  const s = await serve(200, reply);
  const r = await runHold(s.url);
  expect(r.code).toBe(0);
  expect(r.out.length).toBe(reply.length);
  expect(r.out).toBe(reply);
});
