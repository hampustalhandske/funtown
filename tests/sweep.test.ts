import { rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ClaudeDir, deadPid, fakePs, leadsOf, post, psLine, s1Session, start, START, townWhere } from "./helpers.ts";

const SWEEP = 100;
const GONE_AFTER = 400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hook = (at = 1) => ({ hook_event_name: "PreToolUse", session_id: "s1", cwd: "/work/alpha", tool_name: "Bash", tool_input: { command: "ls" }, funtown: { tty: "ttys004", term_program: "Apple_Terminal", at } });
const callsFor = (ps: ReturnType<typeof fakePs>, pid: number) => ps.calls.filter(([, a]) => a.at(-1) === String(pid)).length;
/** Resolves once `ok()` holds, polling every 10 ms. */
async function until(ok: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error("condition never held");
    await sleep(10);
  }
}

const isGone = (id = "s1") => (t: Parameters<typeof leadsOf>[0]) => leadsOf(t).some((l) => l.id === id && l.stage === "gone");

async function live() {
  const claude = new ClaudeDir().session(s1Session());
  const ps = fakePs({ [process.pid]: psLine() });
  const s = await start({ claudeDir: claude.dir, exec: ps.exec, sweepMs: SWEEP, goneAfterMs: GONE_AFTER });
  await townWhere(s.url, (t) => leadsOf(t).length === 1);
  return { claude, ps, ...s };
}

