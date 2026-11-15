import { rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ClaudeDir, deadPid, leadsOf, post, start, townWhere } from "./helpers.ts";

const START = "Fri Nov 13 12:37:09 2026";
const psLine = (lstart = START) => `${lstart}     ttys004  claude --resume TERM_PROGRAM=Apple_Terminal`;
const SWEEP = 100;
const GONE_AFTER = 400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A fake `exec` whose ps answer per pid can change between sweeps, or fail. */
function livePs(lines: Record<number, string>) {
  const failing = new Set<number>();
  const calls: [string, string[]][] = [];
  const exec = async (file: string, args: string[]): Promise<string> => {
    calls.push([file, args]);
    const pid = Number(args[args.length - 1]);
    if (failing.has(pid)) throw new Error("ps failed");
    return `${lines[pid] ?? ""}\n`;
  };
  return { lines, failing, calls, exec };
}

const isGone = (id = "s1") => (t: Parameters<typeof leadsOf>[0]) => leadsOf(t).some((l) => l.id === id && l.stage === "gone");

async function live() {
  const claude = new ClaudeDir().session({ pid: process.pid, sessionId: "s1", cwd: "/work/alpha", startedAt: 1, status: "idle", procStart: START });
  const ps = livePs({ [process.pid]: psLine() });
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
    claude.session({ pid: process.pid, sessionId: "s1", cwd: "/work/alpha", startedAt: 1, status: "idle", procStart: START });
    claude.rawSession(process.pid, JSON.stringify({ pid: deadPid(), sessionId: "s1", cwd: "/work/alpha", startedAt: 1, status: "idle", procStart: START }));
    await townWhere(url, isGone());
  });

  it("a_session_file_that_cannot_be_parsed_does_not_end_a_live_lead", async () => {
    const { claude, ps, url } = await live();
    claude.rawSession(process.pid, '{"pid":1,"sessionId":"half');
    const before = ps.calls.length;
    await sleep(SWEEP * 5);
    expect(ps.calls.length).toBeGreaterThanOrEqual(before);
    expect(leadsOf(await townWhere(url, () => true))[0].stage).not.toBe("gone");
  });

  it("a_pid_whose_start_time_stops_matching_turns_the_lead_gone", async () => {
    const { ps, url } = await live();
    ps.lines[process.pid] = psLine("Sat Nov 14 01:02:03 2026");
    await townWhere(url, isGone());
  });

  it("a_lead_whose_hook_came_before_its_session_file_is_never_marked_gone", async () => {
    const claude = new ClaudeDir();
    const ps = livePs({});
    const { url } = await start({ claudeDir: claude.dir, exec: ps.exec, sweepMs: SWEEP, goneAfterMs: GONE_AFTER });
    await post(url, { hook_event_name: "PreToolUse", session_id: "s1", cwd: "/work/alpha", tool_name: "Bash", tool_input: { command: "ls" }, funtown: { tty: "ttys004", term_program: "Apple_Terminal", at: 1 } });
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
    await post(url, { hook_event_name: "PreToolUse", session_id: "s1", cwd: "/work/alpha", tool_name: "Bash", tool_input: { command: "ls" }, funtown: { tty: "ttys004", term_program: "Apple_Terminal", at: 2 } });
    const town = await townWhere(url, (t) => leadsOf(t).some((l) => l.id === "s1" && l.stage === "working"));
    expect(leadsOf(town)).toHaveLength(1);
  });

  it("close_stops_the_sweep", async () => {
    const claude = new ClaudeDir().session({ pid: process.pid, sessionId: "s1", cwd: "/work/alpha", startedAt: 1, status: "idle", procStart: START });
    const ps = livePs({ [process.pid]: psLine() });
    const s = await start({ claudeDir: claude.dir, exec: ps.exec, sweepMs: SWEEP });
    await sleep(SWEEP * 3);
    await s.close();
    await sleep(SWEEP); // let a sweep already in flight finish
    const n = ps.calls.length;
    await sleep(SWEEP * 5);
    expect(ps.calls.length).toBe(n);
  });

  it("without_claudeDir_no_sweep_runs", async () => {
    const ps = livePs({});
    await start({ exec: ps.exec, sweepMs: 50 });
    await sleep(300);
    expect(ps.calls).toEqual([]);
  });
});
