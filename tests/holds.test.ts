import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Card } from "../server/types.ts";
import { leadsOf, listed, listedBg, post, sleep, start, tokenOf, townWhere, until, type Json } from "./helpers.ts";


const CWD = "/work/demo-app";
const BG = "bg111111-0000-4000-8000-000000000000";

const aborts: AbortController[] = [];
afterEach(() => {
  for (const a of aborts.splice(0)) a.abort();
});

const ev = (name: string, at: number, extra: Json = {}, session = "s1") => ({
  hook_event_name: name,
  session_id: session,
  cwd: CWD,
  funtown: { at },
  ...extra,
});
const permission = (at: number, command = "rm -rf build", extra: Json = {}) =>
  ev("PermissionRequest", at, { tool_name: "Bash", tool_input: { command }, ...extra });
const question = (at: number, extra: Json = {}) =>
  ev("PreToolUse", at, { tool_name: "AskUserQuestion", tool_use_id: "tu1", tool_input: QUESTIONS, ...extra }, BG);
const plan = (at: number) =>
  ev("PreToolUse", at, { tool_name: "ExitPlanMode", tool_use_id: "tu2", tool_input: { plan: "1. Do it" } }, BG);
const QUESTIONS = {
  questions: [
    { question: "Which db?", header: "DB", multiSelect: false, options: [{ label: "Postgres", description: "" }, { label: "SQLite", description: "" }] },
    { question: "Which extras?", header: "X", multiSelect: true, options: [{ label: "A", description: "" }, { label: "B", description: "" }] },
  ],
};

/** A server with a terminal lead `s1` and a background lead BG (both listed) and a page connected to it. */
async function room(opts: Parameters<typeof start>[0] = {}) {
  const s = await start({ pollMs: 60_000, ...opts });
  s.fake.list([listed("s1", CWD), listedBg(BG, CWD, { status: "busy" })]);
  await townWhere(s.url, (t) => leadsOf(t).length === 2);
  const token = await tokenOf(s.url);
  connectPage(s.url);
  await sleep(50);
  return { ...s, token };
}

/** Keeps a /stream open for the rest of the test, as an open page does. */
function connectPage(url: string) {
  const ctl = new AbortController();
  aborts.push(ctl);
  fetch(`${url}/stream`, { signal: ctl.signal }).then((r) => r.body!.pipeTo(new WritableStream())).catch(() => {});
}

/** POSTs a hook payload to /hold; `reply` settles when the server answers, `abort` closes the request. */
function hold(url: string, payload: Json, headers: Record<string, string> = {}) {
  const ctl = new AbortController();
  aborts.push(ctl);
  const reply = fetch(`${url}/hold`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(payload),
    signal: ctl.signal,
  });
  reply.catch(() => {});
  return { reply, abort: () => ctl.abort() };
}

const cardsWhere = async (url: string, ok: (c: Card[]) => boolean) => (await townWhere(url, (t) => ok(t.cards))).cards;

