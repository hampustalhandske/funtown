import { describe, expect, it } from "vitest";
import { ev, leadsOf, listed, post, start, townWhere, type Json } from "./helpers.ts";
import type { Town } from "../server/types.ts";

const P = "/work/app";
const WORKTREE = `${P}/.claude/worktrees/feat`;

/** A server listing alpha (s1) and beta (s2), each in its own folder (default: both in P). */
async function withTwoLeads(cwd1 = P, cwd2 = P) {
  const s = await start();
  const both = [listed("s1", cwd1, { name: "alpha" }), listed("s2", cwd2, { name: "beta" })];
  s.fake.list(both);
  await townWhere(s.url, (t) => leadsOf(t).length === 2);
  const cwdOf: Record<string, string> = { s1: cwd1, s2: cwd2 };
  /** Posts a PreToolUse from `session` (or its subagent `agent`) for `tool` with `input`. */
  const tool = async (session: string, tool: string, input: Json, agent?: string) => {
    const sub = agent ? { agent_id: agent, agent_type: "implementer" } : {};
    expect(await post(s.url, ev("PreToolUse", { cwd: cwdOf[session], tool_name: tool, tool_input: input, ...sub }, session))).toBe(204);
  };
  return { ...s, both, tool };
}

const lead = (t: Town, id: string) => leadsOf(t).find((l) => l.id === id);
const byFile = <T extends { file: string }>(list: T[] | undefined) => [...(list ?? [])].sort((a, b) => a.file.localeCompare(b.file));

describe("overlap warnings", () => {
  it("two_leads_that_edit_write_multiedit_or_notebookedit_one_file_both_warn_and_a_read_never_counts", async () => {
    const s = await withTwoLeads();
    await post(s.url, ev("SubagentStart", { cwd: P, agent_id: "x2", agent_type: "implementer" }, "s2"));
    await s.tool("s1", "Edit", { file_path: `${P}/src/a.ts`, old_string: "a", new_string: "b" });
    await s.tool("s2", "Write", { file_path: `${P}/src/a.ts`, content: "x" });
    await s.tool("s1", "NotebookEdit", { notebook_path: `${P}/nb/n.ipynb`, new_source: "1" });
    await s.tool("s2", "MultiEdit", { file_path: `${P}/nb/n.ipynb`, edits: [] }, "x2");
    await s.tool("s1", "Edit", { file_path: `${P}/src/read-only.ts`, old_string: "a", new_string: "b" });
    await s.tool("s2", "Read", { file_path: `${P}/src/read-only.ts` });

    const t = await townWhere(s.url, (x) => (lead(x, "s1")?.overlaps?.length ?? 0) >= 2 && (lead(x, "s2")?.overlaps?.length ?? 0) >= 2);
    expect(byFile(lead(t, "s1")!.overlaps)).toEqual([
      { file: "nb/n.ipynb", with: "s2", withName: "beta" },
      { file: "src/a.ts", with: "s2", withName: "beta" },
    ]);
    expect(byFile(lead(t, "s2")!.overlaps)).toEqual([
      { file: "nb/n.ipynb", with: "s1", withName: "alpha" },
      { file: "src/a.ts", with: "s1", withName: "alpha" },
    ]);
  });

  it("a_lead_and_its_own_subagent_editing_one_file_is_no_overlap", async () => {
    const s = await withTwoLeads();
    await post(s.url, ev("SubagentStart", { cwd: P, agent_id: "x1", agent_type: "implementer" }, "s1"));
    await s.tool("s1", "Edit", { file_path: `${P}/src/own.ts`, old_string: "a", new_string: "b" });
    await s.tool("s1", "Write", { file_path: `${P}/src/own.ts`, content: "x" }, "x1");
    // A real overlap last, so the state below has applied every event before it.
    await s.tool("s1", "Write", { file_path: `${P}/src/shared.ts`, content: "x" });
    await s.tool("s2", "Write", { file_path: `${P}/src/shared.ts`, content: "y" });

    const t = await townWhere(s.url, (x) => (lead(x, "s1")?.overlaps?.length ?? 0) >= 1);
    expect(lead(t, "s1")!.overlaps).toEqual([{ file: "src/shared.ts", with: "s2", withName: "beta" }]);
  });

  it("a_file_edited_in_a_worktree_matches_the_same_file_in_the_main_tree", async () => {
    const s = await withTwoLeads(P, WORKTREE);
    await s.tool("s1", "Edit", { file_path: `${P}/src/a.ts`, old_string: "a", new_string: "b" });
    await s.tool("s2", "Edit", { file_path: `${WORKTREE}/src/a.ts`, old_string: "a", new_string: "b" });

    const t = await townWhere(s.url, (x) => lead(x, "s1")?.overlaps !== undefined && lead(x, "s2")?.overlaps !== undefined);
    expect(lead(t, "s1")!.overlaps).toEqual([{ file: "src/a.ts", with: "s2", withName: "beta" }]);
    expect(lead(t, "s2")!.overlaps).toEqual([{ file: "src/a.ts", with: "s1", withName: "alpha" }]);
  });

  it("the_warning_goes_once_the_other_lead_is_no_longer_listed", async () => {
    const s = await withTwoLeads();
    await s.tool("s1", "Edit", { file_path: `${P}/src/a.ts`, old_string: "a", new_string: "b" });
    await s.tool("s2", "Edit", { file_path: `${P}/src/a.ts`, old_string: "a", new_string: "b" });
    await townWhere(s.url, (x) => lead(x, "s1")?.overlaps !== undefined);

    s.fake.list([s.both[0]]);
    await townWhere(s.url, (x) => leadsOf(x).length === 1 && lead(x, "s1")?.overlaps === undefined);
  });
});
