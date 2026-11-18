import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { errorLines, fakeClaude, houseAt, leadsOf, listed, pr, realDir, sleep, start, townWhere, until } from "./helpers.ts";
import { FakeClaude, type Pr } from "./fake-claude.ts";

const GH_ARGS = ["pr", "list", "--state", "open", "--json", "number,title,url,isDraft,headRefOid", "--limit", "50", "--author", "@me"];

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
      { number: 12, title: "Fix the parser", url: "https://github.com/example/repo/pull/12", draft: false },
      { number: 5, title: "PR 5", url: "https://github.com/example/repo/pull/5", draft: false },
      { number: 3, title: "Try an idea", url: "https://github.com/example/repo/pull/3", draft: true },
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
