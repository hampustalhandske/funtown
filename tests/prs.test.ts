import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkRun, checkRunAt, errorLines, fakeClaude, houseAt, leadsOf, listed, pr, realDir, sleep, start, statusContext, townWhere, until } from "./helpers.ts";
import { FakeClaude, type Pr } from "./fake-claude.ts";

const GH_ARGS = ["pr", "list", "--state", "open", "--json", "number,title,url,isDraft,headRefOid,statusCheckRollup", "--limit", "50", "--author", "@me"];

/**
 * A server with no steward listing lead s1 in `cwd` (default: a fresh real folder), polling PRs
 * every 100 ms; `prs` is what gh answers there from the start.
 */
async function withProject(opts: { cwd?: string; gh?: FakeClaude; prs?: Pr[] | null } = {}) {
  const cwd = opts.cwd ?? realDir();
  const log = join(realDir(), "errors.log");
  const fake = fakeClaude().list([listed("s1", cwd)]);
  const gh = opts.gh ?? fake;
  if (opts.prs !== undefined) gh.prs(cwd, opts.prs);
  const s = await start({ fake, gh: gh.path, prMs: 100, errorLog: log });
  const prLines = () => errorLines(log).filter((l) => l.source === "server" && l.step === "prs");
  return { ...s, cwd, gh, prLines };
}

describe("parcels from gh pr list", () => {
  it("each_house_lists_its_open_prs_newest_number_first_marking_drafts_without_reviews_and_follows_each_gh_poll", async () => {
    const cwd = realDir();
    const s = await withProject({ cwd });
    s.gh.prs(cwd, [pr(3, { isDraft: true, title: "Try an idea" }), pr(12, { title: "Fix the parser" }), pr(5)]);
    const t = await townWhere(s.url, (x) => (houseAt(x, cwd)?.parcels?.length ?? 0) === 3);
    expect(houseAt(t, cwd)!.parcels).toEqual([
      { number: 12, title: "Fix the parser", url: "https://github.com/example/repo/pull/12", draft: false, checks: "none" },
      { number: 5, title: "PR 5", url: "https://github.com/example/repo/pull/5", draft: false, checks: "none" },
      { number: 3, title: "Try an idea", url: "https://github.com/example/repo/pull/3", draft: true, checks: "none" },
    ]);

    s.gh.prs(cwd, [pr(13), pr(5)]);
    const later = await townWhere(s.url, (x) => houseAt(x, cwd)?.parcels?.[0]?.number === 13);
    expect(houseAt(later, cwd)!.parcels!.map((p) => p.number)).toEqual([13, 5]);
  });

  it("gh_runs_without_a_shell_in_the_houses_folder_as_its_cwd_listing_only_the_users_own_open_prs", async () => {
    // Through a shell, the spaces and quotes in either path would break the command.
    const cwd = join(realDir(), "my app 'x' \"y\"");
    mkdirSync(cwd);
    const gh = FakeClaude.install(join(realDir(), "gh dir 'x' \"y\""));
    const s = await withProject({ cwd, gh, prs: [pr(7)] });
    await townWhere(s.url, (x) => houseAt(x, cwd)?.parcels?.length === 1);
    const calls = s.gh.prCalls().filter((c) => c.cwd === cwd);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c.argv).toEqual(GH_ARGS);
  });

  it("a_failing_gh_keeps_the_houses_last_parcels_and_logs_one_line_until_it_works_again", async () => {
    const cwd = realDir();
    const s = await withProject({ cwd, prs: null });
    await until(() => s.prLines().length === 1);
    expect(houseAt(await townWhere(s.url, (x) => leadsOf(x).length === 1), cwd)!.parcels).toBeUndefined();
    expect(s.prLines()[0].message.startsWith(`${cwd}: `)).toBe(true);

    s.gh.prs(cwd, [pr(7)]);
    await townWhere(s.url, (x) => houseAt(x, cwd)?.parcels?.length === 1);
    s.gh.prs(cwd, null);
    await until(() => s.prLines().length === 2);
    await sleep(500); // about five more failing gh polls
    expect(s.prLines()).toHaveLength(2);
    expect(houseAt(await townWhere(s.url, () => true), cwd)!.parcels!.map((p) => p.number)).toEqual([7]);
  });
});

