import { expect, it } from "vitest";
import { alive, connect as open, errorLines, houseAt, listed, postPage, projectsPath, realDir, start, tokenOf, townWhere, until } from "./helpers.ts";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SLOW = 8000; // the first run of a new executable can take a second on macOS

/**
 * A server with one added project with no session, and one house of a listed session in a
 * folder inside that project (as a run's worktree is), which isn't added itself.
 */
async function withHouses() {
  const project = realDir();
  const house = join(project, "run");
  mkdirSync(house);
  const s = await start({ projects: projectsPath() });
  s.fake.list([listed("s1", house)]);
  await postPage(s, "/projects", { cwd: project });
  await townWhere(s.url, (t) => houseAt(t, house) !== undefined && houseAt(t, project) !== undefined);
  return { ...s, house, project, token: await tokenOf(s.url) };
}

/** Opens /term?shell=<cwd>. */
const connect = (s: { url: string; token: string }, cwd: string, q: Parameters<typeof open>[2] = {}) => open(s, { shell: cwd }, q);

it("shell_is_refused_without_the_token_or_origin_and_404_outside_a_house_and_starts_nothing", async () => {
  const s = await withHouses();
  await expect(connect(s, s.house, { token: null })).rejects.toThrow("status 403");
  await expect(connect(s, s.house, { token: "0".repeat(32) })).rejects.toThrow("status 403");
  await expect(connect(s, s.house, { origin: "http://evil.example" })).rejects.toThrow("status 403");
  await expect(connect(s, s.house, { origin: null })).rejects.toThrow("status 403");
  await expect(connect(s, realDir())).rejects.toThrow("status 404");
  await expect(connect(s, `${s.house}/`)).rejects.toThrow("status 404");
  expect(s.fake.shellStarts()).toEqual([]);
});

it("shell_starts_the_login_shell_in_the_projects_folder_at_the_pages_size_with_no_claude_variables", async () => {
  process.env.CLAUDE_CODE_ENTRYPOINT = "cli";
  process.env.AI_AGENT = "x";
  process.env.CLAUDE_CONFIG_DIR = "/custom/config";
  try {
    const s = await withHouses();
    const c = await connect(s, s.project, { cols: 97, rows: 31 });
    await until(() => c.out().includes("shell args:"), SLOW);
    expect(c.out()).toContain(`shell args:-l cwd:${s.project} size:97x31 env:[CLAUDE_CONFIG_DIR]`);
    c.send({ t: "in", d: "ls\r" });
    await until(() => c.out().includes('got:"ls\\r"'));
    c.send({ t: "in", d: "\x03" });
    await until(() => c.out().includes('got:"\\u0003"'));
    c.send({ t: "resize", c: 120, r: 40 });
    await until(() => c.out().includes("size:120x40"));
  } finally {
    delete process.env.CLAUDE_CODE_ENTRYPOINT;
    delete process.env.AI_AGENT;
    delete process.env.CLAUDE_CONFIG_DIR;
  }
});

it("one_shell_per_project_outlives_its_socket_and_a_reconnect_replays_its_output", async () => {
  const s = await withHouses();
  const a = await connect(s, s.house);
  const b = await connect(s, s.house);
  await until(() => a.out().includes("shell args:"), SLOW);
  await until(() => b.out().includes("shell args:"));
  expect(s.fake.shellStarts()).toHaveLength(1);
  const [{ pid }] = s.fake.shellStarts();

  a.send({ t: "in", d: "hello" });
  await until(() => a.out().includes('got:"hello"'));
  a.ws.close();
  b.ws.close();
  await until(() => a.closed() && b.closed());
  await new Promise((r) => setTimeout(r, 500));
  expect(alive(pid)).toBe(true);

  const c = await connect(s, s.house);
  await until(() => c.out().includes('got:"hello"'));
  expect(c.out()).toContain("shell args:-l");
  expect(s.fake.shellStarts()).toHaveLength(1);

  const other = await connect(s, s.project);
  await until(() => s.fake.shellStarts().length === 2, SLOW);
  expect(s.fake.shellStarts().map((x) => x.cwd).sort()).toEqual([s.house, s.project].sort());
  other.ws.close();
});

it("shells_close_ends_that_shell_and_its_sockets_404s_when_none_runs_and_needs_the_page", async () => {
  const s = await withHouses();
  const c = await connect(s, s.house);
  await until(() => c.out().includes("shell args:"), SLOW);
  const [{ pid }] = s.fake.shellStarts();
  c.send({ t: "in", d: "hello" });
  await until(() => c.out().includes('got:"hello"'));
  expect((await postPage(s, "/shells/close", { cwd: s.house }, { origin: s.url })).status).toBe(403);
  expect(alive(pid)).toBe(true);
  expect((await postPage(s, "/shells/close", { cwd: s.project })).status).toBe(404);
  expect((await postPage(s, "/shells/close", { cwd: s.house })).status).toBe(204);
  await until(() => !alive(pid), 5000);
  await until(() => c.closed());
  expect((await postPage(s, "/shells/close", { cwd: s.house })).status).toBe(404);

  const again = await connect(s, s.house);
  await until(() => again.out().includes("shell args:"), SLOW);
  expect(s.fake.shellStarts()).toHaveLength(2);
  expect(s.fake.shellStarts()[1].pid).not.toBe(pid);
  expect(again.out()).not.toContain("hello");
});

