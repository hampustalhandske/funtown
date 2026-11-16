import { describe, expect, it } from "vitest";
import { CWD, ev, leadWhere as lead, leadsOf, listed, post, sleep, start, townWhere } from "./helpers.ts";

const bash = (command: string) => ({ tool_name: "Bash", tool_input: { command } });

/** A server whose list shows the busy interactive session s1 and polls every 100 ms. */
async function withBusy(status: "busy" | "idle" | "waiting" = "busy") {
  const s = await start();
  s.fake.list([listed("s1", CWD, { status })]);
  await townWhere(s.url, (t) => leadsOf(t).length === 1);
  return s;
}

describe("stuck from StopFailure", () => {
  it("a_stop_failure_shows_stuck_with_the_error_as_words_and_a_list_poll_does_not_clear_it", async () => {
    const { url } = await withBusy();
    await post(url, ev("StopFailure", { error: "rate_limit", error_details: "x", last_assistant_message: "" }));
    const first = await lead(url, (l) => l.needs === "stuck");
    expect(first).toMatchObject({ stage: "needs_you", needs: "stuck", reason: "rate limit" });
    expect(typeof first.since).toBe("number");

    await sleep(450); // several polls, each listing the session as busy
    const later = await lead(url, () => true);
    expect(later).toMatchObject({ stage: "needs_you", needs: "stuck", reason: "rate limit", since: first.since });
  });

  it("a_stop_failure_without_an_error_says_error", async () => {
    const { url } = await withBusy();
    await post(url, ev("StopFailure", {}));
    expect(await lead(url, (l) => l.needs === "stuck")).toMatchObject({ reason: "error" });
    await post(url, ev("PreToolUse", bash("ls")));
    await lead(url, (l) => l.stage === "working");
    await post(url, ev("StopFailure", { error: "" }));
    expect(await lead(url, (l) => l.needs === "stuck")).toMatchObject({ reason: "error" });
  });

  it.each([
    ["SessionStart", {}],
    ["UserPromptSubmit", {}],
    ["PreToolUse", bash("ls")],
  ])("a_%s_after_a_stop_failure_clears_stuck", async (name, extra) => {
    const { url } = await withBusy();
    await post(url, ev("StopFailure", { error: "server_error" }));
    await lead(url, (l) => l.needs === "stuck");
    await post(url, ev(name, extra));
    const after = await lead(url, (l) => l.needs !== "stuck");
    expect(after.reason).toBeUndefined();
    expect(after.stage).not.toBe("needs_you");
  });

  it("a_stop_failure_inside_a_subagent_makes_that_subagent_stuck", async () => {
    const { url } = await withBusy();
    await post(url, ev("SubagentStart", { agent_id: "x1", agent_type: "Explore" }));
    await post(url, ev("StopFailure", { agent_id: "x1", agent_type: "Explore", error: "server_error" }));
    const l = await lead(url, (x) => x.subagents[0]?.needs === "stuck");
    expect(l.subagents[0]).toMatchObject({ stage: "needs_you", reason: "server error" });
  });
});

describe("since", () => {
  it("since_survives_polls_for_the_same_need_and_is_reset_by_a_new_need_or_leaving_needs_you", async () => {
    const { url } = await withBusy("idle");
    await post(url, ev("Stop"));
    const a = await lead(url, (l) => l.needs === "turn ended");
    expect(typeof a.since).toBe("number");
    await sleep(350);
    expect((await lead(url, () => true)).since).toBe(a.since);

    await post(url, ev("PermissionRequest"));
    const b = await lead(url, (l) => l.needs === "permission");
    expect(b.since).toBeGreaterThan(a.since!);

    await post(url, ev("UserPromptSubmit"));
    const w = await lead(url, (l) => l.stage === "working");
    expect(w.since).toBeUndefined();
  });

  it("a_character_with_an_open_card_has_since_of_its_oldest_card_and_the_card_wins_over_stuck", async () => {
    const { url } = await withBusy();
    const ctl = new AbortController();
    fetch(`${url}/stream`, { signal: ctl.signal }).then((r) => r.body!.pipeTo(new WritableStream())).catch(() => {});
    try {
      await post(url, ev("StopFailure", { error: "rate_limit" }));
      await lead(url, (l) => l.needs === "stuck");
      fetch(`${url}/hold`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(ev("PermissionRequest", bash("rm -rf build"))),
        signal: ctl.signal,
      }).catch(() => {});
      const t = await townWhere(url, (s) => s.cards.length === 1);
      const l = leadsOf(t)[0];
      expect(l).toMatchObject({ stage: "needs_you", needs: "permission", since: t.cards[0].at });
    } finally {
      ctl.abort();
    }
  });
});

