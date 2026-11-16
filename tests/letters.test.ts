import { describe, expect, it } from "vitest";
import { leadWhere, leadsOf, listed, post, sleep, start, tokenOf, townWhere, type Json } from "./helpers.ts";
import type { Letter } from "../server/types.ts";

const CWD = "/work/demo-app";
let clock = Date.now();
/** A hook event for `session` whose `funtown.at` is strictly later than the one before. */
const ev = (name: string, extra: Json = {}, session = "s1") => ({
  hook_event_name: name,
  session_id: session,
  cwd: CWD,
  funtown: { tty: "ttys009", term_program: "TestTerm", at: (clock = Math.max(clock + 1, Date.now())) },
  ...extra,
});
const sub = { agent_id: "x1", agent_type: "Explore" };

/** A server listing interactive sessions `ids`, with a getter for GET /letters that sends the page token. */
async function withListed(...ids: string[]) {
  const s = await start();
  s.fake.list(ids.map((id) => listed(id, CWD)));
  await townWhere(s.url, (t) => leadsOf(t).length === ids.length);
  const token = await tokenOf(s.url);
  const get = (lead: string, headers: Record<string, string> = { "x-funtown-token": token }) =>
    fetch(`${s.url}/letters?lead=${encodeURIComponent(lead)}`, { headers });
  const letters = async (lead = "s1"): Promise<Letter[]> => {
    const res = await get(lead);
    expect(res.status).toBe(200);
    return (await res.json()) as Letter[];
  };
  /** Posts each event and checks the server took it. */
  const send = async (...events: Json[]) => {
    for (const e of events) expect(await post(s.url, e)).toBe(204);
  };
  return { ...s, token, get, letters, send };
}

describe("letters from Stop and SubagentStop", () => {
  it("a_stop_with_a_message_becomes_a_letter_from_the_lead_and_sets_the_leads_letter", async () => {
    const s = await withListed("s1");
    const stop = ev("Stop", { last_assistant_message: "## Done\n\nAll **green**." });
    await s.send(stop);

    const res = await s.get("s1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    const got = (await res.json()) as Letter[];
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ from: "s1", name: "s1", text: "## Done\n\nAll **green**.", at: stop.funtown.at });
    expect(typeof got[0].id).toBe("string");
    expect((await leadWhere(s.url, (l) => l?.letter !== undefined)).letter).toBe(stop.funtown.at);
  });

  it("an_empty_or_missing_message_makes_no_letter", async () => {
    const s = await withListed("s1");
    await s.send(
      ev("SubagentStart", sub),
      ev("SubagentStop", { ...sub, last_assistant_message: "" }),
      ev("Stop", { last_assistant_message: "" }),
      ev("Stop"),
    );
    expect(await s.letters()).toEqual([]);
    const lead = await leadWhere(s.url, (l) => l?.needs === "turn ended");
    expect(lead.letter).toBeUndefined();
    expect(lead.subagents[0].letter).toBeUndefined();
  });

  it("a_subagent_letter_goes_on_its_own_lead_from_the_subagent_and_marks_the_subagent", async () => {
    const s = await withListed("s1", "s2");
    await s.send(ev("SubagentStart", sub, "s2"));
    const stop = ev("SubagentStop", { ...sub, last_assistant_message: "Found 3 call sites." }, "s2");
    await s.send(stop);

    const town = await townWhere(s.url, (t) => leadsOf(t).find((l) => l.id === "s2")?.subagents[0]?.letter !== undefined);
    const [s1, s2] = ["s1", "s2"].map((id) => leadsOf(town).find((l) => l.id === id)!);
    expect(s2.subagents[0].letter).toBe(stop.funtown.at);
    expect(s1.letter).toBeUndefined();
    expect(await s.letters("s1")).toEqual([]);
    expect(await s.letters("s2")).toMatchObject([
      { from: "x1", name: s2.subagents[0].name, text: "Found 3 call sites.", at: stop.funtown.at },
    ]);
  });

  it("a_lead_keeps_its_newest_20_letters_its_own_and_its_subagents_together_newest_first", async () => {
    const s = await withListed("s1");
    await s.send(ev("SubagentStart", sub), ev("SubagentStop", { ...sub, last_assistant_message: "oldest, from x1" }));
    for (let i = 1; i <= 20; i++) await s.send(ev("Stop", { last_assistant_message: `turn ${i}` }));

    const got = await s.letters();
    expect(got.map((l) => l.text)).toEqual(Array.from({ length: 20 }, (_, i) => `turn ${20 - i}`));
    expect(new Set(got.map((l) => l.id)).size).toBe(20);
  });

  it("a_message_over_64_kb_is_cut_and_ends_with_an_ellipsis", async () => {
    const s = await withListed("s1");
    await s.send(ev("Stop", { last_assistant_message: "a".repeat(70_000) }));
    const [letter] = await s.letters();
    expect(letter.text.endsWith("…")).toBe(true);
    expect(letter.text.length).toBeLessThanOrEqual(64 * 1024);
    expect(letter.text.length).toBeGreaterThan(60_000);
    expect(letter.text.slice(0, -1)).toMatch(/^a+$/);
  });

  it("a_lead_that_leaves_the_list_takes_its_letters_with_it", async () => {
    const s = await withListed("s1");
    await s.send(ev("Stop", { last_assistant_message: "bye" }));
    expect(await s.letters()).toHaveLength(1);

    s.fake.list([]);
    await townWhere(s.url, (t) => leadsOf(t).length === 0);
    expect((await s.get("s1")).status).toBe(404);

    s.fake.list([listed("s1", CWD)]);
    const back = await leadWhere(s.url, (l) => l !== undefined);
    expect(back.letter).toBeUndefined();
    expect(await s.letters()).toEqual([]);
  });
});

