import { afterEach, expect, it } from "vitest";
import WebSocket from "ws";
import { listed, listedBg, leadsOf, start, tokenOf, townWhere, until } from "./helpers.ts";

const SID = "abcd1234-0000-4000-8000-000000000000";
const SHORT = "abcd1234";
const sockets: WebSocket[] = [];
afterEach(() => {
  for (const w of sockets.splice(0)) w.terminate();
});

/** A server listing background session SID and interactive session TERMINAL. */
async function withSessions() {
  const s = await start();
  s.fake.list([listedBg(SID, "/work/a"), listed("terminal-1", "/work/a")]);
  await townWhere(s.url, (t) => leadsOf(t).length === 2);
  return { ...s, token: await tokenOf(s.url) };
}

type Conn = { ws: WebSocket; out: () => string; shared: number[]; closed: () => boolean; send: (f: object) => void };

/** Opens /term; resolves once the socket is open, rejects with the HTTP status when the upgrade is refused. */
function connect(
  s: { url: string; token: string },
  q: { lead?: string; cols?: number; rows?: number; token?: string | null; origin?: string | null } = {},
): Promise<Conn> {
  const params = new URLSearchParams({ lead: q.lead ?? SID, cols: String(q.cols ?? 100), rows: String(q.rows ?? 30) });
  if (q.token !== null) params.set("token", q.token ?? s.token);
  const headers = q.origin === null ? {} : { origin: q.origin ?? s.url };
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${s.url.replace("http", "ws")}/term?${params}`, { headers });
    sockets.push(ws);
    let out = "";
    let closed = false;
    const shared: number[] = [];
    ws.on("message", (m) => {
      const f = JSON.parse(m.toString());
      if (f.t === "out") out += f.d;
      if (f.t === "shared") shared.push(f.n);
    });
    ws.on("close", () => (closed = true));
    ws.on("open", () => resolve({ ws, out: () => out, shared, closed: () => closed, send: (f) => ws.send(JSON.stringify(f)) }));
    ws.on("unexpected-response", (_req, res) => reject(new Error(`status ${res.statusCode}`)));
    ws.on("error", () => {});
  });
}

it("term_is_refused_with_403_without_the_token_with_a_wrong_one_or_from_another_origin", async () => {
  const s = await withSessions();
  await expect(connect(s, { token: null })).rejects.toThrow("status 403");
  await expect(connect(s, { token: "0".repeat(32) })).rejects.toThrow("status 403");
  await expect(connect(s, { origin: "http://evil.example" })).rejects.toThrow("status 403");
  await expect(connect(s, { origin: null })).rejects.toThrow("status 403");
  expect(s.fake.attachPids(SHORT)).toEqual([]);
});

it("term_for_a_terminal_session_gets_409_and_attaches_nothing", async () => {
  const s = await withSessions();
  await expect(connect(s, { lead: "terminal-1" })).rejects.toThrow("status 409");
  expect(s.fake.attachPids("terminal-1")).toEqual([]);
});

it("term_attaches_by_short_id_in_xterm_256color_at_the_pages_size_with_no_claude_variables", async () => {
  process.env.CLAUDE_CODE_ENTRYPOINT = "cli";
  process.env.AI_AGENT = "x";
  try {
    const s = await withSessions();
    const c = await connect(s, { cols: 97, rows: 31 });
    await until(() => c.out().includes("attached"));
    expect(c.out()).toContain(`attached ${SHORT} TERM=xterm-256color size:97x31 env:[]`);
  } finally {
    delete process.env.CLAUDE_CODE_ENTRYPOINT;
    delete process.env.AI_AGENT;
  }
});

it("term_passes_claude_config_dir_through_and_no_other_claude_variable", async () => {
  process.env.CLAUDE_CONFIG_DIR = "/custom/config";
  process.env.CLAUDE_CODE_ENTRYPOINT = "cli";
  try {
    const s = await withSessions();
    const c = await connect(s);
    await until(() => c.out().includes("attached"));
    expect(c.out()).toContain("env:[CLAUDE_CONFIG_DIR]");
  } finally {
    delete process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CLAUDE_CODE_ENTRYPOINT;
  }
});

it("a_frame_over_1_mb_closes_that_socket_and_the_server_keeps_serving", async () => {
  const s = await withSessions();
  const c = await connect(s);
  await until(() => c.out().includes("attached"));
  c.send({ t: "in", d: "x".repeat(1024 * 1024 + 1) });
  await until(() => c.closed(), 5000);
  expect((await fetch(`${s.url}/`)).status).toBe(200);
  const again = await connect(s);
  await until(() => again.out().includes("attached"));
});

it("term_input_frames_reach_the_pty_and_resize_frames_resize_it", async () => {
  const s = await withSessions();
  const c = await connect(s);
  await until(() => c.out().includes("attached"));
  c.send({ t: "in", d: "hello" });
  await until(() => c.out().includes('got:"hello"'));
  c.send({ t: "in", d: "\x1b\r" });
  await until(() => c.out().includes('got:"\\u001b\\r"'));
  c.send({ t: "resize", c: 120, r: 40 });
  await until(() => c.out().includes("size:120x40"));
});

it("closing_the_socket_kills_the_pty_and_the_pty_exiting_closes_the_socket", async () => {
  const s = await withSessions();
  const a = await connect(s);
  await until(() => s.fake.attachPids(SHORT).length === 1);
  const [pid] = s.fake.attachPids(SHORT);
  const alive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
  expect(alive()).toBe(true);
  a.ws.close();
  await until(() => !alive(), 5000);

  const b = await connect(s);
  await until(() => b.out().includes("attached"));
  b.send({ t: "in", d: "quit" });
  await until(() => b.closed(), 5000);
});

it("shared_reports_the_number_of_funtown_sockets_on_a_session_as_it_changes", async () => {
  const s = await withSessions();
  const a = await connect(s);
  await until(() => a.out().includes("attached"));
  const b = await connect(s);
  await until(() => a.shared.at(-1) === 2 && b.shared.at(-1) === 2);
  b.ws.close();
  await until(() => a.shared.at(-1) === 1);
});
