import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ev, fakeClaude, houseAt, leadsOf, listed, post, postPage, pr, realDir, sleep, start, townWhere } from "./helpers.ts";

/** A folder named `name` inside `parent`, made. */
const folder = (parent: string, ...name: string[]) => {
  const dir = join(parent, ...name);
  mkdirSync(dir, { recursive: true });
  return dir;
};

/** A projects file holding `list`, as the path to give `start`. */
const projectsFile = (list: string[]) => {
  const path = join(realDir(), "projects.json");
  writeFileSync(path, JSON.stringify(list));
  return path;
};

/** A server with `list` added as projects, listing `sessions` as [id, cwd] pairs, polling PRs every 100 ms. */
async function serve(list: string[], sessions: [string, string][], opts: Parameters<typeof start>[0] = {}) {
  const fake = opts.fake ?? fakeClaude();
  fake.list(sessions.map(([id, cwd]) => listed(id, cwd)));
  return start({ projects: projectsFile(list), prMs: 100, ...opts, fake });
}

describe("one project, one house", () => {
  it("a_runs_worktree_and_a_subfolder_session_are_leads_in_their_projects_house_each_carrying_its_own_folder", async () => {
    // Breaks if a worktree or a subfolder makes a house of its own, or the lead's own folder is lost.
    const project = realDir();
    const worktree = folder(project, ".claude", "worktrees", "run1");
    const web = folder(project, "web");
    const s = await serve([project], [["s1", project], ["s2", worktree], ["s3", web]]);
    const town = await townWhere(s.url, (t) => leadsOf(t).length === 3);
    expect(town.houses.map((h) => h.cwd)).toEqual([project]);
    expect(houseAt(town, project)).toMatchObject({ added: true, seen: true });
    expect(houseAt(town, project)!.project).toBe(project.split("/").pop());
    expect(houseAt(town, project)!.leads.map((l) => [l.id, l.cwd])).toEqual([["s1", project], ["s2", worktree], ["s3", web]]);
  });

  it("the_deepest_of_two_nested_projects_wins", async () => {
    // Breaks if a session in /a/b/c goes to /a, or one in /a/c to /a/b.
    const outer = realDir();
    const inner = folder(outer, "b");
    const deep = folder(inner, "c");
    const beside = folder(outer, "c");
    const s = await serve([outer, inner], [["deep", deep], ["beside", beside]]);
    const town = await townWhere(s.url, (t) => leadsOf(t).length === 2);
    expect(houseAt(town, inner)!.leads.map((l) => l.id)).toEqual(["deep"]);
    expect(houseAt(town, outer)!.leads.map((l) => l.id)).toEqual(["beside"]);
    expect(town.houses.map((h) => h.cwd)).toEqual([outer, inner]);
  });

  it("a_project_whose_name_starts_a_longer_folders_name_does_not_hold_it", async () => {
    // Breaks if "<p>-other" counts as inside "<p>".
    const root = realDir();
    const p = folder(root, "app");
    const other = folder(root, "app-other");
    const src = folder(other, "src");
    const s = await serve([p, other], [["s1", src]]);
    const town = await townWhere(s.url, (t) => leadsOf(t).length === 1);
    expect(houseAt(town, p)!.leads).toEqual([]);
    expect(houseAt(town, other)!.leads.map((l) => l.id)).toEqual(["s1"]);
  });

  it("a_session_in_a_folder_that_only_shares_a_projects_name_prefix_stays_hidden", async () => {
    // Breaks if "<p>-other" is shown when only "<p>" is added.
    const root = realDir();
    const p = folder(root, "app");
    const other = folder(root, "app-other");
    const s = await serve([p], [["s1", other]]);
    await sleep(300);
    expect(leadsOf(await townWhere(s.url, () => true))).toEqual([]);
  });

  it("without_a_projects_file_every_folder_is_its_own_house", async () => {
    // Breaks if a bare server folds a subfolder into another folder's house.
    const project = realDir();
    const web = folder(project, "web");
    const fake = fakeClaude().list([listed("s1", project), listed("s2", web)]);
    const s = await start({ fake });
    const town = await townWhere(s.url, (t) => leadsOf(t).length === 2);
    expect(town.houses.map((h) => h.cwd)).toEqual([project, web]);
    expect(leadsOf(town).map((l) => l.cwd)).toEqual([project, web]);
  });

  it("every_lead_carries_the_cwd_the_list_gives_it", async () => {
    // Breaks if Lead.cwd is missing on a lead of a house that is its own folder.
    const cwd = realDir();
    const s = await serve([cwd], [["s1", cwd]]);
    const town = await townWhere(s.url, (t) => leadsOf(t).length === 1);
    expect(leadsOf(town)[0].cwd).toBe(cwd);
  });
});

