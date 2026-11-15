import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { fakeClaude, leadsOf, listed, listedBg, start, townWhere, until } from "./helpers.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

it("the_page_shows_exactly_the_listed_sessions_grouped_by_cwd_with_name_kind_and_stage", async () => {
  const { url, fake } = await start();
  fake.list([
    listed("aaaa1111-x", "/work/a", { name: "alpha", status: "busy" }),
    listedBg("bbbb2222-x", "/work/a", { name: "s3bg", status: "idle" }),
    listedBg("cccc3333-x", "/work/b", { name: "waiter", status: "waiting", waitingFor: "permission prompt" }),
    listed("dddd4444-x", "/work/c", { name: undefined }),
  ]);
  const town = await townWhere(url, (t) => leadsOf(t).length === 4);
  expect(town.houses.map((h) => [h.cwd, h.project, h.leads.length])).toEqual([
    ["/work/a", "a", 2], ["/work/b", "b", 1], ["/work/c", "c", 1],
  ]);
  const by = (id: string) => leadsOf(town).find((l) => l.id === id)!;
  expect(by("aaaa1111-x")).toMatchObject({ name: "alpha", kind: "terminal", shortId: null, stage: "working" });
  expect(by("bbbb2222-x")).toMatchObject({ name: "s3bg", kind: "background", shortId: "bbbb2222", stage: "needs_you", needs: "turn ended" });
  expect(by("cccc3333-x")).toMatchObject({ kind: "background", stage: "needs_you", needs: "permission prompt" });
  expect(by("dddd4444-x").name).toBe("lead-1");
});

it("a_session_that_leaves_the_list_leaves_the_page_within_5_seconds_and_a_status_change_updates_it", async () => {
  const { url, fake } = await start();
  fake.list([listed("s1", "/work/a", { status: "busy" }), listed("s2", "/work/a")]);
  await townWhere(url, (t) => leadsOf(t).length === 2);
  fake.list([listed("s1", "/work/a", { status: "waiting", waitingFor: "permission prompt" })]);
  const town = await townWhere(url, (t) => leadsOf(t).length === 1, 5000);
  expect(leadsOf(town)[0]).toMatchObject({ id: "s1", stage: "needs_you", needs: "permission prompt" });
  fake.list([]);
  expect(leadsOf(await townWhere(url, (t) => leadsOf(t).length === 0, 5000))).toEqual([]);
});

it.each([
  ["exits_non_zero", (f: ReturnType<typeof fakeClaude>) => f.failList()],
  ["prints_text_that_is_not_json", (f: ReturnType<typeof fakeClaude>) => f.rawList("not json {")],
])("a_poll_that_%s_keeps_the_last_list_and_polling_resumes", async (_name, break_) => {
  const { url, fake } = await start();
  fake.list([listed("s1", "/work/a")]);
  await townWhere(url, (t) => leadsOf(t).length === 1);
  break_(fake);
  await sleep(500); // several polls
  expect(leadsOf(await townWhere(url, () => true)).map((l) => l.id)).toEqual(["s1"]);
  fake.failList(false).list([listed("s2", "/work/a")]);
  expect(leadsOf(await townWhere(url, (t) => leadsOf(t)[0]?.id === "s2")).map((l) => l.id)).toEqual(["s2"]);
});

it("the_version_check_reports_one_problem_line_per_failing_feature_and_none_for_the_minimum", async () => {
  const ok = await start();
  const good = await townWhere(ok.url, (t) => t.claude !== undefined && t.claude.version !== null);
  expect(good.claude).toEqual({ version: "2.1.325", problems: [] });

  for (const version of ["2.1.324", null]) {
    const s = await start({ fake: fakeClaude().version(version) });
    const town = await townWhere(s.url, (t) => (t.claude?.problems.length ?? 0) > 0);
    expect(town.claude.version).toBe(version);
    expect(town.claude.problems.length).toBeGreaterThan(0);
    expect(new Set(town.claude.problems).size).toBe(town.claude.problems.length);
  }
});

it("start_prints_every_problem_line_the_page_shows_and_main_reads_FUNTOWN_CLAUDE", async () => {
  const fake = fakeClaude().version("2.1.300");
  const port = await new Promise<number>((res) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => res(p));
    });
  });
  const env = { ...process.env, FUNTOWN_PORT: String(port), FUNTOWN_CLAUDE: fake.path };
  const child = spawn("node", [resolve(import.meta.dirname, "../server/main.ts")], { env });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  try {
    await until(() => output.includes("running at"), 8000);
    const town = await townWhere(`http://127.0.0.1:${port}`, (t) => (t.claude?.problems.length ?? 0) > 0);
    expect(town.claude.version).toBe("2.1.300");
    for (const line of town.claude.problems) expect(output).toContain(line);
  } finally {
    child.kill();
  }
});