describe("GET /letters", () => {
  it("refuses_a_request_without_the_right_token_and_answers_404_for_a_lead_not_listed", async () => {
    const s = await withListed("s1");
    await s.send(ev("Stop", { last_assistant_message: "secret plan" }));

    for (const headers of [{}, { "x-funtown-token": "0".repeat(32) }]) {
      const res = await s.get("s1", headers);
      expect(res.status).toBe(403);
      expect(await res.text()).not.toContain("secret plan");
    }
    expect((await s.get("s9")).status).toBe(404);
    expect(await s.letters()).toHaveLength(1);
  });
});

describe("a lead whose turn ends while its subagents still work", () => {
  /** s1 listed busy, with subagents x1 and x2 started and still working. */
  async function withWorkingSubagents() {
    const s = await withListed("s1");
    s.fake.list([listed("s1", CWD, { status: "busy" })]);
    await leadWhere(s.url, (l) => l?.stage === "working");
    await s.send(ev("SubagentStart", sub), ev("SubagentStart", { agent_id: "x2", agent_type: "Explore" }));
    return s;
  }

  it("stays_working_waiting_on_its_agents_out_of_needs_you_and_still_keeps_its_letter", async () => {
    const s = await withWorkingSubagents();
    await s.send(ev("Stop", { last_assistant_message: "Waiting for the explorers." }));
    const lead = await leadWhere(s.url, (l) => l?.activity === "waiting on 2 agents");
    expect(lead.stage).toBe("working");
    expect(lead.needs).toBeUndefined();
    expect(lead.since).toBeUndefined();
    expect(await s.letters()).toMatchObject([{ from: "s1", text: "Waiting for the explorers." }]);

    await sleep(350); // several polls, each listing the session as busy
    expect(await leadWhere(s.url, () => true)).toMatchObject({ stage: "working", activity: "waiting on 2 agents" });
  });

  it("its_next_stop_with_no_working_subagents_ends_the_turn", async () => {
    const s = await withWorkingSubagents();
    await s.send(ev("Stop"));
    await leadWhere(s.url, (l) => l?.activity === "waiting on 2 agents");
    await s.send(
      ev("SubagentStop", { ...sub, last_assistant_message: "x1 done" }),
      ev("SubagentStop", { agent_id: "x2", agent_type: "Explore", last_assistant_message: "x2 done" }),
      ev("Stop", { last_assistant_message: "All in." }),
    );
    const lead = await leadWhere(s.url, (l) => l?.stage === "needs_you");
    expect(lead).toMatchObject({ needs: "turn ended" });
    expect(typeof lead.since).toBe("number");
  });

  it("a_list_poll_saying_idle_ends_the_turn_even_while_a_subagent_still_shows_working", async () => {
    const s = await withWorkingSubagents();
    await s.send(ev("Stop"));
    await leadWhere(s.url, (l) => l?.activity === "waiting on 2 agents");
    s.fake.list([listed("s1", CWD, { status: "idle" })]);
    const lead = await leadWhere(s.url, (l) => l?.stage === "needs_you");
    expect(lead.needs).toBe("turn ended");
    expect(lead.subagents.map((a) => a.stage)).toEqual(["working", "working"]);
  });
});
