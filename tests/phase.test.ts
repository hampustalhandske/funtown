import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { errorLines, ev, houseAt, leadsOf, listed, post, realDir, sleep, start, townWhere, until, type Json } from "./helpers.ts";

/** A server listing lead s1 ("alpha") in a fresh real project folder, with its error log. */
async function withProject() {
  const cwd = realDir();
  mkdirSync(join(cwd, ".claude"));
  const log = join(realDir(), "errors.log");
  const s = await start({ errorLog: log });
  s.fake.list([listed("s1", cwd, { name: "alpha" })]);
  await townWhere(s.url, (t) => leadsOf(t).length === 1);
  const phaseFile = (text: string | null) =>
    text === null ? rmSync(join(cwd, ".claude", "phase.json"), { force: true }) : writeFileSync(join(cwd, ".claude", "phase.json"), text);
  const phaseLines = () => errorLines(log).filter((l) => l.source === "server" && l.step === "phase");
  const send = async (...events: Json[]) => {
    for (const e of events) expect(await post(s.url, { ...e, cwd })).toBe(204);
  };
  return { ...s, cwd, phaseFile, phaseLines, send };
}

describe("the phase file", () => {
  it("the_phase_and_note_follow_the_file_each_poll_ignoring_unknown_fields_and_a_missing_file_shows_nothing", async () => {
    const s = await withProject();
    s.phaseFile(JSON.stringify({ phase: "build", note: "tests first", tags: {}, owner: "someone" }));
    const first = await townWhere(s.url, (t) => houseAt(t, s.cwd)?.phase !== undefined);
    expect(houseAt(first, s.cwd)!.phase).toEqual({ phase: "build", note: "tests first" });

    s.phaseFile(JSON.stringify({ phase: "review" }));
    const second = await townWhere(s.url, (t) => houseAt(t, s.cwd)?.phase?.phase === "review");
    expect(houseAt(second, s.cwd)!.phase).toEqual({ phase: "review" });

    s.phaseFile(null);
    await townWhere(s.url, (t) => houseAt(t, s.cwd) !== undefined && houseAt(t, s.cwd)!.phase === undefined);
    expect(s.phaseLines()).toEqual([]);
  });

  it("a_file_that_does_not_parse_or_lacks_a_string_phase_shows_nothing_and_logs_one_line_until_it_changes", async () => {
    const s = await withProject();
    s.phaseFile(JSON.stringify({ phase: "build" }));
    await townWhere(s.url, (t) => houseAt(t, s.cwd)?.phase?.phase === "build");

    s.phaseFile('{"phase": "build",');
    await townWhere(s.url, (t) => houseAt(t, s.cwd) !== undefined && houseAt(t, s.cwd)!.phase === undefined);
    await until(() => s.phaseLines().length === 1);
    await sleep(500); // about five polls reading the same bad file
    expect(s.phaseLines()).toHaveLength(1);
    expect(s.phaseLines()[0].message.startsWith(`${s.cwd}: `)).toBe(true);

    s.phaseFile(JSON.stringify({ phase: 3, note: "a number is no phase" }));
    await until(() => s.phaseLines().length === 2);
    await sleep(300);
    expect(s.phaseLines()).toHaveLength(2);
    expect(houseAt(await townWhere(s.url, () => true), s.cwd)!.phase).toBeUndefined();
  });
});

describe("the phase file's steps", () => {
  /** Writes a phase file carrying `steps` under the phase name `phase` and returns the house's phase once the poll shows it. */
  async function stepsShown(s: Awaited<ReturnType<typeof withProject>>, value: unknown, phase: string) {
    s.phaseFile(JSON.stringify({ phase, steps: value }));
    return houseAt(await townWhere(s.url, (t) => houseAt(t, s.cwd)?.phase?.phase === phase), s.cwd)!.phase!;
  }
  const names = (n: number) => Array.from({ length: n }, (_, i) => `step ${i}`);

  it("steps_are_kept_whole_and_in_order", async () => {
    const s = await withProject();
    expect((await stepsShown(s, ["plan", "build", "review"], "p1")).steps).toEqual(["plan", "build", "review"]);
  });

  it("a_list_of_exactly_24_steps_is_kept_whole", async () => {
    const s = await withProject();
    expect((await stepsShown(s, names(24), "p2")).steps).toEqual(names(24));
  });

  it.each([25, 30])("a_list_of_%i_steps_is_dropped_whole_never_cut_to_24", async (n) => {
    const s = await withProject();
    expect((await stepsShown(s, names(n), "p3")).steps).toBeUndefined();
  });

  it.each([
    ["a string", "plan, build"],
    ["a list with a non-string", ["plan", 3]],
  ])("steps_that_are_%s_are_dropped_and_the_phase_stays", async (_what, value) => {
    const s = await withProject();
    expect(await stepsShown(s, value, "p4")).toEqual({ phase: "p4" });
  });

  it("a_file_without_steps_shows_the_phase_alone", async () => {
    const s = await withProject();
    s.phaseFile(JSON.stringify({ phase: "p5" }));
    const none = await townWhere(s.url, (t) => houseAt(t, s.cwd)?.phase?.phase === "p5");
    expect(houseAt(none, s.cwd)!.phase).toEqual({ phase: "p5" });
  });
});

describe("roles and tags", () => {
  it("a_subagents_role_is_its_subagentstart_agent_type_and_a_lead_or_an_untyped_subagent_has_none", async () => {
    const s = await withProject();
    await s.send(ev("SubagentStart", { agent_id: "x1", agent_type: "implementer" }), ev("SubagentStart", { agent_id: "x2" }));
    const lead = leadsOf(await townWhere(s.url, (t) => leadsOf(t)[0]?.subagents.length === 2))[0];
    expect(lead.role).toBeUndefined();
    const by = (id: string) => lead.subagents.find((a) => a.id === id)!;
    expect(by("x1").role).toBe("implementer");
    expect(by("x2").role).toBeUndefined();
  });

  it("tags_come_from_the_role_then_the_name_without_repeats_never_from_the_session_id", async () => {
    const s = await withProject();
    await s.send(ev("SubagentStart", { agent_id: "x1", agent_type: "implementer" }), ev("SubagentStart", { agent_id: "x2", agent_type: "Explore" }));
    const before = leadsOf(await townWhere(s.url, (t) => leadsOf(t)[0]?.subagents.length === 2))[0];
    const x1Name = before.subagents.find((a) => a.id === "x1")!.name;
    s.phaseFile(
      JSON.stringify({
        phase: "build",
        tags: { implementer: ["writes", "tests"], [x1Name]: ["tests", "m13"], alpha: ["lead"], s1: ["by-id"] },
      }),
    );
    const lead = leadsOf(await townWhere(s.url, (t) => leadsOf(t)[0]?.tags !== undefined))[0];
    expect(lead.tags).toEqual(["lead"]);
    const by = (id: string) => lead.subagents.find((a) => a.id === id)!;
    expect(by("x1").tags).toEqual(["writes", "tests", "m13"]);
    expect(by("x2").tags).toBeUndefined();
  });
});
