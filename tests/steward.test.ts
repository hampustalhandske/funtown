import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { errorLines, ev, fakeClaude, hold, houseAt, jsonLines, listed, listedBg, pastes, post, pr, realDir, sleep, start, tokenOf, townWhere, until } from "./helpers.ts";
import type { FakeClaude, Pr } from "./fake-claude.ts";
import type { JournalEntry, Letter, Town } from "../server/types.ts";

const BG_SETTINGS = '{"worktree":{"bgIsolation":"none"}}';
const TEMPLATE = "Review PR #{number}: {title}\nRead {url}, then diff {url}.";
/** TEMPLATE filled in for `p`, by hand. */
const filled = (p: Pr) => `Review PR #${p.number}: ${p.title}\nRead ${p.url}, then diff ${p.url}.`;

/** Fresh folders for one test: the project, the steward's folder (not made yet), the prompt file, the journal and the error log. */
function paths() {
  const root = realDir();
  const project = join(root, "app");
  mkdirSync(project);
  const promptFile = join(root, "steward.md");
  writeFileSync(promptFile, TEMPLATE);
  return { project, stewardDir: join(root, "funtown", "steward"), promptFile, journal: join(root, "journal.jsonl"), log: join(root, "errors.log") };
}
type Paths = ReturnType<typeof paths>;

/** A fake listing lead s1 in the project, whose gh lists `prs` there. */
const fakeWith = (p: Paths, prs: Pr[]) => fakeClaude().list([listed("s1", p.project, { name: "alpha" })]).prs(p.project, prs);

/** A server with reviews on, polling PRs every 100 ms; `more` adds or overrides options. */
const startSteward = (p: Paths, fake: FakeClaude, more: Parameters<typeof start>[0] = {}) =>
  start({ fake, prMs: 100, stewardDir: p.stewardDir, stewardPrompt: p.promptFile, journal: p.journal, errorLog: p.log, ...more });

const SHORT = "5eed0001";
const SID = `${SHORT}-0000-4000-8000-000000000000`;

/**
 * A steward from an earlier run: the journal names SHORT (a minute ago), then `more` lines; the
 * fake lists lead s1 in the project, whose gh lists `prs`, and `steward(status)`, idle unless given.
 */
function reused(p: Paths, prs: Pr[], more: JournalEntry[] = [], status: "busy" | "idle" = "idle") {
  const lines = [{ kind: "steward", at: Date.now() - 60_000, shortId: SHORT }, ...more];
  writeFileSync(p.journal, lines.map((e) => JSON.stringify(e) + "\n").join(""));
  const lead = listed("s1", p.project, { name: "alpha" });
  const steward = (st: "busy" | "idle") => listedBg(SID, p.stewardDir, { name: "steward", status: st });
  return { lead, steward, fake: fakeClaude().list([lead, steward(status)]).prs(p.project, prs) };
}