describe("stuck from a loop", () => {
  const call = (command = "npm test") => ev("PreToolUse", bash(command));

  it("four_identical_calls_are_not_stuck_and_the_fifth_is", async () => {
    const { url } = await withBusy();
    for (let i = 0; i < 4; i++) await post(url, call());
    await lead(url, (l) => l.step === "Bash: npm test");
    await sleep(150);
    expect((await lead(url, () => true)).needs).not.toBe("stuck");
    await post(url, call());
    expect(await lead(url, (l) => l.needs === "stuck")).toMatchObject({
      stage: "needs_you",
      reason: "loop: Bash: npm test",
    });
  });

  it("calls_with_different_input_do_not_add_up_to_a_loop", async () => {
    const { url } = await withBusy();
    for (const c of ["a", "a", "a", "b", "a", "a", "a", "a"]) await post(url, call(c));
    await sleep(250);
    expect((await lead(url, () => true)).needs).not.toBe("stuck");
  });

  it.each([
    ["a_different_call", () => call("ls")],
    ["a_new_prompt", () => ev("UserPromptSubmit")],
    ["a_session_start", () => ev("SessionStart")],
  ])("%s_clears_a_loop", async (_n, next) => {
    const { url } = await withBusy();
    for (let i = 0; i < 5; i++) await post(url, call());
    await lead(url, (l) => l.needs === "stuck");
    await post(url, next());
    const after = await lead(url, (l) => l.needs !== "stuck");
    expect(after.stage).not.toBe("needs_you");
  });

  it("a_loop_stays_stuck_through_list_polls", async () => {
    const s = await withBusy();
    for (let i = 0; i < 5; i++) await post(s.url, call());
    const a = await lead(s.url, (l) => l.needs === "stuck");
    await sleep(350);
    expect(await lead(s.url, () => true)).toMatchObject({ needs: "stuck", since: a.since });
  });
});

describe("needs that list polls must not disturb", () => {
  it("a_waiting_poll_after_a_permission_request_keeps_needs_permission_and_since", async () => {
    const s = await withBusy();
    await post(s.url, ev("PermissionRequest"));
    const a = await lead(s.url, (l) => l.needs === "permission");
    s.fake.list([listed("s1", CWD, { status: "waiting", waitingFor: "permission prompt" })]);
    await sleep(450);
    expect(await lead(s.url, () => true)).toMatchObject({ stage: "needs_you", needs: "permission", since: a.since });
  });

  it("a_lead_listed_waiting_without_waiting_for_keeps_one_since_across_polls", async () => {
    const s = await start();
    s.fake.list([listed("s1", CWD, { status: "waiting" })]);
    const a = await lead(s.url, (l) => l?.stage === "needs_you");
    expect(typeof a.since).toBe("number");
    await sleep(450);
    expect((await lead(s.url, () => true)).since).toBe(a.since);
  });

  it("opening_the_hold_card_for_a_permission_request_does_not_move_the_leads_since", async () => {
    const { url } = await withBusy();
    const ctl = new AbortController();
    fetch(`${url}/stream`, { signal: ctl.signal }).then((r) => r.body!.pipeTo(new WritableStream())).catch(() => {});
    try {
      const request = ev("PermissionRequest", bash("rm -rf build"));
      await post(url, request);
      const a = await lead(url, (l) => l.needs === "permission");
      fetch(`${url}/hold`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(ev("PermissionRequest", bash("rm -rf build"))), // a later `at`
        signal: ctl.signal,
      }).catch(() => {});
      await townWhere(url, (t) => t.cards.length === 1);
      expect((await lead(url, () => true)).since).toBe(a.since);
    } finally {
      ctl.abort();
    }
  });
});

