import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ClaudeDir, deadPid, fakePs, leadsOf, post, start, toolUse, townWhere } from "./helpers.ts";

const PS = "ttys004  claude --resume TERM_PROGRAM=Apple_Terminal SHELL=/bin/zsh";

describe("rebuild on start", () => {
  it("rebuilds_live_sessions_per_house_with_stage_numbering_and_step_and_drops_the_dead_one", async () => {
    const dead = await deadPid();
    const claude = new ClaudeDir()
      .session({ pid: process.pid, sessionId: "s2", cwd: "/work/alpha", startedAt: 2000, status: "idle" })
      .session({ pid: process.ppid, sessionId: "s1", cwd: "/work/alpha", startedAt: 1000, status: "busy" })
      .session({ pid: dead, sessionId: "s3", cwd: "/work/beta", startedAt: 1500, status: "busy" })
      .transcript("s1", [toolUse("Bash", { command: "npm test" }), { type: "user" }, toolUse("Read", { file_path: "/work/alpha/a.ts" }), toolUse("Bash", { command: "npm test" })])
      .transcript("s2", [{ type: "user", message: { content: "hi" } }]);
    const { url } = await start({ claudeDir: claude.dir, exec: fakePs({}).exec });

    const town = await townWhere(url, () => true);
    expect(town.houses.map((h) => h.project)).toEqual(["alpha"]);
    const [first, second] = town.houses[0].leads;
    expect([first.id, first.name, first.stage, first.step, first.activity]).toEqual(["s1", "lead-1", "working", "Bash: npm test", null]);
    expect([second.id, second.name, second.stage, second.needs, second.step]).toEqual(["s2", "lead-2", "needs_you", "turn ended", null]);
  });

  it("rebuilds_subagents_from_meta_ordered_by_first_timestamp_with_done_and_own_step", async () => {
    const claude = new ClaudeDir()
      .session({ pid: process.pid, sessionId: "s1", cwd: "/work/alpha", startedAt: 1, status: "busy" })
      .transcript("s1", [])
      .subagent("s1", "b", { agentType: "implementer", finished: false }, [toolUse("Edit", {}, "2024-01-01T00:00:09Z")])
      .subagent("s1", "a", { agentType: "implementer", finished: true }, [toolUse("Read", {}, "2024-01-01T00:00:01Z"), toolUse("Bash", { command: "ls" }, "2024-01-01T00:00:02Z")]);
    const { url } = await start({ claudeDir: claude.dir, exec: fakePs({}).exec });

    const subs = leadsOf(await townWhere(url, () => true))[0].subagents;
    expect(subs.map((s) => [s.name, s.stage, s.step])).toEqual([
      ["implementer-1", "done", "Bash: ls"],
      ["implementer-2", "working", "Edit"],
    ]);
  });

  it("a_half_written_last_line_is_skipped_and_the_earlier_step_is_kept", async () => {
    const claude = new ClaudeDir()
      .session({ pid: process.pid, sessionId: "s1", cwd: "/work/alpha", startedAt: 1, status: "busy" })
      .transcript("s1", [toolUse("Bash", { command: "npm test" }), '{"type":"assistant","mess']);
    const { url } = await start({ claudeDir: claude.dir, exec: fakePs({}).exec });
    expect(leadsOf(await townWhere(url, () => true))[0].step).toBe("Bash: npm test");
  });

  it("a_missing_claude_folder_or_missing_sessions_dir_gives_an_empty_town", async () => {
    const { url } = await start({ claudeDir: "/nonexistent/funtown-claude", exec: fakePs({}).exec });
    expect((await townWhere(url, () => true)).houses).toEqual([]);

    const bare = new ClaudeDir();
    const { rmSync } = await import("node:fs");
    rmSync(`${bare.dir}/sessions`, { recursive: true });
    const s = await start({ claudeDir: bare.dir, exec: fakePs({}).exec });
    expect((await townWhere(s.url, () => true)).houses).toEqual([]);
  });

  it("a_plain_file_next_to_the_project_folders_does_not_crash_the_rebuild", async () => {
    const claude = new ClaudeDir()
      .session({ pid: process.pid, sessionId: "s1", cwd: "/work/alpha", startedAt: 1, status: "busy" })
      .transcript("s1", [toolUse("Bash", { command: "npm test" })]);
    writeFileSync(join(claude.dir, "projects", ".DS_Store"), "x");
    const { url } = await start({ claudeDir: claude.dir, exec: fakePs({}).exec });
    expect(leadsOf(await townWhere(url, () => true))[0].step).toBe("Bash: npm test");
  });

  it("no_claudeDir_means_no_rebuild_and_no_exec", async () => {
    const ps = fakePs({});
    const { url } = await start({ exec: ps.exec });
    expect((await townWhere(url, () => true)).houses).toEqual([]);
    expect(ps.calls).toEqual([]);
  });
});

describe("rebuilt tty and termProgram", () => {
  const rebuilt = async (psLine: string) => {
    const claude = new ClaudeDir().session({ pid: process.pid, sessionId: "s1", cwd: "/work/alpha", startedAt: 1, status: "idle" });
    const ps = fakePs({ [process.pid]: psLine });
    const runs: [string, string[]][] = [];
    const s = await start({ claudeDir: claude.dir, exec: ps.exec, run: async (f, a) => void runs.push([f, a]) });
    return { ...s, ps, runs };
  };

  it("tty_and_term_program_come_from_the_ps_line_and_jump_runs_osascript_with_that_tty", async () => {
    const { url, ps, runs } = await rebuilt(PS);
    expect(ps.calls).toContainEqual(["ps", ["-wwE", "-o", "tty=,command=", "-p", String(process.pid)]]);
    const lead = leadsOf(await townWhere(url, () => true))[0];
    expect([lead.tty, lead.termProgram]).toEqual(["ttys004", "Apple_Terminal"]);

    const res = await fetch(`${url}/jump`, { method: "POST", headers: { "content-type": "application/json", origin: url }, body: JSON.stringify({ lead: "s1" }) });
    expect(res.status).toBe(204);
    expect(runs).toHaveLength(1);
    expect(runs[0][0]).toBe("osascript");
    expect(runs[0][1].join("\n")).toContain("ttys004");
  });

  it("a_double_question_mark_tty_and_a_missing_term_program_are_null", async () => {
    const { url } = await rebuilt("??  claude --resume SHELL=/bin/zsh");
    const lead = leadsOf(await townWhere(url, () => true))[0];
    expect([lead.tty, lead.termProgram]).toEqual([null, null]);
  });
});

describe("hook event after a rebuild", () => {
  it("an_event_for_a_rebuilt_session_updates_the_same_lead_without_a_second_character", async () => {
    const claude = new ClaudeDir().session({ pid: process.pid, sessionId: "s1", cwd: "/work/alpha", startedAt: 1, status: "idle" });
    const { url } = await start({ claudeDir: claude.dir, exec: fakePs({ [process.pid]: PS }).exec });
    await post(url, {
      hook_event_name: "PreToolUse", session_id: "s1", cwd: "/work/alpha",
      tool_name: "Bash", tool_input: { command: "ls" },
      funtown: { tty: "ttys004", term_program: "Apple_Terminal", at: 1 },
    });
    const town = await townWhere(url, (t) => leadsOf(t)[0]?.step === "Bash: ls");
    expect(leadsOf(town).map((l) => [l.id, l.name, l.stage])).toEqual([["s1", "lead-1", "working"]]);
    expect(town.houses).toHaveLength(1);
  });
});
