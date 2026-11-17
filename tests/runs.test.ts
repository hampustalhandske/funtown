import { expect, it } from "vitest";
import { leadsOf, listed, realDir, start, townWhere, postPage } from "./helpers.ts";

/** A server with one house (a listed session) in a real folder. */
async function withHouse() {
  const cwd = realDir();
  const s = await start();
  s.fake.list([listed("s1", cwd)]);
  await townWhere(s.url, (t) => leadsOf(t).length === 1);
  return { ...s, cwd };
}

it("runs_starts_claude_bg_with_the_prompt_as_one_argument_and_no_isolation_override_in_the_houses_folder", async () => {
  const s = await withHouse();
  const prompt = "fix the bug; echo $HOME && `whoami` \"quoted\" 'x'\nsecond line";
  const res = await postPage(s, "/runs", { cwd: s.cwd, prompt });
  expect(res.status).toBe(201);
  const { id } = (await res.json()) as { id: string };
  expect(id).toMatch(/^[0-9a-f]{8}$/);
  const [call, ...more] = s.fake.started();
  expect(more).toEqual([]);
  expect(call.cwd).toBe(s.cwd);
  expect(call.argv).toEqual(["--bg", prompt]);
  const town = await townWhere(s.url, (t) => leadsOf(t).some((l) => l.kind === "background"));
  expect(leadsOf(town).find((l) => l.kind === "background")).toMatchObject({ shortId: id });
});

it("runs_refuses_an_empty_a_dash_leading_or_over_16_kb_prompt_with_400_and_starts_nothing", async () => {
  const s = await withHouse();
  for (const prompt of ["", "-p hi", "--settings x", "x".repeat(16 * 1024 + 1)]) {
    expect((await postPage(s, "/runs", { cwd: s.cwd, prompt })).status, prompt.slice(0, 20)).toBe(400);
  }
  expect((await postPage(s, "/runs", { cwd: s.cwd, prompt: "x".repeat(16 * 1024) })).status).toBe(201);
  expect(s.fake.started()).toHaveLength(1);
});

it("runs_outside_a_house_gets_404_and_without_the_token_or_origin_403_and_starts_nothing", async () => {
  const s = await withHouse();
  expect((await postPage(s, "/runs", { cwd: realDir(), prompt: "hi" })).status).toBe(404);
  expect((await postPage(s, "/runs", { cwd: s.cwd, prompt: "hi" }, { origin: s.url })).status).toBe(403);
  expect((await postPage(s, "/runs", { cwd: s.cwd, prompt: "hi" }, { origin: "http://evil.example", "x-funtown-token": "0".repeat(32) })).status).toBe(403);
  expect(s.fake.started()).toEqual([]);
});

it("runs_gets_500_with_a_text_reason_when_claude_bg_fails", async () => {
  const s = await withHouse();
  s.fake.failBg();
  const res = await postPage(s, "/runs", { cwd: s.cwd, prompt: "hi" });
  expect(res.status).toBe(500);
  expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
  expect((await res.text()).length).toBeGreaterThan(0);
});