describe("a stuck subagent", () => {
  const stuckSub = async () => {
    const { url } = await withBusy();
    await post(url, ev("SubagentStart", { agent_id: "x1", agent_type: "Explore" }));
    await post(url, ev("StopFailure", { agent_id: "x1", agent_type: "Explore", error: "server_error" }));
    await lead(url, (l) => l.subagents[0]?.needs === "stuck");
    return url;
  };

  it.each(["UserPromptSubmit", "SessionStart"])("is_done_not_needs_you_after_its_leads_%s", async (name) => {
    const url = await stuckSub();
    await post(url, ev(name));
    const l = await lead(url, (x) => x.subagents[0]?.stage !== "needs_you");
    expect(l.subagents[0].stage).toBe("done");
  });

  it("stays_stuck_after_its_own_subagent_stop", async () => {
    const url = await stuckSub();
    await post(url, ev("SubagentStop", { agent_id: "x1", agent_type: "Explore" }));
    await sleep(250);
    expect((await lead(url, () => true)).subagents[0]).toMatchObject({ stage: "needs_you", needs: "stuck" });
  });
});

describe("turn ended while the list says busy", () => {
  it("a_lead_whose_stop_arrived_stays_turn_ended_through_busy_polls_until_its_next_tool_call", async () => {
    // Catches a session idle at its prompt showing "thinking" because background commands keep the list at busy.
    const { url } = await withBusy();
    await post(url, ev("PreToolUse", bash("npm start")));
    await post(url, ev("Stop"));
    const ended = await lead(url, (l) => l.needs === "turn ended");
    await sleep(450); // several polls, each listing the session as busy
    expect(await lead(url, () => true)).toMatchObject({ stage: "needs_you", needs: "turn ended", since: ended.since });

    await post(url, ev("PreToolUse", bash("ls")));
    await lead(url, (l) => l.stage === "working");
    await post(url, ev("PostToolUse", bash("ls")));
    await sleep(450);
    expect((await lead(url, () => true)).stage).toBe("working");
  });
});

describe("stuck from the list", () => {
  it("a_lead_the_list_marks_failed_shows_stuck_error_and_its_next_prompt_clears_it", async () => {
    // Catches a failed session showing a plain "turn ended" (for example after a Funtown restart lost its StopFailure).
    const s = await start();
    s.fake.list([listed("s1", CWD, { status: "idle", state: "failed" })]);
    const stuck = await lead(s.url, (l) => l?.needs === "stuck");
    expect(stuck).toMatchObject({ stage: "needs_you", reason: "error" });

    await post(s.url, ev("UserPromptSubmit"));
    s.fake.list([listed("s1", CWD, { status: "busy", state: "working" })]);
    await lead(s.url, (l) => l?.stage === "working");
  });

  it("every_snapshot_of_one_server_carries_the_same_started_time", async () => {
    // Catches `started` changing between snapshots, which would show the page a restart banner for nothing.
    const { url } = await withBusy();
    const a = await townWhere(url, () => true);
    await post(url, ev("PreToolUse", bash("ls")));
    const b = await townWhere(url, (t) => leadsOf(t)[0]?.activity === "Bash: ls");
    expect(typeof a.started).toBe("number");
    expect(b.started).toBe(a.started);
  });
});