describe("what a house reads", () => {
  it("one_pr_list_runs_per_house_in_the_project_folder_never_in_a_worktree_or_a_subfolder", async () => {
    // Breaks if a run's worktree lists the same PRs a second time.
    const project = realDir();
    const worktree = folder(project, ".claude", "worktrees", "run1");
    const web = folder(project, "web");
    const fake = fakeClaude().prs(project, [pr(7)]);
    const s = await serve([project], [["s1", project], ["s2", worktree], ["s3", web]], { fake });
    const town = await townWhere(s.url, (t) => leadsOf(t).length === 3 && (houseAt(t, project)?.parcels?.length ?? 0) === 1);
    await sleep(350); // a few more polls
    expect(houseAt(town, project)!.parcels!.map((p) => p.number)).toEqual([7]);
    expect([...new Set(fake.prCalls().map((c) => c.cwd))]).toEqual([project]);
  });

  it("the_house_shows_the_project_folders_phase_file_and_never_a_worktrees_own", async () => {
    // Breaks if a run's own phase file replaces or adds to the project's.
    const project = realDir();
    const worktree = folder(project, ".claude", "worktrees", "run1");
    writeFileSync(join(folder(project, ".claude"), "phase.json"), JSON.stringify({ phase: "build" }));
    writeFileSync(join(folder(worktree, ".claude"), "phase.json"), JSON.stringify({ phase: "from the run" }));
    const s = await serve([project], [["s1", worktree]]);
    const town = await townWhere(s.url, (t) => houseAt(t, project)?.phase !== undefined);
    expect(houseAt(town, project)!.phase).toEqual({ phase: "build" });
    expect(town.houses).toHaveLength(1);
  });

  it("the_project_folders_tags_reach_a_runs_subagents", async () => {
    // Breaks if a run in a worktree gets no tags because its own folder has no phase file.
    const project = realDir();
    const worktree = folder(project, ".claude", "worktrees", "run1");
    writeFileSync(join(folder(project, ".claude"), "phase.json"), JSON.stringify({ phase: "build", tags: { implementer: ["writes", "tests"] } }));
    const s = await serve([project], [["s2", worktree]]);
    await townWhere(s.url, (t) => leadsOf(t).length === 1);
    expect(await post(s.url, ev("SubagentStart", { cwd: worktree, agent_id: "x1", agent_type: "implementer" }, "s2"))).toBe(204);
    const town = await townWhere(s.url, (t) => leadsOf(t)[0]?.subagents[0]?.tags !== undefined);
    expect(leadsOf(town)[0].subagents[0].tags).toEqual(["writes", "tests"]);
  });
});

describe("where a session, run or shell may start", () => {
  it("is_the_added_projects_and_the_listed_sessions_folders_and_no_folder_inside_a_project_otherwise", async () => {
    // Breaks if house folders replace the start list: a listed worktree must still start, an unlisted subfolder must not.
    const project = realDir();
    const worktree = folder(project, ".claude", "worktrees", "run1");
    const web = folder(project, "web");
    const s = await serve([project], [["s1", worktree]]);
    await townWhere(s.url, (t) => leadsOf(t).length === 1);
    expect((await postPage(s, "/sessions", { cwd: project })).status).toBe(201);
    expect((await postPage(s, "/sessions", { cwd: worktree })).status).toBe(201);
    expect((await postPage(s, "/sessions", { cwd: web })).status).toBe(404);
    expect((await postPage(s, "/runs", { cwd: worktree, prompt: "go" })).status).toBe(201);
    expect((await postPage(s, "/runs", { cwd: web, prompt: "go" })).status).toBe(404);
    expect(s.fake.started().map((c) => c.cwd)).toEqual([project, worktree, worktree]);
  });
});
