import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { connect, connectPage, CWD, evAt as ev, held, hold, jsonLines, leadsOf, listed, listedBg, post, postPage, realDir, sleep, start, tokenOf, townWhere, until, type Json } from "./helpers.ts";

/**
 * The answer log (`answers.jsonl`): one line per closed ask of a listed lead, saying where it
 * was answered. Tests drive the real server over HTTP and a real /term socket on the fake claude.
 */

const BG = "bg111111-0000-4000-8000-000000000000";
const OTHER_BG = "bg222222-0000-4000-8000-000000000000";

afterEach(() => {
  vi.useRealTimers();
});

const permission = (at: number, session = "s1", command = "rm -rf build") =>
  ev("PermissionRequest", at, { tool_name: "Bash", tool_input: { command } }, session);
const question = (at: number, header = "low: db", session = BG) =>
  ev(
    "PreToolUse",
    at,
    {
      tool_name: "AskUserQuestion",
      tool_use_id: "tu1",
      tool_input: { questions: [{ question: "Which db?", header, multiSelect: false, options: [{ label: "Postgres", description: "" }, { label: "SQLite", description: "" }] }] },
    },
    session,
  );
const plan = (at: number, session = BG) =>
  ev("PreToolUse", at, { tool_name: "ExitPlanMode", tool_use_id: "tu2", tool_input: { plan: "1. Do it" } }, session);
/** The event that shows the question's tool call ran, so its card was answered somewhere else. */
const questionRan = (session = BG) => ev("PostToolUse", 300, { tool_name: "AskUserQuestion", tool_use_id: "tu1" }, session);

/** A server with a terminal lead `s1` and background leads BG and OTHER_BG, all listed, writing to a fresh answer log; `page` false leaves no page open. */
async function room(opts: Parameters<typeof start>[0] & { page?: boolean } = {}) {
  const { page = true, ...rest } = opts;
  const log = join(mkdtempSync(join(tmpdir(), "funtown-answers-")), "answers.jsonl");
  const s = await start({ pollMs: 60_000, answerLog: log, ...rest });
  s.fake.list([listed("s1", CWD), listedBg(BG, CWD, { status: "busy" }), listedBg(OTHER_BG, CWD, { status: "busy" })]);
  await townWhere(s.url, (t) => leadsOf(t).length === 3);
  const token = await tokenOf(s.url);
  if (page) {
    connectPage(s.url);
    await sleep(50);
  }
  return { ...s, token, log, lines: () => jsonLines(log) };
}
type Room = Awaited<ReturnType<typeof room>>;

const answer = (s: Room, body: Json) => postPage(s, "/answer", body);

describe("the answer log: a card that was shown", () => {
  it("each_way_a_card_closes_adds_one_line_with_by_kind_severity_its_source_and_queen_false", async () => {
    // Breaks if a line lacks the severity or its source, which split the share by kind and severity.
    const s = await room();
    const line = (kind: string, by: string, severity: string, source: string) => ({
      at: expect.any(Number), lead: "s1", project: "demo-app", kind, by, severity, source, queen: false,
    });

    const a = await held(s, permission(100));
    await answer(s, { card: a.card.id, decision: "allow" });
    await until(() => s.lines().length === 1);
    expect(s.lines()).toEqual([line("permission", "funtown", "high", "rule")]);

    const b = await held(s, permission(200));
    await post(s.url, ev("PostToolUse", 300, { tool_name: "Bash", tool_input: { command: "rm -rf build" } }));
    await until(() => s.lines().length === 2);
    expect(s.lines()[1]).toEqual(line("permission", "elsewhere", "high", "rule"));
    await b.reply;

    const c = await held(s, permission(400));
    c.abort();
    await until(() => s.lines().length === 3);
    expect(s.lines()[2]).toEqual(line("permission", "dropped", "high", "rule"));
  });

  it("a_question_line_carries_the_agents_level_and_a_plan_line_its_kind_default", async () => {
    const s = await room();
    const q = await held(s, question(100, "low: db"));
    await answer(s, { card: q.card.id, decision: "allow", answers: { "Which db?": "Postgres" } });
    const p = await held(s, plan(200));
    await answer(s, { card: p.card.id, decision: "allow" });
    await until(() => s.lines().length === 2);
    expect(s.lines()).toEqual([
      expect.objectContaining({ lead: BG, kind: "question", by: "funtown", severity: "low", source: "agent" }),
      expect.objectContaining({ lead: BG, kind: "plan", by: "funtown", severity: "medium", source: "kind" }),
    ]);
  });

  it("queen_is_true_when_a_word_was_asked_for_that_card_and_false_for_one_not_asked", async () => {
    // Breaks if the log reads the word after the steward dropped it, or reads it for the wrong card.
    const root = realDir();
    const cardFile = join(root, "steward-card.md");
    writeFileSync(cardFile, "Word for {project}:\n{brief}");
    const reviewFile = join(root, "steward.md");
    writeFileSync(reviewFile, "");
    const s = await room({ stewardDir: join(root, "funtown", "steward"), stewardPrompt: reviewFile, stewardCardPrompt: cardFile });
    const asked = await held(s, permission(100));
    const quiet = await held(s, permission(200));
    expect((await postPage(s, "/word", { card: asked.card.id })).status).toBe(204);
    await answer(s, { card: asked.card.id, decision: "allow" });
    await answer(s, { card: quiet.card.id, decision: "allow" });
    await until(() => s.lines().length === 2);
    expect(s.lines().map((l) => l.queen)).toEqual([true, false]);
  });
});

