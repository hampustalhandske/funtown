import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";

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

/** Runs the hold hook against `url`; resolves with its exit code, stdout and how long it took. */
async function runHold(url: string) {
  const t0 = Date.now();
  const child = spawn("node", [HOLD], {
    env: { ...process.env, FUNTOWN_URL: url, FUNTOWN_LOG: join(mkdtempSync(join(tmpdir(), "funtown-hold-")), "hold.log") },
  });
  let out = "";
  child.stdout.on("data", (c) => (out += c));
  child.stdin.end(JSON.stringify(event));
  const code = await new Promise((r) => child.on("close", r));
  return { code, out, ms: Date.now() - t0 };
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

it("hold_hook_prints_nothing_and_exits_0_on_204_and_on_500", async () => {
  for (const status of [204, 500]) {
    const s = await serve(status, status === 500 ? '{"hookSpecificOutput":"must not be printed"}' : "");
    const r = await runHold(s.url);
    expect(r, String(status)).toMatchObject({ code: 0, out: "" });
    server!.close();
  }
});

it("hold_hook_prints_nothing_and_exits_0_at_once_when_no_server_is_running", async () => {
  const r = await runHold("http://127.0.0.1:1");
  expect(r).toMatchObject({ code: 0, out: "" });
  expect(r.ms).toBeLessThan(2000);
});

it("hold_hook_prints_a_300_kb_reply_in_full_through_the_pipe", async () => {
  const reply = JSON.stringify({ pad: "x".repeat(300_000) });
  const s = await serve(200, reply);
  const r = await runHold(s.url);
  expect(r.code).toBe(0);
  expect(r.out.length).toBe(reply.length);
  expect(r.out).toBe(reply);
});
