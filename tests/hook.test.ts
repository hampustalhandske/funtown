import { spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
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

it("hook_posts_the_event_unchanged_plus_a_funtown_block_to_events", async () => {
  const got: { method?: string; path?: string; body: string }[] = [];
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      got.push({ method: req.method, path: req.url, body });
      res.statusCode = 204;
      res.end();
    });
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;

  // spawnSync would block the server's event loop, so run the hook asynchronously.
  const { spawn } = await import("node:child_process");
  const child = spawn("node", [HOOK], {
    env: { ...process.env, FUNTOWN_URL: `http://127.0.0.1:${port}`, TERM_PROGRAM: "TestTerm" },
  });
  child.stdin.end(JSON.stringify(event));
  const code = await new Promise((r) => child.on("close", r));

  expect(code).toBe(0);
  expect(got).toHaveLength(1);
  expect(got[0]).toMatchObject({ method: "POST", path: "/events" });
  const { funtown, ...rest } = JSON.parse(got[0].body);
  expect(rest).toEqual(event);
  expect(funtown).toHaveProperty("tty");
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
