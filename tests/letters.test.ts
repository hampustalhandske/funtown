import { describe, expect, it } from "vitest";
import { CWD, ev, leadWhere, leadsOf, listed, post, sleep, start, tokenOf, townWhere, type Json } from "./helpers.ts";
import type { Letter } from "../server/types.ts";

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

  it("a_message_over_65536_units_is_cut_to_65536_ending_in_an_ellipsis_and_one_of_exactly_65536_is_kept_whole", async () => {
    const s = await withListed("s1");
    await s.send(
      ev("Stop", { last_assistant_message: "a".repeat(65_537) }),
      ev("Stop", { last_assistant_message: "b".repeat(65_536) }),
    );
    const [whole, cut] = await s.letters();
    expect(cut.text).toBe("a".repeat(65_535) + "…");
    expect(whole.text).toBe("b".repeat(65_536));
  });

  it("a_cut_that_falls_inside_an_emoji_drops_the_whole_emoji_and_leaves_no_lone_surrogate", async () => {
    const s = await withListed("s1");
    // "😀" is two UTF-16 units at 65,534-65,535; keeping 65,535 units plus "…" would split it.
    await s.send(ev("Stop", { last_assistant_message: "a".repeat(65_534) + "😀" + "tail" }));
    const [letter] = await s.letters();
    expect(letter.text).toBe("a".repeat(65_534) + "…");
    expect(letter.text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
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

    for (const headers of [{}, { "x-funtown-token": "0".repeat(32) }] as Record<string, string>[]) {
      const res = await s.get("s1", headers);
      expect(res.status).toBe(403);
      expect(await res.text()).not.toContain("secret plan");
    }
    expect((await s.get("s9")).status).toBe(404);
    expect(await s.letters()).toHaveLength(1);
  });
});

describe("a lead whose turn ends while its subagents still work", () => {
  const x2 = { agent_id: "x2", agent_type: "Explore" };
  /** A `background_tasks` entry. */
  const task = (id: string, status: string, type = "subagent") => ({ id, type, status });

  /** s1 listed busy, with subagents x1 and x2 started and still working. */
  async function withWorkingSubagents() {
    const s = await withListed("s1");
    s.fake.list([listed("s1", CWD, { status: "busy" })]);
    await leadWhere(s.url, (l) => l?.stage === "working");
    await s.send(ev("SubagentStart", sub), ev("SubagentStart", x2));
    return s;
  }

  /** s1 waiting on x1 and x2 after a Stop listing both as running. */
  async function waitingOnTwo() {
    const s = await withWorkingSubagents();
    await s.send(ev("Stop", { last_assistant_message: "Waiting for the explorers.", background_tasks: [task("x1", "running"), task("x2", "running")] }));
    await leadWhere(s.url, (l) => l?.activity === "waiting on 2 agents");
    return s;
  }

  it("a_stop_listing_running_or_pending_subagent_tasks_keeps_it_working_waiting_on_them_out_of_needs_you_with_its_letter", async () => {
    const s = await withWorkingSubagents();
    await s.send(
      ev("Stop", {
        last_assistant_message: "Waiting for the explorers.",
        // counted: x1 running, x2 pending; not counted: a finished subagent and a running shell task
        background_tasks: [task("x1", "running"), task("x2", "pending"), task("x0", "completed"), task("b1", "running", "shell")],
      }),
    );
    const lead = await leadWhere(s.url, (l) => l?.activity === "waiting on 2 agents");
    expect(lead.stage).toBe("working");
    expect(lead.needs).toBeUndefined();
    expect(lead.since).toBeUndefined();
    expect(await s.letters()).toMatchObject([{ from: "s1", text: "Waiting for the explorers." }]);

    await sleep(350); // several polls, each listing the session as busy
    expect(await leadWhere(s.url, () => true)).toMatchObject({ stage: "working", activity: "waiting on 2 agents" });
  });

  it("a_stop_without_background_tasks_ends_the_turn_even_while_a_subagent_row_still_shows_working", async () => {
    const s = await withWorkingSubagents();
    await s.send(ev("Stop", { last_assistant_message: "Interrupted." }));
    const lead = await leadWhere(s.url, (l) => l?.stage === "needs_you");
    expect(lead).toMatchObject({ needs: "turn ended", activity: null });
    expect(typeof lead.since).toBe("number");
    expect(lead.subagents.map((a) => a.stage)).toEqual(["working", "working"]);
  });

  it("each_subagent_stop_recounts_from_its_own_tasks_leaving_itself_out_and_at_0_the_lead_works_with_no_activity_until_its_next_stop", async () => {
    const s = await waitingOnTwo();
    // x1's own task still reads running in its SubagentStop; it must not count itself
    await s.send(ev("SubagentStop", { ...sub, last_assistant_message: "x1 done", background_tasks: [task("x1", "running"), task("x2", "running")] }));
    expect(await leadWhere(s.url, (l) => l?.activity === "waiting on 1 agent")).toMatchObject({ stage: "working" });

    await s.send(ev("SubagentStop", { ...x2, last_assistant_message: "x2 done", background_tasks: [task("x2", "running")] }));
    const idle = await leadWhere(s.url, (l) => l?.activity === null);
    expect(idle.stage).toBe("working");
    expect(idle.needs).toBeUndefined();

    await s.send(ev("Stop", { last_assistant_message: "All in." }));
    const ended = await leadWhere(s.url, (l) => l?.stage === "needs_you");
    expect(ended).toMatchObject({ needs: "turn ended", activity: null });
    expect(typeof ended.since).toBe("number");
  });

  it("a_list_poll_saying_idle_ends_the_turn_of_a_lead_still_waiting_on_agents", async () => {
    const s = await waitingOnTwo();
    s.fake.list([listed("s1", CWD, { status: "idle" })]);
    const lead = await leadWhere(s.url, (l) => l?.stage === "needs_you");
    expect(lead.needs).toBe("turn ended");
    expect(lead.subagents.map((a) => a.stage)).toEqual(["working", "working"]);
  });
});