type S = Awaited<ReturnType<typeof room>>;
const answer = (s: S, body: Json, headers: Record<string, string> = { origin: s.url, "x-funtown-token": s.token }) =>
  fetch(`${s.url}/answer`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

/** Holds `payload`, waits for its card and returns the card and the pending reply. */
async function held(s: S, payload: Json) {
  const before = (await cardsWhere(s.url, () => true)).length;
  const h = hold(s.url, payload);
  const cards = await cardsWhere(s.url, (c) => c.length === before + 1);
  return { card: cards[cards.length - 1], reply: h.reply, abort: h.abort };
}

describe("POST /hold + POST /answer: the hook output per answer", () => {
  it("a_permission_card_carries_the_payload_and_allow_replies_with_the_exact_allow_output", async () => {
    const s = await room();
    const { card, reply } = await held(s, permission(100));
    expect(card).toMatchObject({ lead: "s1", agent: null, kind: "permission", tool: "Bash", input: { command: "rm -rf build" }, cwd: CWD, at: 100 });
    expect((await answer(s, { card: card.id, decision: "allow" })).status).toBe(204);
    const res = await reply;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } });
  });

  it("deny_on_a_permission_replies_with_the_deny_output_that_says_funtown", async () => {
    const s = await room();
    const { card, reply } = await held(s, permission(100));
    expect((await answer(s, { card: card.id, decision: "deny" })).status).toBe(204);
    expect(await (await reply).json()).toEqual({
      hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "deny", message: "The user denied this in Funtown." } },
    });
  });

  it("a_subagents_permission_card_carries_its_agent_id", async () => {
    const s = await room();
    const { card } = await held(s, permission(100, "ls", { agent_id: "x1", agent_type: "Explore" }));
    expect(card.agent).toBe("x1");
  });

  it("a_question_reply_puts_the_answers_into_the_tool_input_and_allows", async () => {
    const s = await room();
    const { card, reply } = await held(s, question(100));
    expect(card).toMatchObject({ lead: BG, kind: "question", tool: "AskUserQuestion", input: QUESTIONS });
    const answers = { "Which db?": "Postgres", "Which extras?": "A, B" };
    expect((await answer(s, { card: card.id, decision: "allow", answers })).status).toBe(204);
    expect(await (await reply).json()).toEqual({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: { ...QUESTIONS, answers } },
    });
  });

  it("plan_approve_allows_with_the_input_unchanged_and_keep_denies_with_the_feedback_or_keep_planning", async () => {
    const s = await room();
    const first = await held(s, plan(100));
    expect(first.card).toMatchObject({ kind: "plan", tool: "ExitPlanMode", input: { plan: "1. Do it" } });
    expect((await answer(s, { card: first.card.id, decision: "allow" })).status).toBe(204);
    expect(await (await first.reply).json()).toEqual({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: { plan: "1. Do it" } },
    });

    const keep = async (body: Json) => {
      const h = await held(s, plan(200));
      expect((await answer(s, { card: h.card.id, decision: "deny", ...body })).status).toBe(204);
      return h.reply.then((r) => r.json());
    };
    const out = (reason: string) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } });
    expect(await keep({ feedback: "Split step 1" })).toEqual(out("Split step 1"));
    expect(await keep({})).toEqual(out("Keep planning."));
  });
});

describe("the guards on /hold and /answer", () => {
  it("answer_without_the_token_or_the_origin_gets_403_and_the_card_stays_open", async () => {
    const s = await room();
    const { card } = await held(s, permission(100));
    const body = { card: card.id, decision: "allow" };
    expect((await answer(s, body, { origin: s.url })).status).toBe(403);
    expect((await answer(s, body, { origin: s.url, "x-funtown-token": "0".repeat(32) })).status).toBe(403);
    expect((await answer(s, body, { "x-funtown-token": s.token })).status).toBe(403);
    expect((await answer(s, body, { origin: "http://evil.example", "x-funtown-token": s.token })).status).toBe(403);
    expect((await cardsWhere(s.url, () => true)).map((c) => c.id)).toEqual([card.id]);
    expect((await answer(s, body)).status).toBe(204);
  });

  it("hold_with_an_origin_header_gets_403_and_opens_no_card", async () => {
    const s = await room();
    const res = await hold(s.url, permission(100), { origin: "http://evil.example" }).reply;
    expect(res.status).toBe(403);
    await sleep(150);
    expect(await cardsWhere(s.url, () => true)).toEqual([]);
  });

  it("a_second_answer_to_a_closed_card_gets_404_and_the_first_answer_stands", async () => {
    const s = await room();
    const { card, reply } = await held(s, permission(100));
    expect((await answer(s, { card: card.id, decision: "allow" })).status).toBe(204);
    expect((await answer(s, { card: card.id, decision: "deny" })).status).toBe(404);
    expect(((await (await reply).json()) as Json).hookSpecificOutput).toMatchObject({ decision: { behavior: "allow" } });
  });

  it("a_body_that_does_not_fit_the_cards_kind_gets_400_and_the_card_stays_open", async () => {
    const s = await room();
    const { card } = await held(s, question(100));
    expect((await answer(s, { card: card.id, decision: "deny" })).status).toBe(400);
    expect((await answer(s, { card: card.id, decision: "allow", answers: { "Which db?": "Postgres" } })).status).toBe(400);
    expect((await cardsWhere(s.url, () => true)).map((c) => c.id)).toEqual([card.id]);
    const all = { "Which db?": "Postgres", "Which extras?": "B" };
    expect((await answer(s, { card: card.id, decision: "allow", answers: all })).status).toBe(204);
  });
});

