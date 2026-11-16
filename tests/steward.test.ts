import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { errorLines, ev, fakeClaude, houseAt, jsonLines, listed, listedBg, pastes, post, pr, realDir, sleep, start, tokenOf, townWhere, until } from "./helpers.ts";
import type { FakeClaude, Pr } from "./fake-claude.ts";
import type { Letter, Town } from "../server/types.ts";

const BG_SETTINGS = '{"worktree":{"bgIsolation":"none"}}';
const TEMPLATE = "Review PR #{number}: {title}\nRead {url}, then diff {url}.";
/** TEMPLATE filled in for `p`, by hand. */
const filled = (p: Pr) => `Review PR #${p.number}: ${p.title}\nRead ${p.url}, then diff ${p.url}.`;

/** Fresh folders for one test: the project, the steward's folder (not made yet), the prompt file, the journal and the error log. */
function paths(prompt = TEMPLATE) {
  const root = realDir();
  const project = join(root, "app");
  mkdirSync(project);
  const promptFile = join(root, "steward.md");
  writeFileSync(promptFile, prompt);
  return { project, stewardDir: join(root, "funtown", "steward"), promptFile, journal: join(root, "journal.jsonl"), log: join(root, "errors.log") };
}
type Paths = ReturnType<typeof paths>;

/** A fake listing lead s1 in the project, whose gh lists `prs` there. */
const fakeWith = (p: Paths, prs: Pr[]) => fakeClaude().list([listed("s1", p.project, { name: "alpha" })]).prs(p.project, prs);

/** A server with reviews on, polling PRs every 100 ms. */
const startSteward = (p: Paths, fake: FakeClaude) =>
  start({ fake, prMs: 100, stewardDir: p.stewardDir, stewardPrompt: p.promptFile, journal: p.journal, errorLog: p.log });

/** The session the fake lists in the steward's folder, once one is. */
const stewardOf = (fake: FakeClaude, p: Paths) => fake.sessions().find((x) => x.cwd === p.stewardDir);

/** Waits for the steward session and gives its session id and short id. */
async function stewardStarted(fake: FakeClaude, p: Paths) {
  await until(() => stewardOf(fake, p) !== undefined, 8000);
  const st = stewardOf(fake, p)!;
  return { sid: st.sessionId, short: st.id! };
}

/** Posts the steward's end of turn with `text` as its letter. */
async function stewardStop(url: string, p: Paths, sid: string, text: string) {
  expect(await post(url, ev("Stop", { cwd: p.stewardDir, last_assistant_message: text }, sid))).toBe(204);
}

const reviewOf = (t: Town, p: Paths, n: number) => houseAt(t, p.project)?.parcels?.find((x) => x.number === n)?.review;
const gone = (pid: number) => {
  try {
    process.kill(pid, 0);
    return false;
  } catch {
    return true;
  }
};

