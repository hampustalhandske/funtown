import { mkdirSync, symlinkSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { errorLines, fakeClaude, getProjects, houseAt, leadsOf, listed, postPage, pr, projectsPath, realDir, sleep, start, tokenOf, townWhere } from "./helpers.ts";

it("projects_rejects_a_relative_a_missing_and_a_file_path_with_400_and_a_reason_and_lists_nothing", async () => {
  const dir = realDir();
  const file = join(dir, "a-file");
  writeFileSync(file, "x");
  const s = await start({ projects: projectsPath() });
  for (const cwd of ["relative/dir", join(dir, "missing"), file]) {
    const res = await postPage(s, "/projects", { cwd });
    expect(res.status, cwd).toBe(400);
    expect((await res.text()).length, cwd).toBeGreaterThan(0);
  }
  expect(await getProjects(s)).toEqual({ status: 200, list: [] });
});

it("adding_a_project_twice_keeps_one_entry_in_the_order_added_and_saves_a_json_array", async () => {
  const [a, b] = [realDir(), realDir()];
  const path = projectsPath();
  const s = await start({ projects: path });
  expect((await postPage(s, "/projects", { cwd: a })).status).toBe(201);
  expect((await postPage(s, "/projects", { cwd: b })).status).toBe(201);
  expect((await postPage(s, "/projects", { cwd: a })).status).toBe(200);
  expect((await getProjects(s)).list).toEqual([a, b]);
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual([a, b]);
});

it("a_project_survives_a_server_restart", async () => {
  const cwd = realDir();
  const path = projectsPath();
  await (async () => {
    const first = await start({ projects: path });
    await postPage(first, "/projects", { cwd });
    await first.close();
  })();
  const second = await start({ projects: path });
  expect((await getProjects(second)).list).toEqual([cwd]);
});

it("a_project_with_no_session_is_a_house_a_session_shows_only_once_its_folder_is_added_and_leaves_when_it_is_removed", async () => {
  const [added, addedWithSession] = [realDir(), realDir()];
  const s = await start({ projects: projectsPath() });
  s.fake.list([listed("s2", addedWithSession)]);
  await sleep(300); // a few polls: a session in a folder that isn't added stays hidden
  expect(leadsOf(await townWhere(s.url, () => true))).toEqual([]);
  await postPage(s, "/projects", { cwd: added });
  await postPage(s, "/projects", { cwd: addedWithSession });

  const town = await townWhere(s.url, (t) => houseAt(t, addedWithSession)?.leads.length === 1);
  expect(houseAt(town, added)).toMatchObject({ leads: [], added: true });
  expect(houseAt(town, addedWithSession)).toMatchObject({ added: true });
  expect(town.houses.map((h) => h.cwd)).toEqual([added, addedWithSession]);

  expect((await postPage(s, "/projects/remove", { cwd: added })).status).toBe(204);
  expect((await postPage(s, "/projects/remove", { cwd: addedWithSession })).status).toBe(204);
  expect((await postPage(s, "/projects/remove", { cwd: added })).status).toBe(404);
  const after = await townWhere(s.url, (t) => t.houses.length === 0);
  expect(leadsOf(after)).toEqual([]);
  expect((await getProjects(s)).list).toEqual([]);
});

it("an_unparsable_projects_file_means_no_projects_and_one_log_line_however_many_polls_run", async () => {
  const path = projectsPath();
  writeFileSync(path, "{not json");
  const log = join(realDir(), "errors.log");
  const s = await start({ projects: path, errorLog: log });
  await sleep(500); // about five polls
  expect((await getProjects(s)).list).toEqual([]);
  expect(errorLines(log).filter((l) => l.source === "server" && l.step === "projects")).toHaveLength(1);
});

it("an_unreadable_projects_file_is_never_overwritten_adds_and_removes_answer_500_naming_it_until_it_reads", async () => {
  const [a, b] = [realDir(), realDir()];
  const path = projectsPath();
  writeFileSync(path, "{not json");
  const s = await start({ projects: path });
  for (const [route, cwd] of [["/projects", a], ["/projects/remove", b]]) {
    const res = await postPage(s, route, { cwd });
    expect(res.status, route).toBe(500);
    expect(await res.text(), route).toContain(path);
  }
  expect(readFileSync(path, "utf8")).toBe("{not json");

  writeFileSync(path, JSON.stringify([b]));
  expect((await postPage(s, "/projects", { cwd: a })).status).toBe(201);
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual([b, a]);
});

it("projects_without_the_token_or_from_another_origin_gets_403_and_changes_nothing", async () => {
  const cwd = realDir();
  const s = await start({ projects: projectsPath() });
  const token = await tokenOf(s.url);
  expect((await fetch(`${s.url}/projects`)).status).toBe(403);
  const refused: Record<string, string>[] = [{ origin: s.url }, { "x-funtown-token": token }, { origin: "http://evil.example", "x-funtown-token": token }];
  for (const headers of refused) {
    expect((await postPage(s, "/projects", { cwd }, headers)).status).toBe(403);
  }
  await postPage(s, "/projects", { cwd });
  expect((await postPage(s, "/projects/remove", { cwd }, { origin: s.url })).status).toBe(403);
  expect((await getProjects(s)).list).toEqual([cwd]);
});

it("a_server_started_without_a_projects_file_path_answers_post_projects_with_500", async () => {
  const s = await start();
  expect((await postPage(s, "/projects", { cwd: realDir() })).status).toBe(500);
});

it("new_session_and_background_run_work_in_an_added_project_with_no_session", async () => {
  const cwd = realDir();
  mkdirSync(join(cwd, "sub"));
  const s = await start({ projects: projectsPath() });
  await postPage(s, "/projects", { cwd });
  const res = await postPage(s, "/sessions", { cwd });
  expect(res.status).toBe(201);
  expect(s.fake.started().map((c) => c.cwd)).toEqual([cwd]);
  expect((await postPage(s, "/sessions", { cwd: join(cwd, "sub") })).status).toBe(404);

  const run = await postPage(s, "/runs", { cwd, prompt: "fix the bug" });
  expect(run.status).toBe(201);
  const calls = s.fake.started();
  expect(calls.map((c) => c.cwd)).toEqual([cwd, cwd]);
  expect(calls[1].argv).toEqual(["--bg", "fix the bug"]);
});

it("a_missing_projects_file_means_no_projects_and_logs_nothing", async () => {
  const log = join(realDir(), "errors.log");
  const s = await start({ projects: projectsPath(), errorLog: log });
  await sleep(500);
  expect(await getProjects(s)).toEqual({ status: 200, list: [] });
  expect(errorLines(log).filter((l) => l.step === "projects")).toEqual([]);
});

it("a_project_added_through_a_symlink_is_stored_as_its_real_folder_and_is_one_house_with_the_real_path", async () => {
  const real = realDir();
  const link = join(realDir(), "link");
  symlinkSync(real, link);
  const path = projectsPath();
  const s = await start({ projects: path });
  expect((await postPage(s, "/projects", { cwd: link })).status).toBe(201);
  expect((await postPage(s, "/projects", { cwd: real })).status).toBe(200);
  expect((await getProjects(s)).list).toEqual([real]);
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual([real]);
  s.fake.list([listed("s1", real)]);
  const town = await townWhere(s.url, (t) => leadsOf(t).length === 1);
  expect(town.houses.map((h) => h.cwd)).toEqual([real]);
});

it("an_added_project_with_no_session_shows_its_phase_and_its_pull_requests", async () => {
  const cwd = realDir();
  mkdirSync(join(cwd, ".claude"));
  writeFileSync(join(cwd, ".claude", "phase.json"), JSON.stringify({ phase: "build" }));
  const fake = fakeClaude().prs(cwd, [pr(7)]);
  const s = await start({ fake, projects: projectsPath(), prMs: 100 });
  await postPage(s, "/projects", { cwd });
  const town = await townWhere(s.url, (t) => houseAt(t, cwd)?.phase !== undefined && (houseAt(t, cwd)?.parcels?.length ?? 0) === 1);
  expect(houseAt(town, cwd)!.leads).toEqual([]);
  expect(houseAt(town, cwd)!.phase).toEqual({ phase: "build" });
  expect(houseAt(town, cwd)!.parcels!.map((p) => p.number)).toEqual([7]);
});

it("with_a_projects_file_only_sessions_in_an_added_project_or_a_folder_inside_it_show_and_only_their_folders_get_a_pr_check", async () => {
  const [added, elsewhere] = [realDir(), realDir()];
  const worktree = join(added, ".claude", "worktrees", "run1");
  const path = projectsPath();
  writeFileSync(path, JSON.stringify([added]));
  const fake = fakeClaude().list([listed("s1", added), listed("s2", worktree), listed("s3", elsewhere), listed("s4", `${added}-other`)]);
  const s = await start({ fake, projects: path, prMs: 100 });
  const t = await townWhere(s.url, (x) => leadsOf(x).length === 2);
  await sleep(300); // a few more polls, so a session from elsewhere would have shown up
  const after = await townWhere(s.url, () => true);
  expect(leadsOf(after).map((l) => l.id).sort()).toEqual(["s1", "s2"]);
  expect(t.houses.map((h) => h.cwd)).toEqual([added, worktree]);
  expect(fake.prCalls().map((c) => c.cwd)).not.toContain(elsewhere);
});