describe("a held question or plan in the Town", () => {
  it("turns_a_background_lead_to_needs_you_with_the_kind_while_the_list_says_busy", async () => {
    const s = await room();
    await held(s, question(100));
    const town = await townWhere(s.url, (t) => leadsOf(t).find((l) => l.id === BG)?.needs === "question");
    expect(leadsOf(town).find((l) => l.id === BG)).toMatchObject({ stage: "needs_you", needs: "question" });
  });

  it("a_terminal_leads_question_is_released_at_once_but_its_permission_is_held", async () => {
    const s = await room();
    const t0 = Date.now();
    const res = await hold(s.url, ev("PreToolUse", 100, { tool_name: "AskUserQuestion", tool_use_id: "t", tool_input: QUESTIONS })).reply;
    expect(res.status).toBe(204);
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(await cardsWhere(s.url, () => true)).toEqual([]);
    const { card } = await held(s, permission(200));
    expect(card.lead).toBe("s1");
  });
});

describe("when a card is released", () => {
  it("only_a_later_event_of_the_same_agent_that_is_not_its_own_pretooluse_notification_or_permission_closes_it", async () => {
    const s = await room();
    const { card, reply } = await held(s, question(100));
    const keeps: [string, Json][] = [
      ["an older event", ev("PostToolUse", 50, { tool_name: "Bash" }, BG)],
      ["the card's own PreToolUse", ev("PreToolUse", 200, { tool_name: "AskUserQuestion", tool_use_id: "tu1" }, BG)],
      ["a Notification", ev("Notification", 210, { notification_type: "permission_prompt" }, BG)],
      ["a PermissionRequest", ev("PermissionRequest", 220, { tool_name: "Bash" }, BG)],
      ["another agent's event", ev("PostToolUse", 230, { agent_id: "sub", tool_name: "Bash" }, BG)],
      ["another session's event", ev("PostToolUse", 240, { tool_name: "Bash" }, "s1")],
    ];
    for (const [what, e] of keeps) expect(await post(s.url, e), what).toBe(204);
    await sleep(200);
    expect((await cardsWhere(s.url, () => true)).map((c) => c.id)).toEqual([card.id]);

    await post(s.url, ev("PostToolUse", 300, { tool_name: "AskUserQuestion", tool_use_id: "tu1" }, BG));
    await cardsWhere(s.url, (c) => c.length === 0);
    expect((await reply).status).toBe(204);
    expect((await answer(s, { card: card.id, decision: "allow", answers: {} })).status).toBe(404);
  });

  it("a_permission_card_stays_for_the_same_tools_pretooluse_with_a_tool_use_id_and_closes_for_a_different_input", async () => {
    const s = await room();
    const { card, reply } = await held(s, permission(100, "npm test"));
    const pre = (at: number, command: string) =>
      ev("PreToolUse", at, { tool_name: "Bash", tool_use_id: "tuX", tool_input: { command } });
    await post(s.url, pre(200, "npm test"));
    await sleep(200);
    expect((await cardsWhere(s.url, () => true)).map((c) => c.id)).toEqual([card.id]);

    await post(s.url, pre(300, "npm run other"));
    await cardsWhere(s.url, (c) => c.length === 0);
    expect((await reply).status).toBe(204);
  });

  it("a_parallel_siblings_posttooluse_leaves_a_permission_card_open_and_its_own_posttooluse_closes_it", async () => {
    const s = await room();
    const { card, reply } = await held(s, permission(100, "npm test"));
    const post_ = (at: number, command: string) =>
      ev("PostToolUse", at, { tool_name: "Bash", tool_use_id: "tuY", tool_input: { command } });
    await post(s.url, post_(200, "ls"));
    await post(s.url, ev("PostToolUse", 210, { tool_name: "Read", tool_input: { file_path: "/a" } }));
    await sleep(200);
    expect((await cardsWhere(s.url, () => true)).map((c) => c.id)).toEqual([card.id]);

    await post(s.url, post_(300, "npm test"));
    await cardsWhere(s.url, (c) => c.length === 0);
    expect((await reply).status).toBe(204);
  });

  it("a_hold_is_released_after_unlistedMs_when_the_last_page_leaves", async () => {
    const s = await start({ pollMs: 100, unlistedMs: 400 });
    s.fake.list([listedBg(BG, CWD)]);
    const page = new AbortController();
    aborts.push(page);
    fetch(`${s.url}/stream`, { signal: page.signal }).then((r) => r.body!.pipeTo(new WritableStream())).catch(() => {});
    await sleep(250);
    const { card, reply } = await held(s, question(100));
    expect(card.kind).toBe("question");
    page.abort();
    const t0 = Date.now();
    expect((await reply).status).toBe(204);
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it("a_hold_with_no_page_connected_is_released_after_unlistedMs", async () => {
    const s = await start({ pollMs: 100, unlistedMs: 300 });
    s.fake.list([listedBg(BG, CWD)]);
    await sleep(250);
    const t0 = Date.now();
    const res = await hold(s.url, question(100)).reply;
    expect(res.status).toBe(204);
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it("a_hold_for_a_session_that_is_never_listed_is_released_after_unlistedMs", async () => {
    const s = await room({ unlistedMs: 400 });
    const t0 = Date.now();
    const res = await hold(s.url, ev("PermissionRequest", 100, { tool_name: "Bash", tool_input: { command: "ls" } }, "ghost")).reply;
    expect(res.status).toBe(204);
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it("a_hold_for_a_session_that_gets_listed_within_unlistedMs_is_kept_as_a_card", async () => {
    const s = await room({ unlistedMs: 3000, pollMs: 100 });
    hold(s.url, ev("PermissionRequest", 100, { tool_name: "Bash", tool_input: { command: "ls" } }, "late"));
    await sleep(200);
    s.fake.list([listed("s1", CWD), listedBg(BG, CWD, { status: "busy" }), listed("late", CWD)]);
    const cards = await cardsWhere(s.url, (c) => c.length === 1);
    expect(cards[0]).toMatchObject({ lead: "late", kind: "permission" });
  });
});

describe("the answer log", () => {
  it("each_way_a_card_closes_adds_one_line_with_the_right_by", async () => {
    const log = join(mkdtempSync(join(tmpdir(), "funtown-answers-")), "answers.jsonl");
    const s = await room({ answerLog: log });
    const lines = () => (existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
    const line = (kind: string, by: string) => ({ at: expect.any(Number), lead: "s1", project: "demo-app", kind, by });

    const a = await held(s, permission(100));
    await answer(s, { card: a.card.id, decision: "allow" });
    await until(() => lines().length === 1);
    expect(lines()).toEqual([line("permission", "funtown")]);

    const b = await held(s, permission(200));
    await post(s.url, ev("PostToolUse", 300, { tool_name: "Bash", tool_input: { command: "rm -rf build" } }));
    await until(() => lines().length === 2);
    expect(lines()[1]).toEqual(line("permission", "elsewhere"));
    await b.reply;

    const c = await held(s, permission(400));
    c.abort();
    await until(() => lines().length === 3);
    expect(lines()[2]).toEqual(line("permission", "dropped"));
    expect(await cardsWhere(s.url, (cs) => cs.length === 0)).toEqual([]);
  });
});
