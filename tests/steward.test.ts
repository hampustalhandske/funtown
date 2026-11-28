import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { errorLines, ev, fakeClaude, hold, houseAt, inTerminal, jsonLines, listed, listedBg, pastes, post, postPage, pr, realDir, sleep, start, tokenOf, townWhere, until, type Json } from "./helpers.ts";
import type { FakeClaude, Pr } from "./fake-claude.ts";
import type { JournalEntry, Letter, Town } from "../server/types.ts";

const BG_SETTINGS = '{"worktree":{"bgIsolation":"none"}}';
const TEMPLATE = "Review PR #{number}: {title}\nRead {url}, then diff {url}.";
/** TEMPLATE filled in for `p`, by hand. */
const filled = (p: Pr) => `Review PR #${p.number}: ${p.title}\nRead ${p.url}, then diff ${p.url}.`;

const CARD_TEMPLATE = "Word for {project}:\n{brief}";

/** Fresh folders for one test: the project, the steward's folder (not made yet), the review and card prompt files, the journal and the error log. */
function paths(projectName = "app") {
  const root = realDir();
  const project = join(root, projectName);
  mkdirSync(project);
  const promptFile = join(root, "steward.md");
  writeFileSync(promptFile, TEMPLATE);
  const cardFile = join(root, "steward-card.md");
  writeFileSync(cardFile, CARD_TEMPLATE);
  return { project, stewardDir: join(root, "funtown", "steward"), promptFile, cardFile, journal: join(root, "journal.jsonl"), log: join(root, "errors.log") };
}
type Paths = ReturnType<typeof paths>;

/** A fake listing lead s1 in the project, whose gh lists `prs` there. */
const fakeWith = (p: Paths, prs: Pr[]) => fakeClaude().list([listed("s1", p.project, { name: "alpha" })]).prs(p.project, prs);

/** A server with reviews and words on, polling PRs every 100 ms; `more` adds or overrides options. */
const startSteward = (p: Paths, fake: FakeClaude, more: Parameters<typeof start>[0] = {}) =>
  start({ fake, prMs: 100, stewardDir: p.stewardDir, stewardPrompt: p.promptFile, stewardCardPrompt: p.cardFile, journal: p.journal, errorLog: p.log, ...more });

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

/** A reply holding the three labelled parts the steward's prompt asks for. */
const REVIEW = "Squash title: fix(parser): handle empty input\nMerge text: Handles empty input in the parser.\nBefore merging: Run the parser tests.";

const parcelOf = (t: Town, p: Paths, n: number) => houseAt(t, p.project)?.parcels?.find((x) => x.number === n);
const reviewOf = (t: Town, p: Paths, n: number) => parcelOf(t, p, n)?.review;

/** Asks for a review of PR `n` as the page would, once the town lists it; resolves with the HTTP status. */
async function askStatus(s: { url: string }, p: Paths, n: number, cwd = p.project, listed = n): Promise<number> {
  await townWhere(s.url, (t) => parcelOf(t, p, listed) !== undefined);
  return (await postPage(s, "/review", { cwd, number: n })).status;
}
/** Asks for a review of PR `n` and expects it to be taken. */
async function ask(s: { url: string }, p: Paths, n: number) {
  expect(await askStatus(s, p, n)).toBe(204);
}
const gone = (pid: number) => {
  try {
    process.kill(pid, 0);
    return false;
  } catch {
    return true;
  }
};

