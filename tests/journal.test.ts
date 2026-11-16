import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CWD, ev, fakeClaude, jsonLines, leadsOf, leadWhere, listed, post, realDir, sleep, start, tokenOf, townWhere, until, type Json } from "./helpers.ts";
import type { JournalEntry, Letter, Morning } from "../server/types.ts";

const sub = { agent_id: "x1", agent_type: "Explore" };
const handback = (message: string, agent = sub) =>
  ev("PostToolUse", { ...agent, tool_name: "SubagentHandback", tool_input: { message } });

const journalPath = () => join(realDir(), "journal.jsonl");
const entries = (path: string) => jsonLines<JournalEntry>(path);

async function listedServer(journal?: string, extra: Record<string, unknown> = {}) {
  const s = await start({ journal, ...extra, fake: fakeClaude().list([listed("s1", CWD)]) });
  await townWhere(s.url, (t) => leadsOf(t).length === 1);
  const token = await tokenOf(s.url);
  const letters = async (lead = "s1") =>
    (await (await fetch(`${s.url}/letters?lead=${lead}`, { headers: { "x-funtown-token": token } })).json()) as Letter[];
  const send = async (...events: Json[]) => {
    for (const e of events) expect(await post(s.url, e)).toBe(204);
  };
  return { ...s, token, letters, send };
}

describe("a subagent's letter is its handback report", () => {
  it("a_handback_report_is_the_subagents_letter_even_when_its_stop_carries_no_message", async () => {
    const s = await listedServer();
    await s.send(ev("SubagentStart", sub), handback("The report."), ev("SubagentStop", sub));
    expect(await s.letters()).toMatchObject([{ from: "x1", text: "The report." }]);
  });

  it("a_subagent_with_a_handback_and_a_stop_message_gets_one_letter_the_handback", async () => {
    const s = await listedServer();
    await s.send(
      ev("SubagentStart", sub),
      handback("The report."),
      ev("SubagentStop", { ...sub, last_assistant_message: "stop text" }),
    );
    expect((await s.letters()).map((l) => l.text)).toEqual(["The report."]);
  });
});