describe("sweep", () => {
  it("a_deleted_session_file_turns_the_lead_gone_then_it_is_removed_after_goneAfterMs", async () => {
    const { claude, url } = await live();
    rmSync(join(claude.dir, "sessions", `${process.pid}.json`));
    await townWhere(url, isGone());
    await townWhere(url, (t) => leadsOf(t).length === 0);
  });

  it("a_dead_pid_turns_the_lead_gone", async () => {
    const { claude, url } = await live();
    claude.rawSession(process.pid, JSON.stringify({ pid: deadPid(), sessionId: "s1", cwd: "/work/alpha", startedAt: 1, status: "idle", procStart: START }));
    await townWhere(url, isGone());
  });

  it("a_session_file_that_cannot_be_parsed_does_not_end_a_live_lead", async () => {
    const { claude, ps, url } = await live();
    claude.session(s1Session({ pid: process.ppid, sessionId: "s2" }));
    ps.lines[process.ppid] = psLine();
    await until(() => callsFor(ps, process.ppid) > 0);
    claude.rawSession(process.pid, '{"pid":1,"sessionId":"half');
    const before = callsFor(ps, process.ppid);
    await until(() => callsFor(ps, process.ppid) >= before + 2); // sweeps ran after the file broke
    expect(leadsOf(await townWhere(url, () => true))[0].stage).not.toBe("gone");
  });

  it("a_pid_whose_start_time_stops_matching_turns_the_lead_gone", async () => {
    const { ps, url } = await live();
    ps.lines[process.pid] = psLine("Sat Nov 14 01:02:03 2026");
    await townWhere(url, isGone());
  });

  it("a_lead_whose_hook_came_before_its_session_file_is_never_marked_gone", async () => {
    const claude = new ClaudeDir();
    const ps = fakePs({});
    const { url } = await start({ claudeDir: claude.dir, exec: ps.exec, sweepMs: SWEEP, goneAfterMs: GONE_AFTER });
    await post(url, hook());
    await sleep(SWEEP * 5);
    const lead = leadsOf(await townWhere(url, () => true))[0];
    expect([lead.id, lead.stage]).toEqual(["s1", "working"]);
  });

  it("a_failed_ps_does_not_end_a_live_lead", async () => {
    const { ps, url } = await live();
    ps.failing.add(process.pid);
    const before = ps.calls.length;
    await sleep(SWEEP * 5);
    expect(ps.calls.length).toBeGreaterThan(before); // sweeps did run and hit the failure
    const lead = leadsOf(await townWhere(url, () => true))[0];
    expect(lead.stage).not.toBe("gone");
  });

  it("a_hook_event_brings_a_gone_lead_back", async () => {
    const { claude, url } = await live();
    rmSync(join(claude.dir, "sessions", `${process.pid}.json`));
    await townWhere(url, isGone());
    await post(url, hook(2));
    const town = await townWhere(url, (t) => leadsOf(t).some((l) => l.id === "s1" && l.stage === "working"));
    expect(leadsOf(town)).toHaveLength(1);
  });

  it("a_session_first_seen_live_by_a_sweep_turns_gone_when_its_file_is_deleted", async () => {
    const claude = new ClaudeDir();
    const ps = fakePs({ [process.pid]: psLine() });
    const { url } = await start({ claudeDir: claude.dir, exec: ps.exec, sweepMs: SWEEP, goneAfterMs: GONE_AFTER });
    await post(url, hook());
    claude.session(s1Session());
    await until(() => callsFor(ps, process.pid) > 0);
    rmSync(join(claude.dir, "sessions", `${process.pid}.json`));
    await townWhere(url, isGone());
  });

  it("a_hook_arriving_while_a_sweep_is_in_flight_is_not_ended_by_that_sweep", async () => {
    const claude = new ClaudeDir().session(s1Session());
    const ps = fakePs({ [process.pid]: psLine() });
    let gated = false;
    const waiting: (() => void)[] = [];
    const exec = async (file: string, args: string[]) => {
      if (gated) await new Promise<void>((r) => waiting.push(r));
      return ps.exec(file, args);
    };
    const { url } = await start({ claudeDir: claude.dir, exec, sweepMs: 50, goneAfterMs: 60_000 });
    await townWhere(url, (t) => leadsOf(t).length === 1);
    ps.lines[process.pid] = psLine("Sat Nov 14 01:02:03 2026"); // the next answer says the pid is not the recorded process
    gated = true;
    await until(() => waiting.length === 1); // a sweep is now blocked inside its ps call
    await post(url, hook(2));
    waiting[0]();
    await until(() => waiting.length === 2); // the next sweep has started, so the first has finished
    const lead = leadsOf(await townWhere(url, () => true))[0];
    expect([lead.id, lead.stage]).toEqual(["s1", "working"]);
  });

  it("a_lead_revived_by_a_hook_is_ended_again_when_its_file_is_deleted_again", async () => {
    const { claude, ps, url } = await live();
    const file = join(claude.dir, "sessions", `${process.pid}.json`);
    rmSync(file);
    await townWhere(url, isGone());
    claude.session(s1Session());
    await post(url, hook(2));
    await townWhere(url, (t) => leadsOf(t).some((l) => l.id === "s1" && l.stage === "working"));
    const seen = callsFor(ps, process.pid);
    await until(() => callsFor(ps, process.pid) >= seen + 2); // a sweep saw it live again
    rmSync(file);
    await townWhere(url, isGone());
  });

  it("close_stops_the_sweep", async () => {
    const claude = new ClaudeDir().session(s1Session());
    const ps = fakePs({ [process.pid]: psLine() });
    const s = await start({ claudeDir: claude.dir, exec: ps.exec, sweepMs: SWEEP });
    await sleep(SWEEP * 3);
    await s.close();
    await sleep(SWEEP); // let a sweep already in flight finish
    const n = ps.calls.length;
    await sleep(SWEEP * 5);
    expect(ps.calls.length).toBe(n);
  });

  it("without_claudeDir_no_sweep_runs", async () => {
    const ps = fakePs({});
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await start({ exec: ps.exec, sweepMs: 50 });
    await sleep(300);
    const logged = errors.mock.calls.length;
    errors.mockRestore();
    expect([ps.calls, logged]).toEqual([[], 0]); // a stray sweep would log or call ps

  });
});