describe("the steward", () => {
  it("a_requested_pr_starts_one_steward_in_its_folder_pastes_the_prompt_filled_with_number_title_and_url_journals_both_and_detaches", async () => {
    const p = paths();
    const seven = pr(7, { title: "Fix $& paths" });
    const s = await startSteward(p, fakeWith(p, [seven]));
    await ask(s, p, 7);
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

  it("the_steward_attaches_with_the_terminal_identity_and_the_away_recap_off_whatever_terminal_the_server_started_in", async () => {
    // Breaks if the steward's attach client inherits the starting terminal's identity, or leaves the recap on.
    await inTerminal(async () => {
      const p = paths();
      const s = await startSteward(p, fakeWith(p, [pr(7)]));
      await ask(s, p, 7);
      const st = await stewardStarted(s.fake, p);
      await until(() => pastes(s.fake.attachInput(st.short)).length === 1, 8000);
      expect(s.fake.attachEnvs(st.short)).toEqual([
        { claude: ["CLAUDE_CODE_ENABLE_AWAY_SUMMARY"], term: "xterm-256color", colorterm: "truecolor", termProgram: null, termVars: [] },
      ]);
    });
  });

  it("a_ready_pr_nobody_asked_about_stays_idle_and_no_steward_is_started_or_pasted_to", async () => {
    const none = paths();
    const first = await startSteward(none, fakeWith(none, [pr(7)]));
    const listedOne = paths();
    const { fake } = reused(listedOne, [pr(7)]);
    const second = await startSteward(listedOne, fake);
    await townWhere(first.url, (t) => reviewOf(t, none, 7) !== undefined);
    await townWhere(second.url, (t) => reviewOf(t, listedOne, 7) !== undefined);
    await sleep(600); // several polls with the PR ready and unasked
    expect(reviewOf(await townWhere(first.url, () => true), none, 7)?.state).toBe("idle");
    expect(first.fake.started()).toEqual([]); // no steward listed: none is started
    expect(reviewOf(await townWhere(second.url, () => true), listedOne, 7)?.state).toBe("idle");
    expect(fake.attachInput(SHORT)).toBe(""); // a listed idle steward gets nothing
  });

  it("asking_twice_for_one_head_pastes_once", async () => {
    const p = paths();
    const s = await startSteward(p, fakeWith(p, [pr(7)]));
    await ask(s, p, 7);
    await ask(s, p, 7); // already asked: still 204
    const st = await stewardStarted(s.fake, p);
    await until(() => pastes(s.fake.attachInput(st.short)).length === 1, 8000);
    await ask(s, p, 7); // sent, not yet answered: still 204
    await stewardStop(s.url, p, st.sid, REVIEW);
    await ask(s, p, 7); // reviewed: still 204
    await sleep(600); // about six PR polls with the same head commit
    expect(pastes(s.fake.attachInput(st.short))).toEqual([filled(pr(7))]);
  });

  it("a_new_head_commit_is_idle_until_asked_again_and_is_then_pasted_to_the_same_steward", async () => {
    const p = paths();
    const s = await startSteward(p, fakeWith(p, [pr(7)]));
    await ask(s, p, 7);
    const st = await stewardStarted(s.fake, p);
    await until(() => pastes(s.fake.attachInput(st.short)).length === 1, 8000);
    await stewardStop(s.url, p, st.sid, REVIEW);

    s.fake.prs(p.project, [pr(7, { headRefOid: "head-7b" })]);
    expect(reviewOf(await townWhere(s.url, (t) => parcelOf(t, p, 7) !== undefined && reviewOf(t, p, 7)?.state !== "ready"), p, 7)?.state).toBe("idle");
    await sleep(600);
    expect(pastes(s.fake.attachInput(st.short))).toHaveLength(1);

    await ask(s, p, 7);
    await until(() => pastes(s.fake.attachInput(st.short)).length === 2, 8000);
    expect(pastes(s.fake.attachInput(st.short))).toEqual([filled(pr(7)), filled(pr(7))]);
    expect(s.fake.started()).toHaveLength(1);
  });

  it("a_request_for_an_unknown_house_or_pr_is_404_and_for_a_draft_409_and_nothing_is_sent", async () => {
    const p = paths();
    const { fake } = reused(p, [pr(7), pr(8, { isDraft: true })]);
    const s = await startSteward(p, fake);
    await townWhere(s.url, (t) => parcelOf(t, p, 8) !== undefined);
    expect(await askStatus(s, p, 7, join(p.project, "elsewhere"))).toBe(404);
    expect(await askStatus(s, p, 99, p.project, 7)).toBe(404);
    expect(await askStatus(s, p, 8)).toBe(409);
    await sleep(600);
    expect(fake.attachInput(SHORT)).toBe("");
    const t = await townWhere(s.url, () => true);
    expect(reviewOf(t, p, 7)?.state).toBe("idle");
    expect(reviewOf(t, p, 8)).toBeUndefined();
  });

  it("a_request_with_reviews_off_is_409_and_starts_nothing", async () => {
    const p = paths();
    writeFileSync(p.promptFile, "");
    const s = await startSteward(p, fakeWith(p, [pr(7)]));
    expect(await askStatus(s, p, 7)).toBe(409);
    await sleep(300);
    expect(s.fake.started()).toEqual([]);
  });

  it("a_request_without_the_page_token_or_origin_is_refused_and_asks_nothing", async () => {
    const p = paths();
    const { fake } = reused(p, [pr(7)]);
    const s = await startSteward(p, fake);
    await townWhere(s.url, (t) => parcelOf(t, p, 7) !== undefined);
    const body = { cwd: p.project, number: 7 };
    const token = await tokenOf(s.url);
    expect((await postPage(s, "/review", body, { origin: s.url })).status).toBe(403);
    expect((await postPage(s, "/review", body, { "x-funtown-token": token })).status).toBe(403);
    expect((await postPage(s, "/review", body, { origin: "http://evil.example", "x-funtown-token": token })).status).toBe(403);
    await sleep(600);
    expect(fake.attachInput(SHORT)).toBe("");
    expect(reviewOf(await townWhere(s.url, () => true), p, 7)?.state).toBe("idle");
  });

  it("requests_go_one_at_a_time_in_the_order_they_were_asked_not_the_order_the_prs_are_listed", async () => {
    const p = paths();
    const { lead, steward, fake } = reused(p, [pr(7), pr(9), pr(11)], [], "busy");
    const s = await startSteward(p, fake);
    await ask(s, p, 11);
    await ask(s, p, 7);
    await ask(s, p, 9);
    await sleep(300);
    expect(fake.attachInput(SHORT)).toBe(""); // the steward is busy: all three wait

    fake.list([lead, steward("idle")]);
    await until(() => pastes(fake.attachInput(SHORT)).length === 1, 8000);
    await sleep(600); // the steward stays idle: only the request in flight holds the next one back
    expect(pastes(fake.attachInput(SHORT))).toEqual([filled(pr(11))]);
    await stewardStop(s.url, p, SID, REVIEW);
    await until(() => pastes(fake.attachInput(SHORT)).length === 2, 8000);
    await sleep(600);
    expect(pastes(fake.attachInput(SHORT))).toEqual([filled(pr(11)), filled(pr(7))]);
    await stewardStop(s.url, p, SID, REVIEW);
    await until(() => pastes(fake.attachInput(SHORT)).length === 3, 8000);
    expect(pastes(fake.attachInput(SHORT))).toEqual([filled(pr(11)), filled(pr(7)), filled(pr(9))]);
    expect(fake.started()).toEqual([]);
  }, 20_000);

  it("a_parcel_is_idle_until_asked_then_queued_while_the_reused_steward_works_then_reviewing_then_ready_and_idle_again_for_a_new_head", async () => {
    const p = paths();
    const { lead, steward, fake } = reused(p, [pr(7)], [], "busy");
    const s = await startSteward(p, fake);

    expect(reviewOf(await townWhere(s.url, (t) => reviewOf(t, p, 7) !== undefined), p, 7)?.state).toBe("idle");
    await ask(s, p, 7);
    expect(reviewOf(await townWhere(s.url, (t) => reviewOf(t, p, 7)?.state === "queued"), p, 7)).toEqual({ state: "queued", steward: SID });
    await sleep(600); // several polls listing the steward as busy
    expect(fake.attachInput(SHORT)).toBe("");
    expect(reviewOf(await townWhere(s.url, () => true), p, 7)?.state).toBe("queued");

    fake.list([lead, steward("idle")]);
    expect(reviewOf(await townWhere(s.url, (t) => reviewOf(t, p, 7)?.state === "reviewing"), p, 7)).toEqual({ state: "reviewing", steward: SID });
    await until(() => pastes(fake.attachInput(SHORT)).length === 1, 8000);

    await stewardStop(s.url, p, SID, REVIEW);
    const ready = reviewOf(await townWhere(s.url, (t) => reviewOf(t, p, 7)?.state === "ready"), p, 7);
    const res = await fetch(`${s.url}/letters?lead=${SID}`, { headers: { "x-funtown-token": await tokenOf(s.url) } });
    const [letter] = (await res.json()) as Letter[];
    expect(letter.text).toBe(REVIEW);
    expect(ready).toEqual({ state: "ready", steward: SID, letter: letter.id });

    // The steward's earlier letter is no review of the new head commit, and the new head was not asked for.
    fake.prs(p.project, [pr(7, { headRefOid: "head-7b" })]);
    expect(reviewOf(await townWhere(s.url, (t) => reviewOf(t, p, 7)?.state === "idle"), p, 7)?.state).toBe("idle");
    expect(fake.started()).toEqual([]);
  });

  it("a_reply_without_all_three_labelled_parts_is_not_a_review_and_is_not_sent_again_until_asked_again", async () => {
    const p = paths();
    const { fake } = reused(p, [pr(7)]);
    const s = await startSteward(p, fake);
    await ask(s, p, 7);
    await until(() => pastes(fake.attachInput(SHORT)).length === 1, 8000);

    await stewardStop(s.url, p, SID, "I can't review this PR: the diff is too large for me.");
    await sleep(600); // several polls after a refusal
    expect(reviewOf(await townWhere(s.url, () => true), p, 7)?.state).not.toBe("ready");
    expect(pastes(fake.attachInput(SHORT))).toHaveLength(1);

    // Two parts of three is still no review.
    await ask(s, p, 7);
    await until(() => pastes(fake.attachInput(SHORT)).length === 2, 8000);
    await stewardStop(s.url, p, SID, "Squash title: fix(parser): handle empty input\nMerge text: Handles empty input.");
    await sleep(600);
    expect(reviewOf(await townWhere(s.url, () => true), p, 7)?.state).not.toBe("ready");
    expect(pastes(fake.attachInput(SHORT))).toHaveLength(2);

    await ask(s, p, 7);
    await until(() => pastes(fake.attachInput(SHORT)).length === 3, 8000);
    await stewardStop(s.url, p, SID, REVIEW);
    expect(reviewOf(await townWhere(s.url, (t) => reviewOf(t, p, 7)?.state === "ready"), p, 7)?.state).toBe("ready");
  }, 20_000);

  it("a_reply_that_is_not_a_review_writes_one_steward_log_line_naming_the_pr_and_the_missing_labels", async () => {
    const p = paths();
    const { fake } = reused(p, [pr(7)]);
    const s = await startSteward(p, fake);
    await ask(s, p, 7);
    await until(() => pastes(fake.attachInput(SHORT)).length === 1, 8000);
    await stewardStop(s.url, p, SID, "I can't review this PR: the diff is too large for me.");
    await until(() => stewardLines(p).length > 0);
    expect(stewardLines(p).map((l) => l.message)).toEqual(["reply to #7 lacks Squash title, Merge text, Before merging"]);

    await ask(s, p, 7);
    await until(() => pastes(fake.attachInput(SHORT)).length === 2, 8000);
    await stewardStop(s.url, p, SID, "Squash title: fix(parser): handle empty input\nMerge text: Handles empty input.");
    await until(() => stewardLines(p).length === 2);
    expect(stewardLines(p)[1].message).toBe("reply to #7 lacks Before merging");
  });

  it("a_reply_that_names_a_part_in_passing_without_its_colon_is_not_a_review", async () => {
    // Breaks if the review check finds a label anywhere in the text instead of as a label, as her word's check does.
    const p = paths();
    const { fake } = reused(p, [pr(7)]);
    const s = await startSteward(p, fake);
    await ask(s, p, 7);
    await until(() => pastes(fake.attachInput(SHORT)).length === 1, 8000);
    await stewardStop(s.url, p, SID, "Squash title: fix(parser): handle empty input\nMerge text: Handles empty input.\nBefore merging anything, run the tests.");
    await until(() => stewardLines(p).length > 0);
    expect(stewardLines(p).map((l) => l.message)).toEqual(["reply to #7 lacks Before merging"]);
    expect(reviewOf(await townWhere(s.url, () => true), p, 7)?.state).not.toBe("ready");
  });

  it("the_users_own_message_to_the_steward_with_no_request_in_flight_stops_requests_even_if_its_text_matches_the_last_request_and_a_new_request_resumes_them", async () => {
    const p = paths();
    const { fake } = reused(p, [pr(7), pr(9), pr(11)]);
    const s = await startSteward(p, fake);
    await ask(s, p, 7);
    await until(() => pastes(fake.attachInput(SHORT)).length === 1, 8000);
    await ask(s, p, 9); // waits: the attach that wrote #7 is still open
    await stewardStop(s.url, p, SID, REVIEW); // the request is over
    // The user writes to the steward; no request of ours is in flight, whatever the text.
    expect(await post(s.url, ev("UserPromptSubmit", { cwd: p.stewardDir, prompt: filled(pr(7)) }, SID))).toBe(204);
    await stewardStop(s.url, p, SID, "Sorry, I was reviewing PR 7.");
    await until(() => fake.attachPids(SHORT).every(gone), 5000);
    await sleep(1500); // longer than the quiet wait before a paste, so #9 would be pasted by now
    expect(pastes(fake.attachInput(SHORT))).toEqual([filled(pr(7))]);

    await ask(s, p, 11);
    await until(() => pastes(fake.attachInput(SHORT)).length === 2, 8000);
    await stewardStop(s.url, p, SID, REVIEW);
    await until(() => pastes(fake.attachInput(SHORT)).length === 3, 8000);
    expect(pastes(fake.attachInput(SHORT))).toEqual([filled(pr(7)), filled(pr(9)), filled(pr(11))]);
  }, 20_000);

  it("the_stewards_prompt_event_while_a_request_is_in_flight_does_not_pause_requests", async () => {
    const p = paths();
    const { fake } = reused(p, [pr(7), pr(9)]);
    const s = await startSteward(p, fake);
    await ask(s, p, 7);
    await until(() => pastes(fake.attachInput(SHORT)).length === 1, 8000);
    await ask(s, p, 9);
    // The steward's own hook reports the pasted request as a prompt submit.
    expect(await post(s.url, ev("UserPromptSubmit", { cwd: p.stewardDir, prompt: filled(pr(7)) }, SID))).toBe(204);
    await stewardStop(s.url, p, SID, REVIEW);
    await until(() => pastes(fake.attachInput(SHORT)).length === 2, 8000);
    expect(pastes(fake.attachInput(SHORT))).toEqual([filled(pr(7)), filled(pr(9))]);
  }, 20_000);

  it("the_pasted_request_names_project_repo_and_number_by_the_prompt_files_placeholders", async () => {
    const p = paths();
    writeFileSync(p.promptFile, "P={project};R={repo};N={number};T={title}");
    const s = await startSteward(p, fakeWith(p, [pr(7, { title: "A {repo} title" })]));
    await ask(s, p, 7);
    const st = await stewardStarted(s.fake, p);
    await until(() => pastes(s.fake.attachInput(st.short)).length === 1, 8000);
    // The repo is the PR's own (owner/name or just name); a title is never filled in again.
    expect(pastes(s.fake.attachInput(st.short))[0]).toMatch(/^P=app;R=(example\/)?repo;N=7;T=A \{repo\} title$/);
  });

  it("the_repo_placeholder_is_the_pr_url_when_the_url_does_not_parse", async () => {
    const p = paths();
    writeFileSync(p.promptFile, "R={repo}");
    const s = await startSteward(p, fakeWith(p, [pr(7, { url: "pull-request-7" })]));
    await ask(s, p, 7);
    const st = await stewardStarted(s.fake, p);
    await until(() => pastes(s.fake.attachInput(st.short)).length === 1, 8000);
    expect(pastes(s.fake.attachInput(st.short))).toEqual(["R=pull-request-7"]);
  });

  it("the_default_prompt_names_the_project_and_number_and_asks_for_the_three_labelled_parts", async () => {
    const p = paths("zebra-shop");
    const s = await startSteward(p, fakeWith(p, [pr(7)]), { stewardPrompt: undefined });
    await ask(s, p, 7);
    const st = await stewardStarted(s.fake, p);
    await until(() => pastes(s.fake.attachInput(st.short)).length === 1, 8000);
    const [text] = pastes(s.fake.attachInput(st.short));
    expect(text).toContain('Pre-review pull request #7, "PR 7": https://github.com/example/repo/pull/7\nProject: zebra-shop. Repo: example/repo.\n');
    expect(text).toContain("`zebra-shop · example/repo · #7`");
    expect(text).not.toMatch(/\{(number|title|url|project|repo)\}/);
    for (const label of ["Squash title", "Merge text", "Before merging"]) expect(text).toContain(label);
  });

  it("a_restart_reuses_the_listed_steward_and_never_resends_a_journaled_request", async () => {
    const p = paths();
    const fake = fakeWith(p, [pr(7)]);
    const first = await startSteward(p, fake);
    await ask(first, p, 7);
    const st = await stewardStarted(fake, p);
    await until(() => pastes(fake.attachInput(st.short)).length === 1, 8000);
    await stewardStop(first.url, p, st.sid, REVIEW);
    await until(() => jsonLines(p.journal).some((e) => e.kind === "letter"));
    await first.close();

    fake.prs(p.project, [pr(7), pr(9)]);
    const second = await startSteward(p, fake);
    await ask(second, p, 9);
    await until(() => pastes(fake.attachInput(st.short)).length === 2, 8000);
    await stewardStop(second.url, p, st.sid, REVIEW);
    await sleep(600);
    expect(pastes(fake.attachInput(st.short))).toEqual([filled(pr(7)), filled(pr(9))]);
    expect(fake.started()).toHaveLength(1);
  });

  it("a_failed_steward_start_logs_one_line_keeps_the_request_queued_and_a_later_start_sends_it", async () => {
    const p = paths();
    const fake = fakeWith(p, [pr(7)]).failBg();
    const s = await startSteward(p, fake);
    await ask(s, p, 7);
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

  it("a_review_journaled_over_seven_days_ago_still_reads_ready_after_a_restart_and_is_not_sent_again_while_an_old_unanswered_request_is_idle_until_asked", async () => {
    const p = paths();
    const old = Date.now() - 8 * DAY;
    const recent = Date.now() - DAY;
    const { fake } = reused(p, [pr(7), pr(9), pr(11)], [
      { kind: "review", at: old, cwd: p.project, pr: 7, head: "head-7" },
      { kind: "reviewed", at: old, pr: 7, head: "head-7", letter: "L7" },
      { kind: "review", at: recent, cwd: p.project, pr: 9, head: "head-9" },
      { kind: "reviewed", at: recent, pr: 9, head: "head-9", letter: "L9" },
      { kind: "review", at: old, cwd: p.project, pr: 11, head: "head-11" },
    ]);
    const s = await startSteward(p, fake);
    const t = await townWhere(s.url, (x) => parcelOf(x, p, 11) !== undefined);
    expect(reviewOf(t, p, 7)).toEqual({ state: "ready", steward: SID, letter: "L7" });
    expect(reviewOf(t, p, 9)).toEqual({ state: "ready", steward: SID, letter: "L9" });
    expect(reviewOf(t, p, 11)).toEqual({ state: "idle", steward: SID });

    await ask(s, p, 7); // reviewed already: nothing is queued
    await ask(s, p, 9);
    await sleep(600); // several polls with the steward listed idle
    expect(fake.attachInput(SHORT)).toBe("");

    await ask(s, p, 11); // a request with no review is sent again when asked
    await until(() => pastes(fake.attachInput(SHORT)).length === 1, 8000);
    expect(pastes(fake.attachInput(SHORT))).toEqual([filled(pr(11))]);
  });

  it("a_stop_failure_ends_the_request_in_flight_so_the_next_goes_once_the_steward_is_unstuck", async () => {
    const p = paths();
    const s = await startSteward(p, fakeWith(p, [pr(7), pr(9)]));
    await ask(s, p, 7);
    const st = await stewardStarted(s.fake, p);
    await until(() => pastes(s.fake.attachInput(st.short)).length === 1, 8000);
    await ask(s, p, 9);
    expect(await post(s.url, ev("StopFailure", { cwd: p.stewardDir, error: "rate_limit" }, st.sid))).toBe(204);
    // The failure leaves the steward stuck; its session starting again unsticks it, and no Stop follows.
    expect(await post(s.url, ev("SessionStart", { cwd: p.stewardDir, source: "resume" }, st.sid))).toBe(204);
    await until(() => pastes(s.fake.attachInput(st.short)).length === 2, 8000);
    expect(pastes(s.fake.attachInput(st.short))).toEqual([filled(pr(7)), filled(pr(9))]);
  }, 15_000);

  it("a_request_with_no_stop_within_the_answer_limit_logs_one_line_and_the_next_request_goes", async () => {
    const p = paths();
    const s = await startSteward(p, fakeWith(p, [pr(7), pr(9)]), { stewardAnswerMs: 300 });
    await ask(s, p, 7);
    const st = await stewardStarted(s.fake, p);
    await until(() => pastes(s.fake.attachInput(st.short)).length === 1, 8000);
    await ask(s, p, 9);
    await until(() => pastes(s.fake.attachInput(st.short)).length === 2, 8000);
    expect(pastes(s.fake.attachInput(st.short))).toEqual([filled(pr(7)), filled(pr(9))]);
    expect(stewardLines(p).filter((l) => l.message.startsWith("no answer to #7 after "))).toHaveLength(1);
  }, 15_000);

  it("an_attach_whose_output_never_pauses_still_ends_by_the_ready_limit", async () => {
    const p = paths();
    const fake = fakeWith(p, [pr(7)]).chattyAttach();
    const s = await startSteward(p, fake, { stewardReadyMs: 1000 });
    await ask(s, p, 7);
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
    const s = await startSteward(p, fake, { stewardReadyMs: 300 });
    await ask(s, p, 7);
    const st = await stewardStarted(fake, p);
    await until(() => fake.attachPids(st.short).length > 0, 8000);
    const [first] = fake.attachPids(st.short);
    await until(() => gone(first), 5000);
    expect(fake.attachInput(st.short)).toBe("");
    expect(stewardLines(p).filter((l) => l.message.includes("within 300 ms"))).toHaveLength(1);
  }, 20_000);

  it("no_request_is_pasted_while_the_steward_is_stuck_in_a_loop_mid_turn", async () => {
    const p = paths();
    const s = await startSteward(p, fakeWith(p, [pr(7), pr(9)]), { stewardAnswerMs: 300 });
    await ask(s, p, 7);
    const st = await stewardStarted(s.fake, p);
    await until(() => pastes(s.fake.attachInput(st.short)).length === 1, 8000);
    // Five identical tool calls: the steward's turn is still running, stuck in a loop.
    for (let i = 0; i < 5; i++) {
      expect(await post(s.url, ev("PreToolUse", { cwd: p.stewardDir, tool_name: "Bash", tool_input: { command: "gh pr view 7" } }, st.sid))).toBe(204);
    }
    await ask(s, p, 9);
    await townWhere(s.url, (t) => reviewOf(t, p, 9)?.state === "queued");
    await until(() => stewardLines(p).some((l) => l.message.startsWith("no answer to #7 after ")), 4000);
    await sleep(1500); // past the answer limit, several polls with #9 due
    expect(pastes(s.fake.attachInput(st.short))).toEqual([filled(pr(7))]);
  }, 20_000);

  it("a_steward_whose_looping_turn_ended_gets_the_next_request", async () => {
    const p = paths();
    const s = await startSteward(p, fakeWith(p, [pr(7), pr(9)]));
    await ask(s, p, 7);
    const st = await stewardStarted(s.fake, p);
    await until(() => pastes(s.fake.attachInput(st.short)).length === 1, 8000);
    for (let i = 0; i < 5; i++) {
      expect(await post(s.url, ev("PreToolUse", { cwd: p.stewardDir, tool_name: "Bash", tool_input: { command: "gh pr view 7" } }, st.sid))).toBe(204);
    }
    // The turn ends: the steward stays marked stuck, but it is no longer running.
    await stewardStop(s.url, p, st.sid, REVIEW);
    await ask(s, p, 9);
    await until(() => pastes(s.fake.attachInput(st.short)).length === 2, 8000);
    expect(pastes(s.fake.attachInput(st.short))).toEqual([filled(pr(7)), filled(pr(9))]);
  }, 20_000);

  it("ready_keeps_naming_the_review_letter_after_twenty_more_steward_letters_and_after_a_restart", async () => {
    const p = paths();
    const fake = fakeWith(p, [pr(7)]);
    const first = await startSteward(p, fake);
    await ask(first, p, 7);
    const st = await stewardStarted(fake, p);
    await until(() => pastes(fake.attachInput(st.short)).length === 1, 8000);
    await stewardStop(first.url, p, st.sid, REVIEW);
    const review = reviewOf(await townWhere(first.url, (t) => reviewOf(t, p, 7)?.state === "ready"), p, 7)!.letter;
    const res = await fetch(`${first.url}/letters?lead=${st.sid}`, { headers: { "x-funtown-token": await tokenOf(first.url) } });
    expect(((await res.json()) as Letter[]).find((l) => l.id === review)?.text).toBe(REVIEW);

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
    await ask(s, p, 7);
    await sleep(600); // several polls with the steward listed idle and its card open
    expect(fake.attachInput(SHORT)).toBe("");

    card.abort();
    await until(() => pastes(fake.attachInput(SHORT)).length === 1, 4000);
    expect(pastes(fake.attachInput(SHORT))).toEqual([filled(pr(7))]);
  }, 15_000);

  it("a_started_steward_not_listed_yet_is_not_started_again_before_five_minutes", async () => {
    const p = paths();
    const fake = fakeWith(p, [pr(7)]).unlistedBg();
    const s = await startSteward(p, fake, { unlistedMs: 200 });
    await ask(s, p, 7);
    await until(() => fake.started().length === 1, 8000);
    await sleep(1000); // five times unlistedMs, with the review still due
    expect(fake.started()).toHaveLength(1);
  });

  it("a_listed_steward_that_leaves_the_list_is_replaced_at_once_when_a_review_is_due", async () => {
    const p = paths();
    const fake = fakeWith(p, [pr(7), pr(9)]);
    const s = await startSteward(p, fake);
    await ask(s, p, 7);
    const st = await stewardStarted(fake, p);
    await until(() => pastes(fake.attachInput(st.short)).length === 1, 8000);

    fake.list([listed("s1", p.project, { name: "alpha" })]);
    await ask(s, p, 9);
    await until(() => fake.started().length === 2, 3000); // well before unlistedMs (10 s)
    const next = await stewardStarted(fake, p);
    await until(() => pastes(fake.attachInput(next.short)).length === 1, 4000);
    expect(pastes(fake.attachInput(next.short))).toEqual([filled(pr(9))]);
  }, 15_000);
});

describe("the steward in the state", () => {
  it("only_the_listed_steward_session_carries_steward_true_wherever_its_folder_is", async () => {
    const p = paths();
    const { fake } = reused(p, []);
    const s = await startSteward(p, fake);
    const t = await townWhere(s.url, (x) => houseAt(x, p.stewardDir)?.leads.length === 1 && houseAt(x, p.project)?.leads.length === 1);
    expect(houseAt(t, p.stewardDir)?.leads[0]).toMatchObject({ id: SID, steward: true });
    expect(houseAt(t, p.project)?.leads[0].id).toBe("s1");
    expect(houseAt(t, p.project)?.leads[0]).not.toHaveProperty("steward");
  });

  it("the_stewards_house_is_never_polled_so_it_has_no_parcelsAt_while_a_project_house_has_one", async () => {
    // Catches the page putting the steward's house, which has no PR list to read, in fog.
    const p = paths();
    const { fake } = reused(p, []);
    const s = await startSteward(p, fake);
    const t = await townWhere(s.url, (x) => houseAt(x, p.stewardDir)?.leads.length === 1 && houseAt(x, p.project)?.parcelsAt !== undefined);
    expect(houseAt(t, p.stewardDir)).not.toHaveProperty("parcelsAt");
    expect(houseAt(t, p.stewardDir)).not.toHaveProperty("parcels");
  });

  it("with_a_projects_file_the_steward_still_shows_though_its_folder_is_not_an_added_project", async () => {
    const p = paths();
    const { lead, steward } = reused(p, []);
    const elsewhere = realDir();
    const fake = fakeClaude().list([lead, steward("idle"), listed("s9", elsewhere)]).prs(p.project, []);
    const projects = join(realDir(), "projects.json");
    writeFileSync(projects, JSON.stringify([p.project]));
    const s = await startSteward(p, fake, { projects });
    const t = await townWhere(s.url, (x) => houseAt(x, p.stewardDir)?.leads.length === 1 && houseAt(x, p.project)?.leads.length === 1);
    expect(houseAt(t, p.stewardDir)?.leads[0]).toMatchObject({ id: SID, steward: true });
    expect(houseAt(t, elsewhere)).toBeUndefined();
  });

  it("the_stewards_lead_can_be_stopped_like_any_listed_background_session", async () => {
    const p = paths();
    const { fake } = reused(p, []);
    const s = await startSteward(p, fake);
    await townWhere(s.url, (x) => houseAt(x, p.stewardDir)?.leads[0]?.steward === true);
    expect((await postPage(s, "/sessions/stop", { lead: SID })).status).toBe(204);
    expect(fake.stopCalls()).toEqual([["stop", SHORT]]);
  });
});

const wordOf = (t: Town, card: string) => t.cards.find((c) => c.id === card)?.word;

/** A Bash permission request from `session` in `cwd`: lead s1 in the project unless given. */
const bash = (p: Paths, command = "npm test", session = "s1", cwd = p.project) =>
  ev("PermissionRequest", { cwd, tool_name: "Bash", tool_input: { command } }, session);

/** Holds `request` (a Bash permission from s1 unless given); gives its card id once it shows, and `abort`, which closes it. */
async function cardFrom(s: { url: string }, p: Paths, request: Json = bash(p)) {
  const before = (await townWhere(s.url, () => true)).cards.map((c) => c.id);
  const held = hold(s.url, request);
  const t = await townWhere(s.url, (x) => x.cards.some((c) => !before.includes(c.id)));
  return { id: t.cards.find((c) => !before.includes(c.id))!.id, abort: held.abort };
}

/** Asks for the steward's word on `card` as the page would; resolves with the HTTP status. */
const askWord = async (s: { url: string }, card: string) => (await postPage(s, "/word", { card })).status;

/** A reply holding the three labelled parts the card prompt asks for. */
const WORD = "app · card\nPick: Allow\nWhy: The tests only read.\nCheck first: nothing";

/** The steward's letters as GET /letters gives them for `query` (`id=` for one by id): the status and, on 200, the list. */
async function stewardLetters(s: { url: string }, query = "") {
  const res = await fetch(`${s.url}/letters?lead=${SID}${query}`, { headers: { "x-funtown-token": await tokenOf(s.url) } });
  return { status: res.status, letters: res.status === 200 ? ((await res.json()) as Letter[]) : [] };
}

describe("the steward's word on a card", () => {
  it("a_card_carries_an_idle_word_with_words_on_and_none_with_the_card_prompt_empty_or_on_the_stewards_own_card", async () => {
    const on = paths();
    const { fake } = reused(on, []);
    const s = await startSteward(on, fake);
    await townWhere(s.url, (t) => houseAt(t, on.stewardDir)?.leads.length === 1 && houseAt(t, on.project)?.leads.length === 1);
    const mine = await cardFrom(s, on);
    const hers = await cardFrom(s, on, bash(on, "gh pr view 7", SID, on.stewardDir));
    const t = await townWhere(s.url, (x) => x.cards.length === 2);
    expect(wordOf(t, mine.id)).toEqual({ state: "idle" });
    expect(t.cards.find((c) => c.id === hers.id)).not.toHaveProperty("word");
    expect(await askWord(s, hers.id)).toBe(409);

    const off = paths();
    writeFileSync(off.cardFile, "");
    const second = await startSteward(off, fakeWith(off, []));
    const card = await cardFrom(second, off);
    expect((await townWhere(second.url, (x) => x.cards.length === 1)).cards[0]).not.toHaveProperty("word");
    expect(await askWord(second, card.id)).toBe(409);
    await sleep(300);
    expect(second.fake.started()).toEqual([]);
    expect(fake.attachInput(SHORT)).toBe("");
  });

  it("with_only_the_card_prompt_on_one_press_starts_the_steward_and_pastes_the_prompt_filled_once_while_reviews_stay_off", async () => {
    const p = paths();
    writeFileSync(p.promptFile, "");
    const s = await startSteward(p, fakeWith(p, [pr(7)]));
    expect(await askStatus(s, p, 7)).toBe(409);
    expect(reviewOf(await townWhere(s.url, () => true), p, 7)).toBeUndefined();
    const card = await cardFrom(s, p);
    expect(await askWord(s, card.id)).toBe(204);
    const st = await stewardStarted(s.fake, p);
    await until(() => pastes(s.fake.attachInput(st.short)).length === 1, 8000);
    expect(await askWord(s, card.id)).toBe(204); // writing: nothing more is sent
    await sleep(600);
    const [text] = pastes(s.fake.attachInput(st.short));
    expect(text).toMatch(/^Word for app:\n/);
    expect(text).toContain("npm test");
    expect(pastes(s.fake.attachInput(st.short))).toHaveLength(1);
    expect(s.fake.started()).toHaveLength(1);
  });

  it("a_word_is_queued_while_the_steward_works_writing_once_pasted_and_ready_with_her_letter_and_no_press_in_between_sends_more", async () => {
    const p = paths();
    const { lead, steward, fake } = reused(p, [], [], "busy");
    const s = await startSteward(p, fake);
    const card = await cardFrom(s, p);
    expect(await askWord(s, card.id)).toBe(204);
    expect(wordOf(await townWhere(s.url, (t) => wordOf(t, card.id)?.state === "queued"), card.id)).toEqual({ state: "queued" });
    expect(await askWord(s, card.id)).toBe(204);
    await sleep(600); // several polls with the steward busy
    expect(fake.attachInput(SHORT)).toBe("");

    fake.list([lead, steward("idle")]);
    expect(wordOf(await townWhere(s.url, (t) => wordOf(t, card.id)?.state === "writing"), card.id)).toEqual({ state: "writing" });
    await until(() => pastes(fake.attachInput(SHORT)).length === 1, 8000);
    expect(await askWord(s, card.id)).toBe(204);
    expect(wordOf(await townWhere(s.url, () => true), card.id)).toEqual({ state: "writing" });
    await stewardStop(s.url, p, SID, WORD);
    const ready = wordOf(await townWhere(s.url, (t) => wordOf(t, card.id)?.state === "ready"), card.id);
    const [letter] = (await stewardLetters(s)).letters;
    expect(letter.text).toBe(WORD);
    expect(ready).toEqual({ state: "ready", letter: letter.id });
    expect(await askWord(s, card.id)).toBe(204);
    await sleep(600);
    expect(pastes(fake.attachInput(SHORT))).toHaveLength(1);
    expect(fake.started()).toEqual([]);
  });

  it("a_word_asked_after_a_review_is_pasted_before_it", async () => {
    const p = paths();
    const { lead, steward, fake } = reused(p, [pr(7)], [], "busy");
    const s = await startSteward(p, fake);
    await ask(s, p, 7);
    const card = await cardFrom(s, p);
    expect(await askWord(s, card.id)).toBe(204);
    fake.list([lead, steward("idle")]);
    await until(() => pastes(fake.attachInput(SHORT)).length === 1, 8000);
    await sleep(600); // only the word in flight holds the review back
    expect(pastes(fake.attachInput(SHORT))[0]).toMatch(/^Word for app:\n/);
    expect(pastes(fake.attachInput(SHORT))).toHaveLength(1);
    await stewardStop(s.url, p, SID, WORD);
    await until(() => pastes(fake.attachInput(SHORT)).length === 2, 8000);
    expect(pastes(fake.attachInput(SHORT))[1]).toBe(filled(pr(7)));
  }, 15_000);

  it("a_word_still_queued_when_its_card_closes_is_dropped_and_never_sent", async () => {
    const p = paths();
    const { lead, steward, fake } = reused(p, [], [], "busy");
    const s = await startSteward(p, fake);
    const card = await cardFrom(s, p);
    expect(await askWord(s, card.id)).toBe(204);
    card.abort();
    await townWhere(s.url, (t) => t.cards.length === 0);
    fake.list([lead, steward("idle")]);
    await sleep(1500); // longer than the quiet wait before a paste
    expect(fake.attachInput(SHORT)).toBe("");
    expect(await askWord(s, card.id)).toBe(404);
  });

  it("a_word_whose_card_closes_while_the_attach_waits_to_paste_is_dropped_and_never_sent", async () => {
    const p = paths();
    const { fake } = reused(p, []);
    const s = await startSteward(p, fake);
    const card = await cardFrom(s, p);
    expect(await askWord(s, card.id)).toBe(204);
    await until(() => fake.attachPids(SHORT).length === 1, 8000);
    card.abort(); // within the attach's quiet wait
    await until(() => fake.attachPids(SHORT).every(gone), 5000);
    expect(fake.attachInput(SHORT)).toBe("");
    expect(stewardLines(p)).toEqual([]);
  });

  it("a_reply_without_all_three_labels_fails_the_word_naming_them_with_one_log_line_and_only_then_may_it_be_asked_again", async () => {
    const p = paths();
    const { fake } = reused(p, []);
    const s = await startSteward(p, fake);
    const card = await cardFrom(s, p);
    expect(await askWord(s, card.id)).toBe(204);
    await until(() => pastes(fake.attachInput(SHORT)).length === 1, 8000);
    await stewardStop(s.url, p, SID, "I would allow it.");
    const failed = wordOf(await townWhere(s.url, (t) => wordOf(t, card.id)?.state === "failed"), card.id);
    expect(failed).toEqual({ state: "failed", reason: "the reply lacks Pick, Why, Check first" });
    expect(stewardLines(p).map((l) => l.message)).toEqual([`reply on card ${card.id} lacks Pick, Why, Check first`]);
    await sleep(600);
    expect(pastes(fake.attachInput(SHORT))).toHaveLength(1);

    expect(await askWord(s, card.id)).toBe(204);
    await until(() => pastes(fake.attachInput(SHORT)).length === 2, 8000);
    await stewardStop(s.url, p, SID, "Pick: Allow\nWhy: It only reads.");
    const again = wordOf(await townWhere(s.url, (t) => wordOf(t, card.id)?.reason === "the reply lacks Check first"), card.id);
    expect(again).toEqual({ state: "failed", reason: "the reply lacks Check first" });
    expect(stewardLines(p)).toHaveLength(2);
  }, 15_000);

  it("a_stop_failure_on_a_word_fails_it_at_once_rather_than_leaving_it_writing", async () => {
    const p = paths();
    const { fake } = reused(p, []);
    const s = await startSteward(p, fake);
    const card = await cardFrom(s, p);
    expect(await askWord(s, card.id)).toBe(204);
    await until(() => pastes(fake.attachInput(SHORT)).length === 1, 8000);
    expect(await post(s.url, ev("StopFailure", { cwd: p.stewardDir, error: "rate_limit" }, SID))).toBe(204);
    const t = await townWhere(s.url, (x) => wordOf(x, card.id)?.state === "failed");
    expect(wordOf(t, card.id)).toEqual({ state: "failed", reason: "the steward's turn failed" });
  });

  it("a_word_being_written_fails_when_the_steward_leaves_the_list_rather_than_staying_writing", async () => {
    const p = paths();
    const { lead, fake } = reused(p, []);
    const s = await startSteward(p, fake);
    const card = await cardFrom(s, p);
    expect(await askWord(s, card.id)).toBe(204);
    await until(() => pastes(fake.attachInput(SHORT)).length === 1, 8000);
    fake.list([lead]);
    const t = await townWhere(s.url, (x) => wordOf(x, card.id)?.state === "failed");
    expect(wordOf(t, card.id)).toEqual({ state: "failed", reason: "the steward left the list" });
  });

  it("asking_for_a_word_lifts_the_pause_the_users_own_prompt_set_and_the_word_goes_before_the_review_held_back", async () => {
    const p = paths();
    const { fake } = reused(p, [pr(7), pr(9)]);
    const s = await startSteward(p, fake);
    await ask(s, p, 7);
    await until(() => pastes(fake.attachInput(SHORT)).length === 1, 8000);
    await ask(s, p, 9);
    await stewardStop(s.url, p, SID, REVIEW);
    expect(await post(s.url, ev("UserPromptSubmit", { cwd: p.stewardDir, prompt: "How are you?" }, SID))).toBe(204);
    await stewardStop(s.url, p, SID, "Fine.");
    await until(() => fake.attachPids(SHORT).every(gone), 5000);
    await sleep(1500); // #9 would be pasted by now without the pause
    expect(pastes(fake.attachInput(SHORT))).toHaveLength(1);

    const card = await cardFrom(s, p);
    expect(await askWord(s, card.id)).toBe(204);
    await until(() => pastes(fake.attachInput(SHORT)).length === 2, 8000);
    expect(pastes(fake.attachInput(SHORT))[1]).toMatch(/^Word for app:\n/);
    await stewardStop(s.url, p, SID, WORD);
    await until(() => pastes(fake.attachInput(SHORT)).length === 3, 8000);
    expect(pastes(fake.attachInput(SHORT))[2]).toBe(filled(pr(9)));
  }, 20_000);

  it("a_word_for_an_unknown_or_closed_card_is_404_and_one_without_the_page_token_or_origin_is_refused_and_nothing_is_sent", async () => {
    const p = paths();
    const { fake } = reused(p, []);
    const s = await startSteward(p, fake);
    const card = await cardFrom(s, p);
    const token = await tokenOf(s.url);
    expect((await postPage(s, "/word", { card: card.id }, { origin: s.url })).status).toBe(403);
    expect((await postPage(s, "/word", { card: card.id }, { "x-funtown-token": token })).status).toBe(403);
    expect((await postPage(s, "/word", { card: card.id }, { origin: "http://evil.example", "x-funtown-token": token })).status).toBe(403);
    expect(await askWord(s, "no-such-card")).toBe(404);
    expect((await postPage(s, "/word", { card: 7 })).status).toBe(400);
    await sleep(600);
    expect(wordOf(await townWhere(s.url, () => true), card.id)).toEqual({ state: "idle" });
    card.abort();
    await townWhere(s.url, (t) => t.cards.length === 0);
    expect(await askWord(s, card.id)).toBe(404);
    await sleep(600);
    expect(fake.attachInput(SHORT)).toBe("");
  });

  it("the_brief_names_who_and_where_the_ask_each_option_the_pick_the_severity_and_the_goal_and_carries_the_raw_input_cut_at_8000_characters_without_control_characters", async () => {
    const p = paths();
    mkdirSync(join(p.project, ".claude"));
    writeFileSync(join(p.project, ".claude", "phase.json"), JSON.stringify({ phase: "build", steps: ["spec", "build", "review"], goal: "Ship the parser", spec: "docs/specs/parser.md" }));
    const BG = "b0000001-0000-4000-8000-000000000000";
    const { steward } = reused(p, []);
    const fake = fakeClaude().list([listedBg(BG, p.project, { name: "beta" }), steward("idle")]).prs(p.project, []);
    const s = await startSteward(p, fake);
    await townWhere(s.url, (t) => houseAt(t, p.project)?.leads.length === 1);
    const questions = [{
      question: "Keep the old parser?\x1b[201~\x07",
      header: "medium: data",
      options: [{ label: "Keep it (Recommended)", description: "Old files still load." }, { label: "Drop it", description: "x".repeat(9_000) }],
    }];
    const card = await cardFrom(s, p, ev("PreToolUse", { cwd: p.project, tool_name: "AskUserQuestion", tool_input: { questions } }, BG));
    expect(await askWord(s, card.id)).toBe(204);
    await until(() => pastes(fake.attachInput(SHORT)).length === 1, 8000);
    const [text] = pastes(fake.attachInput(SHORT));

    expect(text).toContain(`Who: beta, in the project app (${p.project})`);
    expect(text).toContain("Question 1 [medium: data]: Keep the old parser?[201~\n");
    expect(text).toContain("  Option 1: Keep it (Recommended): Old files still load.\n");
    expect(text).toContain("  Option 2: Drop it: xxx");
    expect(text).toContain("  The agent's pick: Keep it (Recommended)\n");
    expect(text).toContain("Severity: medium; source: agent; reason: the agent's word: medium: data\n");
    expect(text).toContain("Phase: build, step 2 of 3\nGoal: Ship the parser\nSpec: docs/specs/parser.md\n");
    const raw = text.slice(text.indexOf("Raw input of AskUserQuestion:\n") + "Raw input of AskUserQuestion:\n".length);
    expect(raw).toMatch(/\n\(cut at 8,000 of 9,\d{3} characters\)$/);
    expect(raw.indexOf("\n(cut at")).toBe(8_000);
    expect(text).not.toMatch(/[\x00-\x08\x0b-\x1f\x7f]/);
  });

  it("a_plans_brief_names_approve_as_the_agents_pick_as_the_card_does", async () => {
    // Breaks if the brief she reads says the plan has no pick while the card's ribbon is on Approve.
    const p = paths();
    const BG = "b0000001-0000-4000-8000-000000000000";
    const { steward } = reused(p, []);
    const fake = fakeClaude().list([listedBg(BG, p.project, { name: "beta" }), steward("idle")]).prs(p.project, []);
    const s = await startSteward(p, fake);
    await townWhere(s.url, (t) => houseAt(t, p.project)?.leads.length === 1);
    const card = await cardFrom(s, p, ev("PreToolUse", { cwd: p.project, tool_name: "ExitPlanMode", tool_input: { plan: "Goal: ship it" } }, BG));
    expect(await askWord(s, card.id)).toBe(204);
    await until(() => pastes(fake.attachInput(SHORT)).length === 1, 8000);
    expect(pastes(fake.attachInput(SHORT))[0]).toContain("  The agent's pick: Approve\n");
  });

  it("the_shipped_card_prompt_names_the_project_holds_the_brief_and_asks_for_pick_why_and_check_first", async () => {
    const p = paths("zebra-shop");
    const { fake } = reused(p, []);
    const s = await startSteward(p, fake, { stewardCardPrompt: undefined });
    const card = await cardFrom(s, p);
    expect(await askWord(s, card.id)).toBe(204);
    await until(() => pastes(fake.attachInput(SHORT)).length === 1, 8000);
    const [text] = pastes(fake.attachInput(SHORT));
    expect(text).toContain("`zebra-shop · card`");
    expect(text).toContain("Ask: may it run Bash: npm test");
    expect(text).not.toMatch(/\{(project|brief)\}/);
    for (const label of ["Pick:", "Why:", "Check first:"]) expect(text).toContain(label);
  });

  it("a_word_is_served_by_its_letter_id_after_a_review_is_newer_while_a_plain_letters_call_still_gives_only_the_newest", async () => {
    const p = paths();
    const { fake } = reused(p, [pr(7)]);
    const s = await startSteward(p, fake);
    const card = await cardFrom(s, p);
    expect(await askWord(s, card.id)).toBe(204);
    await until(() => pastes(fake.attachInput(SHORT)).length === 1, 8000);
    await stewardStop(s.url, p, SID, WORD);
    const word = wordOf(await townWhere(s.url, (t) => wordOf(t, card.id)?.state === "ready"), card.id)!.letter!;
    await ask(s, p, 7);
    await until(() => pastes(fake.attachInput(SHORT)).length === 2, 8000);
    await stewardStop(s.url, p, SID, REVIEW);
    const review = reviewOf(await townWhere(s.url, (t) => reviewOf(t, p, 7)?.state === "ready"), p, 7)!.letter!;

    expect((await stewardLetters(s)).letters.map((l) => l.text)).toEqual([REVIEW]);
    expect(await stewardLetters(s, `&id=${word}`)).toEqual({ status: 200, letters: [expect.objectContaining({ id: word, text: WORD })] });
    expect(await stewardLetters(s, `&id=${review}`)).toEqual({ status: 200, letters: [expect.objectContaining({ id: review, text: REVIEW })] });
    expect((await stewardLetters(s, "&id=letter-none")).status).toBe(404);
    const noToken = await fetch(`${s.url}/letters?lead=${SID}&id=${word}`);
    expect(noToken.status).toBe(403);
  }, 15_000);

  it("a_word_with_no_reply_in_five_minutes_fails_with_one_log_line_and_the_next_request_goes", async () => {
    const p = paths();
    const { fake } = reused(p, [pr(7)]);
    const s = await startSteward(p, fake);
    const card = await cardFrom(s, p);
    expect(await askWord(s, card.id)).toBe(204);
    await until(() => pastes(fake.attachInput(SHORT)).length === 1, 8000);
    const pasted = Date.now(); // just after the paste
    await ask(s, p, 7);
    await until(() => fake.attachPids(SHORT).every(gone), 5000);
    // Only the clock is faked: the server's polls and the fake claude keep real time.
    vi.useFakeTimers({ toFake: ["Date"], now: pasted + 5 * 60_000 - 5_000 });
    try {
      await sleep(600); // several polls just before the bound
      expect(wordOf(await townWhere(s.url, () => true), card.id)).toEqual({ state: "writing" });
      expect(pastes(fake.attachInput(SHORT))).toHaveLength(1);

      vi.setSystemTime(pasted + 5 * 60_000);
      const t = await townWhere(s.url, (x) => wordOf(x, card.id)?.state === "failed");
      expect(wordOf(t, card.id)).toEqual({ state: "failed", reason: "no reply in 5 minutes" });
      await until(() => pastes(fake.attachInput(SHORT)).length === 2, 8000);
      expect(pastes(fake.attachInput(SHORT))[1]).toBe(filled(pr(7)));
      expect(stewardLines(p).map((l) => l.message)).toEqual([`no word on card ${card.id} after 5 min`]);
    } finally {
      vi.useRealTimers();
    }
  }, 15_000);
});
