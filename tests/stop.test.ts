import { expect, it } from "vitest";
import { leadsOf, listed, listedBg, postPage, projectsPath, realDir, start, tokenOf, townWhere } from "./helpers.ts";

const BG = "abcd1234-0000-4000-8000-000000000000";

/** A server listing one background session `BG` and one terminal session `t1`, both in a real folder. */
async function withSessions() {
  const cwd = realDir();
  const s = await start();
  s.fake.list([listedBg(BG, cwd, { name: "beta" }), listed("t1", cwd, { name: "alpha" })]);
  await townWhere(s.url, (t) => leadsOf(t).length === 2);
  return { ...s, cwd };
}

it("stop_runs_claude_stop_with_the_short_id_and_the_session_leaves_the_list_while_others_stay", async () => {
  const s = await withSessions();
  const res = await postPage(s, "/sessions/stop", { lead: BG });
  expect(res.status).toBe(204);
  expect(s.fake.stopCalls()).toEqual([["stop", "abcd1234"]]);
  const town = await townWhere(s.url, (t) => leadsOf(t).length === 1);
  expect(leadsOf(town).map((l) => l.id)).toEqual(["t1"]);
});

it("stop_hands_the_id_to_claude_as_one_argument_however_it_looks", async () => {
  const cwd = realDir();
  const s = await start();
  const odd = "a b;$(touch pwned) `x` 'y' \"z\"";
  s.fake.list([listedBg(BG, cwd, { id: odd })]);
  await townWhere(s.url, (t) => leadsOf(t).length === 1);
  expect((await postPage(s, "/sessions/stop", { lead: BG })).status).toBe(204);
  expect(s.fake.stopCalls()).toEqual([["stop", odd]]);
});

it("stop_of_a_terminal_session_gets_409_and_runs_nothing", async () => {
  const s = await withSessions();
  const res = await postPage(s, "/sessions/stop", { lead: "t1" });
  expect(res.status).toBe(409);
  expect(s.fake.stopCalls()).toEqual([]);
  expect(s.fake.sessions().map((l) => l.sessionId)).toContain("t1");
});

it("stop_of_an_unknown_or_unlisted_lead_gets_404_and_runs_nothing_while_a_listed_one_still_stops", async () => {
  const inside = realDir();
  const outside = realDir();
  const projects = projectsPath();
  const s = await start({ projects });
  expect((await postPage(s, "/projects", { cwd: inside })).status).toBe(201);
  const OUT = "ffff9999-0000-4000-8000-000000000000";
  s.fake.list([listedBg(BG, inside), listedBg(OUT, outside)]);
  await townWhere(s.url, (t) => leadsOf(t).length === 1);

  expect((await postPage(s, "/sessions/stop", { lead: "nope" })).status).toBe(404);
  expect((await postPage(s, "/sessions/stop", { lead: OUT })).status).toBe(404);
  expect(s.fake.stopCalls()).toEqual([]);
  expect((await postPage(s, "/sessions/stop", { lead: BG })).status).toBe(204);
  expect(s.fake.stopCalls()).toEqual([["stop", "abcd1234"]]);
  expect(s.fake.sessions().map((l) => l.sessionId)).toEqual([OUT]);
});

it("stop_gets_500_with_a_text_reason_when_claude_stop_fails_and_the_session_stays_listed", async () => {
  const s = await withSessions();
  s.fake.failStop();
  const res = await postPage(s, "/sessions/stop", { lead: BG });
  expect(res.status).toBe(500);
  expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
  expect((await res.text()).length).toBeGreaterThan(0);
  expect(leadsOf(await townWhere(s.url, (t) => leadsOf(t).length === 2)).map((l) => l.id)).toContain(BG);
});

it("stop_without_the_token_or_from_another_origin_gets_403_and_runs_nothing", async () => {
  const s = await withSessions();
  const token = await tokenOf(s.url);
  const body = { lead: BG };
  expect((await postPage(s, "/sessions/stop", body, { origin: s.url })).status).toBe(403);
  expect((await postPage(s, "/sessions/stop", body, { origin: s.url, "x-funtown-token": "0".repeat(32) })).status).toBe(403);
  expect((await postPage(s, "/sessions/stop", body, { origin: "http://evil.example", "x-funtown-token": token })).status).toBe(403);
  expect((await postPage(s, "/sessions/stop", body, { "x-funtown-token": token })).status).toBe(403);
  expect(s.fake.stopCalls()).toEqual([]);
});