describe("the journal", () => {
  it("a_letter_is_appended_as_one_line_with_the_session_lists_cwd_not_the_events", async () => {
    const path = journalPath();
    const s = await listedServer(path);
    const stop = ev("Stop", { last_assistant_message: "All done.", cwd: "/somewhere/else" });
    await s.send(stop);
    await until(() => entries(path).length >= 1);
    expect(entries(path)).toMatchObject([
      { kind: "letter", at: stop.funtown.at, cwd: CWD, lead: "s1", letter: { from: "s1", text: "All done." } },
    ]);
  });

  it("an_event_with_no_cwd_from_a_session_the_list_does_not_know_writes_no_line", async () => {
    const path = journalPath();
    const s = await listedServer(path);
    const noCwd: Json = { ...ev("Stop", { last_assistant_message: "from nowhere" }, "ghost") };
    delete noCwd.cwd;
    await s.send(noCwd, ev("Stop", { last_assistant_message: "marker" }));
    await until(() => entries(path).length >= 1);
    expect(entries(path).map((e) => (e.kind === "letter" ? e.letter.text : e.kind))).toEqual(["marker"]);
  });

  it("a_character_becoming_stuck_is_journaled_once_while_it_stays_stuck", async () => {
    const path = journalPath();
    const s = await listedServer(path);
    await s.send(
      ev("StopFailure", { error: "rate_limit" }),
      ev("StopFailure", { error: "server_error" }),
      ev("Stop", { last_assistant_message: "marker" }),
    );
    await until(() => entries(path).some((e) => e.kind === "letter"));
    const stuck = entries(path).filter((e) => e.kind === "stuck");
    expect(stuck).toMatchObject([{ kind: "stuck", cwd: CWD, lead: "s1", who: "s1", reason: "rate limit" }]);
  });

  it("start_drops_lines_older_than_7_days_skips_a_line_that_does_not_parse_and_keeps_recent_ones", async () => {
    const path = journalPath();
    const entry = (at: number, text: string): JournalEntry => ({
      kind: "letter", at, cwd: CWD, lead: "s1", letter: { id: text, from: "s1", name: "s1", text, at },
    });
    const day = 86_400_000;
    writeFileSync(path, [entry(Date.now() - 8 * day, "ancient"), "{not json", JSON.stringify(entry(Date.now() - day, "recent"))].join("\n") + "\n");
    const s = await listedServer(path);
    const res = await fetch(`${s.url}/morning?since=0`, { headers: { "x-funtown-token": s.token } });
    expect(res.status).toBe(200);
    const text = readFileSync(path, "utf8");
    expect(text).toContain("recent");
    expect(text).not.toContain("ancient");
  });

  it("start_leaves_a_journal_it_cannot_read_untouched_instead_of_emptying_it", async () => {
    const path = journalPath();
    const old = JSON.stringify({ kind: "letter", at: Date.now() - 8 * 86_400_000, cwd: CWD, lead: "s1", letter: { id: "a", from: "s1", name: "s1", text: "ancient", at: 1 } });
    const recent = JSON.stringify({ kind: "letter", at: Date.now(), cwd: CWD, lead: "s1", letter: { id: "b", from: "s1", name: "s1", text: "recent", at: 1 } });
    const content = `${old}\n${recent}\n`;
    writeFileSync(path, content);
    chmodSync(path, 0o200); // write-only: reading fails, writing would work
    try {
      await listedServer(path);
    } finally {
      chmodSync(path, 0o600);
    }
    expect(readFileSync(path, "utf8")).toBe(content);
  });

  it("a_journal_that_cannot_be_read_makes_morning_answer_500_leaves_the_file_as_it_was_and_the_page_still_serves", async () => {
    const path = journalPath();
    const content = `${JSON.stringify({ kind: "letter", at: Date.now(), cwd: CWD, lead: "s1", letter: { id: "b", from: "s1", name: "s1", text: "recent", at: 1 } })}\n`;
    writeFileSync(path, content);
    chmodSync(path, 0o200);
    try {
      const s = await start({ journal: path });
      const res = await fetch(`${s.url}/morning?since=0`, { headers: { "x-funtown-token": await tokenOf(s.url) } });
      expect(res.status).toBe(500);
      expect((await fetch(`${s.url}/`)).status).toBe(200);
    } finally {
      chmodSync(path, 0o600);
    }
    expect(readFileSync(path, "utf8")).toBe(content);
  });

  it("after_a_restart_the_leads_journaled_letters_return_in_its_panel_and_new_letter_ids_never_repeat_them", async () => {
    const path = journalPath();
    const first = await listedServer(path);
    await first.send(
      ev("SubagentStart", sub),
      ev("SubagentStop", { ...sub, last_assistant_message: "from the subagent" }),
      ev("Stop", { last_assistant_message: "own letter" }),
    );
    await until(() => entries(path).length >= 2);
    await first.close();

    const second = await listedServer(path);
    const restored = await second.letters();
    expect(restored.map((l) => l.text)).toEqual(["own letter", "from the subagent"]);
    const town = await townWhere(second.url, (t) => leadsOf(t)[0]?.letter !== undefined);
    expect(leadsOf(town)[0].letter).toBe(restored[0].at);

    await second.send(ev("Stop", { last_assistant_message: "after restart" }));
    const all = await second.letters();
    expect(all).toHaveLength(3);
    expect(new Set(all.map((l) => l.id)).size).toBe(3);
  });
});

describe("the journal across list failures and restarts", () => {
  const failed = () => fakeClaude().list([listed("s1", CWD, { state: "failed" })]);
  const stuckEntries = (path: string) => entries(path).filter((e) => e.kind === "stuck");

  it("a_failed_turn_the_list_keeps_reporting_is_journaled_once_even_after_a_hook_unsticks_it_but_a_new_failure_is_journaled", async () => {
    const path = journalPath();
    const s = await start({ journal: path, fake: failed() });
    await until(() => stuckEntries(path).length === 1);
    expect(await post(s.url, ev("UserPromptSubmit"))).toBe(204);
    await sleep(500); // about five polls that still say failed
    expect(stuckEntries(path)).toHaveLength(1);

    // The list stops saying failed; once a poll has applied that, the hook unsticks the lead and the list fails again.
    const asked = s.fake.list([listed("s1", CWD, { status: "busy" })]).listAsks();
    await until(() => s.fake.listAsks() >= asked + 2);
    expect(await post(s.url, ev("UserPromptSubmit"))).toBe(204);
    await leadWhere(s.url, (l) => l?.stage === "working");
    s.fake.list([listed("s1", CWD, { state: "failed" })]);
    await until(() => stuckEntries(path).length === 2);
  });

  it("a_restart_while_the_list_still_says_failed_does_not_journal_the_same_failure_again", async () => {
    const path = journalPath();
    const first = await start({ journal: path, fake: failed() });
    await until(() => stuckEntries(path).length === 1);
    await first.close();

    const second = await start({ journal: path, fake: failed() });
    await leadWhere(second.url, (l) => l?.needs === "stuck");
    await sleep(300); // a few more polls
    expect(stuckEntries(path)).toHaveLength(1);
  });

  it("start_skips_a_journaled_letter_without_a_string_id_or_from_or_a_numeric_at", async () => {
    const path = journalPath();
    const at = Date.now() - 1000;
    const whole = { id: "ok", from: "s1", name: "s1", text: "whole", at };
    const line = (letter: Json) => JSON.stringify({ kind: "letter", at, cwd: CWD, lead: "s1", letter });
    writeFileSync(
      path,
      [line(whole), line({ ...whole, id: undefined, text: "no id" }), line({ ...whole, id: "f", from: 7, text: "numeric from" }), line({ ...whole, id: "a", at: "yesterday", text: "text at" })].join("\n") + "\n",
    );
    const s = await listedServer(path);
    expect((await s.letters()).map((l) => l.text)).toEqual(["whole"]);
  });
});