describe("the answer log: terminal and elsewhere", () => {
  /** Opens /term on `lead` and sends one input frame; resolves once the pty has it. */
  async function typeIn(s: Room, lead = BG) {
    const c = await connect(s, { lead });
    await until(() => c.out().includes("attached"));
    c.send({ t: "in", d: "1" });
    await until(() => c.out().includes('got:"1"'));
    return c;
  }

  it("a_card_that_closes_elsewhere_within_10_seconds_of_input_on_a_term_socket_for_its_lead_is_terminal", async () => {
    // Breaks if typing in Funtown's terminal is counted as an answer given elsewhere.
    vi.useFakeTimers({ toFake: ["Date"] });
    const s = await room();
    await held(s, question(100));
    await typeIn(s);
    vi.setSystemTime(Date.now() + 9_000);
    await post(s.url, questionRan());
    await until(() => s.lines().length === 1);
    expect(s.lines()[0]).toMatchObject({ lead: BG, kind: "question", by: "terminal", severity: "low", queen: false });
  });

  it("without_input_on_a_term_socket_the_same_close_is_elsewhere", async () => {
    const s = await room();
    await held(s, question(100));
    await post(s.url, questionRan());
    await until(() => s.lines().length === 1);
    expect(s.lines()[0]).toMatchObject({ by: "elsewhere" });
  });

  it("input_more_than_10_seconds_before_the_close_is_elsewhere", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const s = await room();
    await held(s, question(100));
    await typeIn(s);
    vi.setSystemTime(Date.now() + 11_000);
    await post(s.url, questionRan());
    await until(() => s.lines().length === 1);
    expect(s.lines()[0]).toMatchObject({ by: "elsewhere" });
  });

  it("input_typed_before_the_card_appeared_does_not_make_it_terminal", async () => {
    // Breaks if any recent typing counts, so a card closed elsewhere right after a chat in the terminal is miscounted.
    const s = await room();
    await typeIn(s);
    await held(s, question(100));
    await post(s.url, questionRan());
    await until(() => s.lines().length === 1);
    expect(s.lines()[0]).toMatchObject({ by: "elsewhere" });
  });

  it("input_for_another_lead_does_not_make_a_card_terminal", async () => {
    const s = await room();
    await held(s, question(100));
    await typeIn(s, OTHER_BG);
    await post(s.url, questionRan());
    await until(() => s.lines().length === 1);
    expect(s.lines()[0]).toMatchObject({ by: "elsewhere" });
  });

  it("a_card_answered_on_the_page_after_typing_is_still_funtown", async () => {
    const s = await room();
    const q = await held(s, question(100));
    await typeIn(s);
    await answer(s, { card: q.card.id, decision: "allow", answers: { "Which db?": "Postgres" } });
    await until(() => s.lines().length === 1);
    expect(s.lines()[0]).toMatchObject({ by: "funtown" });
  });
});

describe("the answer log: unshown asks", () => {
  it("a_terminal_leads_question_or_plan_is_logged_unshown_with_the_reason_terminal_session_and_still_answered_204", async () => {
    const s = await room();
    expect((await hold(s.url, question(100, "high: data", "s1")).reply).status).toBe(204);
    expect((await hold(s.url, plan(200, "s1")).reply).status).toBe(204);
    await until(() => s.lines().length === 2);
    expect(s.lines()).toEqual([
      { at: expect.any(Number), lead: "s1", project: "demo-app", kind: "question", by: "unshown", reason: "terminal session", severity: "high", source: "agent", queen: false },
      { at: expect.any(Number), lead: "s1", project: "demo-app", kind: "plan", by: "unshown", reason: "terminal session", severity: "medium", source: "kind", queen: false },
    ]);
  });

  it("a_terminal_leads_permission_is_a_card_not_an_unshown_line", async () => {
    const s = await room();
    const p = await held(s, permission(100));
    await sleep(100);
    expect(s.lines()).toEqual([]);
    p.abort();
    await until(() => s.lines().length === 1);
    expect(s.lines()[0]).toMatchObject({ by: "dropped" });
  });

  it("any_ask_of_a_listed_lead_while_no_page_is_open_is_logged_unshown_with_the_reason_no_page", async () => {
    const s = await room({ page: false, unlistedMs: 150 });
    await sleep(250);
    expect((await hold(s.url, permission(100)).reply).status).toBe(204);
    expect((await hold(s.url, question(200)).reply).status).toBe(204);
    await until(() => s.lines().length === 2);
    expect(s.lines()).toEqual([
      expect.objectContaining({ lead: "s1", kind: "permission", by: "unshown", reason: "no page", severity: "high", source: "rule" }),
      expect.objectContaining({ lead: BG, kind: "question", by: "unshown", reason: "no page", severity: "low", source: "agent" }),
    ]);
  });

  it("asks_from_a_session_that_is_not_listed_are_never_logged", async () => {
    // Breaks if Funtown logs asks from sessions outside the listed projects.
    const s = await room({ page: false, unlistedMs: 150 });
    await sleep(250);
    expect((await hold(s.url, permission(100, "ghost")).reply).status).toBe(204);
    await sleep(150);
    expect(s.lines()).toEqual([]);
  });

  it("a_tool_call_that_is_not_an_ask_is_not_logged", async () => {
    const s = await room({ page: false, unlistedMs: 150 });
    await sleep(250);
    expect((await hold(s.url, ev("PreToolUse", 100, { tool_name: "Bash", tool_input: { command: "ls" } })).reply).status).toBe(204);
    await sleep(150);
    expect(s.lines()).toEqual([]);
  });
});
