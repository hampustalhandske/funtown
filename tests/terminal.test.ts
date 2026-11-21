import { expect, it } from "vitest";
import { alive, connect as open, inTerminal, listed, listedBg, leadsOf, realDir, start, tokenOf, townWhere, until } from "./helpers.ts";

const SID = "abcd1234-0000-4000-8000-000000000000";
const SHORT = "abcd1234";

/** Opens /term on session SID, or on `q.lead`. */
const connect = (
  s: { url: string; token: string },
  q: { lead?: string; cols?: number; rows?: number; token?: string | null; origin?: string | null } = {},
) => open(s, { lead: q.lead ?? SID }, q);

/** A server listing background session SID and interactive session TERMINAL. */
async function withSessions() {
  const s = await start();
  s.fake.list([listedBg(SID, "/work/a"), listed("terminal-1", "/work/a")]);
  await townWhere(s.url, (t) => leadsOf(t).length === 2);
  return { ...s, token: await tokenOf(s.url) };
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
    expect(c.out()).toContain(`attached ${SHORT} TERM=xterm-256color size:97x31 env:[CLAUDE_CODE_ENABLE_AWAY_SUMMARY]`);
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
    expect(c.out()).toContain("env:[CLAUDE_CODE_ENABLE_AWAY_SUMMARY,CLAUDE_CONFIG_DIR]");
  } finally {
    delete process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CLAUDE_CODE_ENTRYPOINT;
  }
});

it("term_tells_claude_one_terminal_whatever_terminal_the_server_was_started_from", async () => {
  // Breaks if the attach client inherits the starting terminal's identity: Claude would act as if it ran there.
  await inTerminal(async () => {
    const s = await withSessions();
    const c = await connect(s);
    await until(() => c.out().includes("attached"));
    expect(c.out()).toContain("TERM=xterm-256color");
    expect(c.out()).toContain("COLORTERM=truecolor TERM_PROGRAM=undefined terminal-vars:[]");
  });
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
  expect(alive(pid)).toBe(true);
  a.ws.close();
  await until(() => !alive(pid), 5000);

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

it("sessions_passes_claude_config_dir_to_claude_bg_and_no_other_claude_variable", async () => {
  process.env.CLAUDE_CONFIG_DIR = "/custom/config";
  process.env.CLAUDE_CODE_ENTRYPOINT = "cli";
  process.env.AI_AGENT = "x";
  try {
    const cwd = realDir();
    const s = await start();
    s.fake.list([listed("s1", cwd)]);
    await townWhere(s.url, (t) => leadsOf(t).length === 1);
    const res = await fetch(`${s.url}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: s.url, "x-funtown-token": await tokenOf(s.url) },
      body: JSON.stringify({ cwd }),
    });
    expect(res.status).toBe(201);
    expect(s.fake.started().map((c) => c.env)).toEqual([["CLAUDE_CONFIG_DIR"]]);
  } finally {
    delete process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CLAUDE_CODE_ENTRYPOINT;
    delete process.env.AI_AGENT;
  }
});