const NO_GITHUB = [
  "failed to run git: fatal: not a git repository (or any of the parent directories): .git",
  "no git remotes found",
  "none of the git remotes configured for this repository point to a known GitHub host. To tell gh about a new GitHub host, please use `gh auth login`",
];

describe("a house with no GitHub repo, and when its PR list last worked", () => {
  it.each(NO_GITHUB)("gh_saying_%s_gives_the_house_no_prs_and_a_parcelsAt_and_logs_nothing", async (text) => {
    // Catches a project with no GitHub repo left in fog forever, or filling the log every minute.
    const cwd = realDir();
    const s = await withProject({ cwd });
    s.gh.prsFail(cwd, text);
    const before = Date.now();
    const t = await townWhere(s.url, (x) => houseAt(x, cwd)?.parcelsAt !== undefined);
    expect(houseAt(t, cwd)!.parcels).toEqual([]);
    expect(houseAt(t, cwd)!.parcelsAt!).toBeGreaterThanOrEqual(before - 1000);
    await sleep(400); // about four more polls
    expect(s.prLines()).toEqual([]);
  });

  it("a_good_list_sets_parcelsAt_each_poll_and_another_failure_keeps_the_list_and_parcelsAt_and_logs_once", async () => {
    // Catches a failed poll moving parcelsAt (it would hide the fog) or dropping the last list.
    const cwd = realDir();
    const s = await withProject({ cwd, prs: [pr(7)] });
    const first = houseAt(await townWhere(s.url, (x) => houseAt(x, cwd)?.parcelsAt !== undefined), cwd)!.parcelsAt!;
    const later = houseAt(await townWhere(s.url, (x) => (houseAt(x, cwd)?.parcelsAt ?? 0) > first), cwd)!.parcelsAt!;
    expect(later).toBeGreaterThan(first);

    s.gh.prsFail(cwd, "HTTP 502: Bad Gateway (https://api.github.com/graphql)");
    await until(() => s.prLines().length === 1);
    const kept = houseAt(await townWhere(s.url, () => true), cwd)!.parcelsAt!;
    await sleep(400);
    const t = await townWhere(s.url, () => true);
    expect(houseAt(t, cwd)!.parcelsAt).toBe(kept);
    expect(houseAt(t, cwd)!.parcels!.map((p) => p.number)).toEqual([7]);
    expect(s.prLines()).toHaveLength(1);
  });

  it("a_house_gh_has_never_answered_for_has_no_parcelsAt", async () => {
    const cwd = realDir();
    const s = await withProject({ cwd, prs: null });
    await until(() => s.prLines().length === 1);
    expect(houseAt(await townWhere(s.url, (x) => leadsOf(x).length === 1), cwd)!.parcelsAt).toBeUndefined();
  });
});