it("exit_ends_the_shell_and_the_next_connect_starts_a_fresh_one", async () => {
  const s = await withHouses();
  const c = await connect(s, s.house);
  await until(() => c.out().includes("shell args:"), SLOW);
  const [{ pid }] = s.fake.shellStarts();
  c.send({ t: "in", d: "exit\r" });
  await until(() => c.closed() && !alive(pid), 5000);
  expect((await postPage(s, "/shells/close", { cwd: s.house })).status).toBe(404);
  await connect(s, s.house);
  await until(() => s.fake.shellStarts().length === 2, SLOW);
});

it("stopping_the_server_ends_every_shell", async () => {
  const s = await withHouses();
  await connect(s, s.house);
  await connect(s, s.project);
  await until(() => s.fake.shellStarts().length === 2, SLOW);
  const pids = s.fake.shellStarts().map((x) => x.pid);
  await s.close();
  await until(() => pids.every((p) => !alive(p)), 5000);
});

it("removing_a_project_ends_its_shell_and_its_sockets", async () => {
  const s = await withHouses();
  const c = await connect(s, s.project);
  await until(() => s.fake.shellStarts().length === 1, SLOW);
  const [{ pid }] = s.fake.shellStarts();
  expect((await postPage(s, "/projects/remove", { cwd: s.project })).status).toBe(204);
  await until(() => !alive(pid) && c.closed(), 5000);
  expect((await postPage(s, "/shells/close", { cwd: s.project })).status).toBe(404);
});

it("a_folder_with_a_running_shell_stays_a_house_with_no_leads_after_its_last_session_ends_until_the_shell_ends", async () => {
  const s = await withHouses();
  const c = await connect(s, s.house);
  await until(() => c.out().includes("shell args:"), SLOW);
  s.fake.list([]);
  const town = await townWhere(s.url, (t) => houseAt(t, s.house)?.leads.length === 0);
  expect(houseAt(town, s.house)!.added).toBeFalsy();
  expect((await postPage(s, "/shells/close", { cwd: s.house })).status).toBe(204);
  await townWhere(s.url, (t) => houseAt(t, s.house) === undefined);
});

it("a_shell_that_exits_non_zero_before_any_output_is_logged_with_its_folder_and_code", async () => {
  process.env.FAKE_SHELL_EXIT = "3";
  try {
    const log = join(realDir(), "errors.log");
    const [house] = [realDir()];
    const s = await start({ projects: projectsPath(), errorLog: log });
    await postPage(s, "/projects", { cwd: house });
    const c = await connect({ ...s, token: await tokenOf(s.url) }, house);
    await until(() => c.closed(), SLOW);
    await until(() => errorLines(log).some((l) => l.step === "shell"));
    expect(errorLines(log).filter((l) => l.step === "shell")).toEqual([
      { source: "server", step: "shell", message: `${house}: exited 3 before any output` },
    ]);
  } finally {
    delete process.env.FAKE_SHELL_EXIT;
  }
});

it("a_reconnect_replays_at_most_256_kb_starting_at_a_whole_line_and_ending_with_the_latest_output", async () => {
  const s = await withHouses();
  const a = await connect(s, s.house);
  await until(() => a.out().includes("shell args:"), SLOW);
  a.send({ t: "in", d: "flood" });
  await until(() => /END\r+\n$/.test(a.out()), 15000);
  a.ws.close();
  await until(() => a.closed());

  const b = await connect(s, s.house);
  await until(() => /END\r+\n$/.test(b.out()), 5000);
  const replay = b.out();
  expect(replay.length).toBeLessThanOrEqual(256 * 1024);
  expect(replay.length).toBeGreaterThan(128 * 1024); // the tail is kept, not dropped
  expect(replay).toMatch(/^line-\d+-x{60,96}\r+\n/); // begins on a line start, not inside one
  const lines = replay.split(/\r+\n/).filter(Boolean);
  const nums = lines.slice(0, -1).map((l) => Number(/^line-(\d+)-x+$/.exec(l)?.[1] ?? NaN));
  expect(nums.at(-1)).toBe(3999);
  expect(nums.every((n, i) => i === 0 || n === nums[i - 1] + 1)).toBe(true); // whole lines, none cut
}, 30_000);