const DAY = 24 * 60 * 60 * 1000;
const stewardLines = (p: Paths) => errorLines(p.log).filter((l) => l.source === "server" && l.step === "steward");

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
    const { lead, steward, fake } = reused(p, [pr(7)], [], "busy");
    const s = await startSteward(p, fake);

    expect(reviewOf(await townWhere(s.url, (t) => reviewOf(t, p, 7) !== undefined), p, 7)).toEqual({ state: "queued", steward: SID });
    await sleep(600); // several polls listing the steward as busy
    expect(fake.attachInput(SHORT)).toBe("");
    expect(reviewOf(await townWhere(s.url, () => true), p, 7)?.state).toBe("queued");

    fake.list([lead, steward("idle")]);
    expect(reviewOf(await townWhere(s.url, (t) => reviewOf(t, p, 7)?.state === "reviewing"), p, 7)).toEqual({ state: "reviewing", steward: SID });
    await until(() => pastes(fake.attachInput(SHORT)).length === 1, 8000);

    await stewardStop(s.url, p, SID, "Squash: Fix it");
    const ready = reviewOf(await townWhere(s.url, (t) => reviewOf(t, p, 7)?.state === "ready"), p, 7);
    const res = await fetch(`${s.url}/letters?lead=${SID}`, { headers: { "x-funtown-token": await tokenOf(s.url) } });
    const [letter] = (await res.json()) as Letter[];
    expect(letter.text).toBe("Squash: Fix it");
    expect(ready).toEqual({ state: "ready", steward: SID, letter: letter.id });

    // The steward's earlier letter is no review of the new head commit.
    fake.prs(p.project, [pr(7, { headRefOid: "head-7b" })]);
    expect(reviewOf(await townWhere(s.url, (t) => reviewOf(t, p, 7)?.state === "reviewing"), p, 7)).toEqual({ state: "reviewing", steward: SID });
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

  it("a_review_request_journaled_over_seven_days_ago_is_not_sent_again_after_a_restart", async () => {
    const p = paths();
    const { fake } = reused(p, [pr(7)], [{ kind: "review", at: Date.now() - 8 * DAY, cwd: p.project, pr: 7, head: "head-7" }]);
    const s = await startSteward(p, fake);
    await townWhere(s.url, (t) => reviewOf(t, p, 7) !== undefined);
    await sleep(600); // several polls with the steward listed idle
    expect(fake.attachInput(SHORT)).toBe("");
    expect(reviewOf(await townWhere(s.url, () => true), p, 7)?.state).toBe("reviewing");
  });

  it("a_stop_failure_ends_the_request_in_flight_so_the_next_goes_once_the_steward_is_unstuck", async () => {
    const p = paths();
    const s = await startSteward(p, fakeWith(p, [pr(7)]));
    const st = await stewardStarted(s.fake, p);
    await until(() => pastes(s.fake.attachInput(st.short)).length === 1, 8000);
    expect(await post(s.url, ev("StopFailure", { cwd: p.stewardDir, error: "rate_limit" }, st.sid))).toBe(204);
    // The failure leaves the steward stuck; its session starting again unsticks it, and no Stop follows.
    expect(await post(s.url, ev("SessionStart", { cwd: p.stewardDir, source: "resume" }, st.sid))).toBe(204);
    s.fake.prs(p.project, [pr(9), pr(7)]);
    await until(() => pastes(s.fake.attachInput(st.short)).length === 2, 8000);
    expect(pastes(s.fake.attachInput(st.short))).toEqual([filled(pr(7)), filled(pr(9))]);
  }, 15_000);

  it("a_request_with_no_stop_within_the_answer_limit_logs_one_line_and_the_next_request_goes", async () => {
    const p = paths();
    const s = await startSteward(p, fakeWith(p, [pr(7)]), { stewardAnswerMs: 300 });
    const st = await stewardStarted(s.fake, p);
    await until(() => pastes(s.fake.attachInput(st.short)).length === 1, 8000);
    s.fake.prs(p.project, [pr(9), pr(7)]);
    await until(() => pastes(s.fake.attachInput(st.short)).length === 2, 8000);
    expect(pastes(s.fake.attachInput(st.short))).toEqual([filled(pr(7)), filled(pr(9))]);
    expect(stewardLines(p).filter((l) => l.message.startsWith("no answer to #7 after "))).toHaveLength(1);
  }, 15_000);

  it("an_attach_whose_output_never_pauses_still_ends_by_the_ready_limit", async () => {
    const p = paths();
    const fake = fakeWith(p, [pr(7)]).chattyAttach();
    await startSteward(p, fake, { stewardReadyMs: 1000 });
    const st = await stewardStarted(fake, p);
    await until(() => fake.attachPids(st.short).length > 0, 8000);
    const [first] = fake.attachPids(st.short);
    await until(() => gone(first), 5000);
    // At the limit the request is either written anyway or given up with a log line.
    expect(pastes(fake.attachInput(st.short)).length + stewardLines(p).length).toBeGreaterThan(0);
  }, 20_000);

  it("an_attach_given_up_at_the_ready_limit_writes_nothing_while_it_is_still_exiting", async () => {
    const p = paths();
    // The attach prints once, so its quiet write would come at 500 ms; the limit (300 ms) comes
    // first, and the attach takes a second to exit after it is hung up on.
    const fake = fakeWith(p, [pr(7)]).stickyAttach();
    await startSteward(p, fake, { stewardReadyMs: 300 });
    const st = await stewardStarted(fake, p);
    await until(() => fake.attachPids(st.short).length > 0, 8000);
    const [first] = fake.attachPids(st.short);
    await until(() => gone(first), 5000);
    expect(fake.attachInput(st.short)).toBe("");
    expect(stewardLines(p).filter((l) => l.message.includes("within 300 ms"))).toHaveLength(1);
  }, 20_000);

  it("no_request_is_pasted_while_the_steward_is_stuck_in_a_loop_mid_turn", async () => {
    const p = paths();
    const s = await startSteward(p, fakeWith(p, [pr(7)]), { stewardAnswerMs: 300 });
    const st = await stewardStarted(s.fake, p);
    await until(() => pastes(s.fake.attachInput(st.short)).length === 1, 8000);
    // Five identical tool calls: the steward's turn is still running, stuck in a loop.
    for (let i = 0; i < 5; i++) {
      expect(await post(s.url, ev("PreToolUse", { cwd: p.stewardDir, tool_name: "Bash", tool_input: { command: "gh pr view 7" } }, st.sid))).toBe(204);
    }
    s.fake.prs(p.project, [pr(9), pr(7)]);
    await townWhere(s.url, (t) => reviewOf(t, p, 9)?.state === "queued");
    await until(() => stewardLines(p).some((l) => l.message.startsWith("no answer to #7 after ")), 4000);
    await sleep(1500); // past the answer limit, several polls with #9 due
    expect(pastes(s.fake.attachInput(st.short))).toEqual([filled(pr(7))]);
  }, 20_000);

  it("ready_keeps_naming_the_review_letter_after_twenty_more_steward_letters_and_after_a_restart", async () => {
    const p = paths();
    const fake = fakeWith(p, [pr(7)]);
    const first = await startSteward(p, fake);
    const st = await stewardStarted(fake, p);
    await until(() => pastes(fake.attachInput(st.short)).length === 1, 8000);
    await stewardStop(first.url, p, st.sid, "Squash: Fix it");
    const review = reviewOf(await townWhere(first.url, (t) => reviewOf(t, p, 7)?.state === "ready"), p, 7)!.letter;
    const res = await fetch(`${first.url}/letters?lead=${st.sid}`, { headers: { "x-funtown-token": await tokenOf(first.url) } });
    expect(((await res.json()) as Letter[]).find((l) => l.id === review)?.text).toBe("Squash: Fix it");

    for (let i = 1; i <= 20; i++) await stewardStop(first.url, p, st.sid, `Turn ${i}.`);
    expect(reviewOf(await townWhere(first.url, () => true), p, 7)).toEqual({ state: "ready", steward: st.sid, letter: review });
    await first.close();

    const second = await startSteward(p, fake);
    expect(reviewOf(await townWhere(second.url, (t) => reviewOf(t, p, 7)?.state === "ready"), p, 7)?.letter).toBe(review);
  }, 20_000);

  it("no_request_is_pasted_while_the_steward_has_an_open_card_and_it_goes_once_the_card_closes", async () => {
    const p = paths();
    const { fake } = reused(p, []);
    const s = await startSteward(p, fake);
    await townWhere(s.url, (t) => houseAt(t, p.stewardDir)?.leads.length === 1);
    // Held, not released: the steward is listed, and the test ends well before 10 s without a page.
    const card = hold(s.url, ev("PermissionRequest", { cwd: p.stewardDir, tool_name: "Bash", tool_input: { command: "gh pr view 7" } }, SID));
    await townWhere(s.url, (t) => t.cards.length === 1);
    fake.prs(p.project, [pr(7)]);
    await townWhere(s.url, (t) => reviewOf(t, p, 7) !== undefined);
    await sleep(600); // several polls with the steward listed idle and its card open
    expect(fake.attachInput(SHORT)).toBe("");

    card.abort();
    await until(() => pastes(fake.attachInput(SHORT)).length === 1, 4000);
    expect(pastes(fake.attachInput(SHORT))).toEqual([filled(pr(7))]);
  }, 15_000);

  it("a_started_steward_not_listed_yet_is_not_started_again_before_five_minutes", async () => {
    const p = paths();
    const fake = fakeWith(p, [pr(7)]).unlistedBg();
    await startSteward(p, fake, { unlistedMs: 200 });
    await until(() => fake.started().length === 1, 8000);
    await sleep(1000); // five times unlistedMs, with the review still due
    expect(fake.started()).toHaveLength(1);
  });

  it("a_listed_steward_that_leaves_the_list_is_replaced_at_once_when_a_review_is_due", async () => {
    const p = paths();
    const fake = fakeWith(p, [pr(7)]);
    await startSteward(p, fake);
    const st = await stewardStarted(fake, p);
    await until(() => pastes(fake.attachInput(st.short)).length === 1, 8000);

    fake.list([listed("s1", p.project, { name: "alpha" })]).prs(p.project, [pr(9), pr(7)]);
    await until(() => fake.started().length === 2, 3000); // well before unlistedMs (10 s)
    const next = await stewardStarted(fake, p);
    await until(() => pastes(fake.attachInput(next.short)).length === 1, 4000);
    expect(pastes(fake.attachInput(next.short))).toEqual([filled(pr(9))]);
  }, 15_000);
});