describe("each parcel's checks, read the way gh reads them", () => {
  /** The parcel #1 as the State shows it once gh answers with `rollup` for it. */
  async function parcelWith(rollup: unknown) {
    const cwd = realDir();
    const s = await withProject({ cwd, prs: [pr(1, { statusCheckRollup: rollup })] });
    const t = await townWhere(s.url, (x) => houseAt(x, cwd)?.parcels?.length === 1);
    return houseAt(t, cwd)!.parcels![0];
  }
  const T = (iso: string) => Date.parse(iso);

  it("a_failed_check_makes_the_parcel_red_with_the_time_it_finished_so_a_red_pr_never_looks_green", async () => {
    const p = await parcelWith([checkRun("SUCCESS"), checkRun("FAILURE", "2026-11-28T05:02:42Z")]);
    expect(p).toMatchObject({ checks: "red", redAt: T("2026-11-28T05:02:42Z") });
  });

  it("each_of_gh_failed_conclusions_is_red_and_a_startup_failure_too_so_a_workflow_that_never_started_is_not_running_for_ever", async () => {
    for (const c of ["FAILURE", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"]) {
      expect((await parcelWith([checkRun(c)])).checks, c).toBe("red");
    }
  });

  it("the_earliest_failed_finish_is_redAt_and_a_failed_item_without_a_time_leaves_it_out", async () => {
    const early = await parcelWith([checkRun("FAILURE", "2026-11-28T06:00:00Z"), checkRun("TIMED_OUT", "2026-11-28T05:00:00Z"), checkRun("SUCCESS", "2026-11-28T01:00:00Z")]);
    expect(early.redAt).toBe(T("2026-11-28T05:00:00Z"));
    const none = await parcelWith([{ ...checkRun("FAILURE"), completedAt: undefined }]);
    expect(none.checks).toBe("red");
    expect(none).not.toHaveProperty("redAt");
  });

  it("a_pending_check_makes_the_parcel_running_and_a_parcel_with_only_passed_checks_green", async () => {
    for (const status of ["QUEUED", "IN_PROGRESS", "PENDING", "WAITING", "REQUESTED"]) {
      const p = await parcelWith([checkRun("SUCCESS"), checkRunAt(status)]);
      expect(p.checks, status).toBe("running");
      expect(p).not.toHaveProperty("redAt");
    }
    const green = await parcelWith([checkRun("SUCCESS"), checkRun("NEUTRAL")]);
    expect(green.checks).toBe("green");
    expect(green).not.toHaveProperty("redAt");
  });

  it("cancelled_and_skipped_checks_are_settled_so_fire_means_only_that_a_check_failed", async () => {
    expect((await parcelWith([checkRun("CANCELLED"), checkRun("SKIPPED")])).checks).toBe("green");
  });

  it("an_empty_rollup_is_none_never_green_so_the_town_does_not_look_calm_when_nothing_checked_the_pr", async () => {
    expect(await parcelWith([])).toMatchObject({ checks: "none" });
  });

  it("a_status_context_is_read_by_its_state_and_its_start_time_is_redAt", async () => {
    expect(await parcelWith([statusContext("SUCCESS")])).toMatchObject({ checks: "green" });
    expect(await parcelWith([statusContext("PENDING")])).toMatchObject({ checks: "running" });
    expect(await parcelWith([statusContext("EXPECTED")])).toMatchObject({ checks: "running" });
    expect(await parcelWith([statusContext("ERROR", "2026-11-28T05:00:00Z")])).toMatchObject({ checks: "red", redAt: T("2026-11-28T05:00:00Z") });
    expect(await parcelWith([statusContext("FAILURE")])).toMatchObject({ checks: "red" });
  });

  it("red_beats_running_and_running_beats_passed_in_a_mix", async () => {
    const mix = [checkRun("SUCCESS"), checkRunAt("IN_PROGRESS"), statusContext("FAILURE", "2026-11-28T05:00:00Z"), checkRun("SKIPPED")];
    expect(await parcelWith(mix)).toMatchObject({ checks: "red", redAt: T("2026-11-28T05:00:00Z") });
    expect((await parcelWith(mix.filter((i) => i.__typename !== "StatusContext"))).checks).toBe("running");
  });

  // One test per odd item: each item starts two servers, so one test for all of them ran close to the 5 s limit.
  it.each([{}, { __typename: "Other" }, "x", null, 7, { status: "COMPLETED", conclusion: "SURPRISE" }].map((odd) => [JSON.stringify(odd), odd]))(
    "an_item_of_an_unknown_shape_counts_as_running_so_an_odd_item_never_puts_a_fire_out_nor_makes_one: %s",
    async (_name, odd) => {
      expect((await parcelWith([checkRun("SUCCESS"), odd])).checks).toBe("running");
      expect((await parcelWith([checkRun("FAILURE"), odd])).checks).toBe("red");
    },
  );

  it("a_rollup_that_is_not_a_list_makes_the_list_invalid_so_the_house_keeps_its_last_parcels_and_logs_once", async () => {
    const cwd = realDir();
    const s = await withProject({ cwd, prs: [pr(7)] });
    await townWhere(s.url, (x) => houseAt(x, cwd)?.parcels?.length === 1);
    for (const bad of [{ state: "SUCCESS" }, "SUCCESS", null]) {
      s.gh.prs(cwd, [pr(8, { statusCheckRollup: bad })]);
      await until(() => s.prLines().length >= 1);
    }
    const lines = s.prLines().length;
    await sleep(300);
    expect(s.prLines()).toHaveLength(lines);
    expect(s.prLines()[0].message).toContain("not a list of PRs");
    expect(houseAt(await townWhere(s.url, () => true), cwd)!.parcels!.map((p) => p.number)).toEqual([7]);
  });
});