describe("the steward", () => {
  it("a_ready_pr_starts_one_steward_in_its_folder_pastes_the_prompt_filled_with_number_title_and_url_journals_both_and_detaches", async () => {
    const p = paths();
    const seven = pr(7, { title: "Fix $& paths" });
    const s = await startSteward(p, fakeWith(p, [seven]));
    const st = await stewardStarted(s.fake, p);
    await until(() => pastes(s.fake.attachInput(st.short)).length === 1, 8000);

    expect(pastes(s.fake.attachInput(st.short))).toEqual([
      "Review PR #7: Fix $& paths\nRead https://github.com/example/repo/pull/7, then diff https://github.com/example/repo/pull/7.",
    ]);
    expect(existsSync(p.stewardDir)).toBe(true);
    const [call, ...more] = s.fake.started();
    expect(more).toEqual([]);
    expect(call.cwd).toBe(p.stewardDir);
    expect(call.argv.slice(0, 3)).toEqual(["--bg", "--settings", BG_SETTINGS]);
    await until(() => jsonLines(p.journal).some((e) => e.kind === "review"));
    expect(jsonLines(p.journal).filter((e) => e.kind === "steward" || e.kind === "review")).toEqual([
      { kind: "steward", at: expect.any(Number), shortId: st.short },
      { kind: "review", at: expect.any(Number), cwd: p.project, pr: 7, head: "head-7" },
    ]);
    await until(() => s.fake.attachPids(st.short).every(gone), 5000);
  });

  it("a_ready_pr_gets_one_request_per_head_commit_and_a_draft_none", async () => {
    const p = paths();
    const s = await startSteward(p, fakeWith(p, [pr(7), pr(8, { isDraft: true })]));
    const st = await stewardStarted(s.fake, p);
    await until(() => pastes(s.fake.attachInput(st.short)).length === 1, 8000);
    await stewardStop(s.url, p, st.sid, "Review of 7.");
    await sleep(600); // about six PR polls with the same head commit
    expect(pastes(s.fake.attachInput(st.short))).toEqual([filled(pr(7))]);

    s.fake.prs(p.project, [pr(7, { headRefOid: "head-7b" }), pr(8, { isDraft: true })]);
    await until(() => pastes(s.fake.attachInput(st.short)).length === 2, 8000);
    expect(pastes(s.fake.attachInput(st.short))).toEqual([filled(pr(7)), filled(pr(7))]);
    expect(s.fake.started()).toHaveLength(1);
  });

  it("a_second_ready_pr_waits_for_the_stewards_next_stop_and_both_go_to_the_one_steward", async () => {
    const p = paths();
    const s = await startSteward(p, fakeWith(p, [pr(7), pr(9)]));
    const st = await stewardStarted(s.fake, p);
    await until(() => pastes(s.fake.attachInput(st.short)).length === 1, 8000);
    await sleep(600); // the steward stays idle: only the request in flight holds the next one back
    expect(pastes(s.fake.attachInput(st.short))).toHaveLength(1);

    await stewardStop(s.url, p, st.sid, "Review done.");
    await until(() => pastes(s.fake.attachInput(st.short)).length === 2, 8000);
    expect(pastes(s.fake.attachInput(st.short)).sort()).toEqual([filled(pr(7)), filled(pr(9))].sort());
    expect(s.fake.started()).toHaveLength(1);
  });

  it("a_parcel_stays_queued_while_the_reused_steward_works_then_goes_reviewing_then_ready_and_back_to_reviewing_for_a_new_head", async () => {
    const p = paths();
    const short = "5eed0001";
    const sid = `${short}-0000-4000-8000-000000000000`;
    writeFileSync(p.journal, JSON.stringify({ kind: "steward", at: Date.now() - 60_000, shortId: short }) + "\n");
    const lead = listed("s1", p.project, { name: "alpha" });
    const fake = fakeClaude().list([lead, listedBg(sid, p.stewardDir, { name: "steward", status: "busy" })]).prs(p.project, [pr(7)]);
    const s = await startSteward(p, fake);

    expect(reviewOf(await townWhere(s.url, (t) => reviewOf(t, p, 7) !== undefined), p, 7)).toEqual({ state: "queued", steward: sid });
    await sleep(600); // several polls listing the steward as busy
    expect(fake.attachInput(short)).toBe("");
    expect(reviewOf(await townWhere(s.url, () => true), p, 7)?.state).toBe("queued");

    fake.list([lead, listedBg(sid, p.stewardDir, { name: "steward", status: "idle" })]);
    expect(reviewOf(await townWhere(s.url, (t) => reviewOf(t, p, 7)?.state === "reviewing"), p, 7)).toEqual({ state: "reviewing", steward: sid });
    await until(() => pastes(fake.attachInput(short)).length === 1, 8000);

    await stewardStop(s.url, p, sid, "Squash: Fix it");
    const ready = reviewOf(await townWhere(s.url, (t) => reviewOf(t, p, 7)?.state === "ready"), p, 7);
    const res = await fetch(`${s.url}/letters?lead=${sid}`, { headers: { "x-funtown-token": await tokenOf(s.url) } });
    const [letter] = (await res.json()) as Letter[];
    expect(letter.text).toBe("Squash: Fix it");
    expect(ready).toEqual({ state: "ready", steward: sid, letter: letter.id });

    // The steward's earlier letter is no review of the new head commit.
    fake.prs(p.project, [pr(7, { headRefOid: "head-7b" })]);
    expect(reviewOf(await townWhere(s.url, (t) => reviewOf(t, p, 7)?.state === "reviewing"), p, 7)).toEqual({ state: "reviewing", steward: sid });
    expect(fake.started()).toEqual([]);
  });

  it("a_restart_reuses_the_listed_steward_and_never_resends_a_journaled_request", async () => {
    const p = paths();
    const fake = fakeWith(p, [pr(7)]);
    const first = await startSteward(p, fake);
    const st = await stewardStarted(fake, p);
    await until(() => pastes(fake.attachInput(st.short)).length === 1, 8000);
    await stewardStop(first.url, p, st.sid, "Review of 7.");
    await until(() => jsonLines(p.journal).some((e) => e.kind === "letter"));
    await first.close();

    fake.prs(p.project, [pr(7), pr(9)]);
    const second = await startSteward(p, fake);
    await until(() => pastes(fake.attachInput(st.short)).length === 2, 8000);
    await stewardStop(second.url, p, st.sid, "Review of 9.");
    await sleep(600);
    expect(pastes(fake.attachInput(st.short))).toEqual([filled(pr(7)), filled(pr(9))]);
    expect(fake.started()).toHaveLength(1);
  });

  it("an_empty_prompt_file_turns_reviews_off", async () => {
    const p = paths("");
    const s = await startSteward(p, fakeWith(p, [pr(7)]));
    await townWhere(s.url, (t) => houseAt(t, p.project)?.parcels?.length === 1);
    await sleep(600);
    expect(reviewOf(await townWhere(s.url, () => true), p, 7)).toBeUndefined();
    expect(s.fake.started()).toEqual([]);
  });

  it("a_failed_steward_start_logs_one_line_keeps_the_request_queued_and_a_later_start_sends_it", async () => {
    const p = paths();
    const fake = fakeWith(p, [pr(7)]).failBg();
    const s = await startSteward(p, fake);
    const lines = () => errorLines(p.log).filter((l) => l.source === "server" && l.step === "steward");
    await until(() => lines().length === 1);
    await sleep(600); // several more due reviews with the start still failing
    expect(lines()).toHaveLength(1);
    expect(reviewOf(await townWhere(s.url, () => true), p, 7)?.state).toBe("queued");

    fake.failBg(false);
    const st = await stewardStarted(fake, p);
    await until(() => pastes(fake.attachInput(st.short)).length === 1, 8000);
    expect(pastes(fake.attachInput(st.short))).toEqual([filled(pr(7))]);
  });
});