describe("GET /morning", () => {
  const A = "/work/alpha";
  const day = Date.now();
  const letter = (cwd: string, lead: string, from: string, text: string, ago: number): JournalEntry => ({
    kind: "letter", at: day - ago, cwd, lead, letter: { id: `${from}-${text}`, from, name: from, text, at: day - ago },
  });
  const stuck = (cwd: string, lead: string, ago: number): JournalEntry => ({
    kind: "stuck", at: day - ago, cwd, lead, who: lead, name: lead, reason: "rate limit",
  });
  const seed = [
    letter(A, "s1", "s1", "A1 older", 1000),
    letter(A, "s1", "s1", "A1 newest", 500),
    letter(A, "s1", "x1", "sub letter", 100),
    letter(A, "s2", "s2", "A2", 300),
    stuck(A, "s1", 200),
    letter("/work/delta", "s9", "s9", "D1", 1500),
    letter("/work/beta", "s8", "s8", "before the window", 3000),
  ];

  async function morning(since: number) {
    const path = journalPath();
    writeFileSync(path, seed.map((e) => JSON.stringify(e)).join("\n") + "\n");
    const s = await start({ journal: path });
    const res = await fetch(`${s.url}/morning?since=${since}`, { headers: { "x-funtown-token": await tokenOf(s.url) } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    return (await res.json()) as Morning;
  }

  it("morning_groups_by_cwd_newest_first_and_keeps_one_own_letter_per_lead_under_done_and_never_a_subagents", async () => {
    const m = await morning(day - 2000);
    expect(m.since).toBe(day - 2000);
    expect(m.projects.map((p) => [p.project, p.cwd])).toEqual([["alpha", A], ["delta", "/work/delta"]]);
    const [alpha, delta] = m.projects;
    expect(alpha.done.map((l) => [l.lead, l.text])).toEqual([["s2", "A2"], ["s1", "A1 newest"]]);
    expect(alpha.stuck).toMatchObject([{ at: day - 200, lead: "s1", who: "s1", reason: "rate limit" }]);
    expect(delta.done.map((l) => l.text)).toEqual(["D1"]);
    expect(delta.stuck).toEqual([]);
  });

  it("morning_leaves_out_entries_before_since", async () => {
    const m = await morning(day - 2000);
    expect(JSON.stringify(m)).not.toContain("before the window");
    expect(m.projects.map((p) => p.project)).not.toContain("beta");
  });

  it("morning_needs_the_page_token_and_a_numeric_since", async () => {
    const s = await start({ journal: journalPath() });
    const token = await tokenOf(s.url);
    expect((await fetch(`${s.url}/morning?since=0`)).status).toBe(403);
    expect((await fetch(`${s.url}/morning?since=0`, { headers: { "x-funtown-token": "wrong" } })).status).toBe(403);
    const h = { "x-funtown-token": token };
    expect((await fetch(`${s.url}/morning`, { headers: h })).status).toBe(400);
    expect((await fetch(`${s.url}/morning?since=abc`, { headers: h })).status).toBe(400);
  });

  it("morning_without_a_journal_answers_200_with_no_projects", async () => {
    const s = await start();
    const res = await fetch(`${s.url}/morning?since=0`, { headers: { "x-funtown-token": await tokenOf(s.url) } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ since: 0, projects: [] });
  });
});

