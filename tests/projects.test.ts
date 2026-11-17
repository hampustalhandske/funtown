import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { errorLines, getProjects, houseAt, leadsOf, listed, postPage, projectsPath, realDir, sleep, start, tokenOf, townWhere } from "./helpers.ts";

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

it("a_project_with_no_session_is_a_house_before_session_only_houses_and_remove_keeps_sessions", async () => {
  const [withSession, added, addedWithSession] = [realDir(), realDir(), realDir()];
  const s = await start({ projects: projectsPath() });
  s.fake.list([listed("s1", withSession), listed("s2", addedWithSession)]);
  await townWhere(s.url, (t) => leadsOf(t).length === 2);
  await postPage(s, "/projects", { cwd: added });
  await postPage(s, "/projects", { cwd: addedWithSession });

  const town = await townWhere(s.url, (t) => houseAt(t, added) !== undefined);
  expect(houseAt(town, added)).toMatchObject({ leads: [], added: true });
  expect(houseAt(town, addedWithSession)).toMatchObject({ added: true });
  expect(houseAt(town, addedWithSession)!.leads).toHaveLength(1);
  expect(houseAt(town, withSession)!.added).toBeFalsy();
  const order = town.houses.map((h) => h.cwd);
  expect(order.indexOf(added)).toBeLessThan(order.indexOf(withSession));
  expect(order.indexOf(addedWithSession)).toBeLessThan(order.indexOf(withSession));

  expect((await postPage(s, "/projects/remove", { cwd: added })).status).toBe(204);
  expect((await postPage(s, "/projects/remove", { cwd: addedWithSession })).status).toBe(204);
  expect((await postPage(s, "/projects/remove", { cwd: added })).status).toBe(404);
  const after = await townWhere(s.url, (t) => houseAt(t, added) === undefined);
  expect(houseAt(after, addedWithSession)!.leads.map((l) => l.id)).toEqual(["s2"]);
  expect(houseAt(after, addedWithSession)!.added).toBeFalsy();
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
  const cwd = realDir();
  expect((await postPage(s, "/projects", { cwd })).status).toBe(201);
});

it("projects_without_the_token_or_from_another_origin_gets_403_and_changes_nothing", async () => {
  const cwd = realDir();
  const s = await start({ projects: projectsPath() });
  const token = await tokenOf(s.url);
  expect((await fetch(`${s.url}/projects`)).status).toBe(403);
  for (const headers of [{ origin: s.url }, { "x-funtown-token": token }, { origin: "http://evil.example", "x-funtown-token": token }]) {
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
});

it("a_missing_projects_file_means_no_projects_and_logs_nothing", async () => {
  const log = join(realDir(), "errors.log");
  const s = await start({ projects: projectsPath(), errorLog: log });
  await sleep(500);
  expect(await getProjects(s)).toEqual({ status: 200, list: [] });
  expect(errorLines(log).filter((l) => l.step === "projects")).toEqual([]);
});
