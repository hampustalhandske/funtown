import { describe, expect, it } from "vitest";
import { leadsOf, listed, post, start, townWhere, type Json } from "./helpers.ts";

const CWD = "/work/demo-app";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let clock = Date.now();
/** A hook event for session s1 whose `at` is strictly later than the one before. */
const ev = (name: string, extra: Json = {}, session = "s1") => ({
  hook_event_name: name,
  session_id: session,
  cwd: CWD,
  funtown: { tty: "ttys009", term_program: "TestTerm", at: (clock = Math.max(clock + 1, Date.now())) },
  ...extra,
});
const bash = (command: string) => ({ tool_name: "Bash", tool_input: { command } });

/** A server whose list shows the busy interactive session s1 and polls every 100 ms. */
async function withBusy(status = "busy") {
  const s = await start();
  s.fake.list([listed("s1", CWD, { status })]);
  await townWhere(s.url, (t) => leadsOf(t).length === 1);
  return s;
}
const lead = async (url: string, ok: (l: ReturnType<typeof leadsOf>[number]) => boolean) =>
  leadsOf(await townWhere(url, (t) => ok(leadsOf(t)[0])))[0];

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
