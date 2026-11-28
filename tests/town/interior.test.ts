import { describe, expect, test } from "vitest";
import type { Character, House, Lead, Parcel } from "../../server/types.ts";
import type { Drawn, InPlaced } from "../../web/src/town/interior.ts";
import { poseOf } from "../../web/src/town/layout.ts";
import { colourFor, hatFor } from "../../web/src/town/kit/palette.ts";

const char = (id: string, over: Partial<Character> = {}): Character => ({ id, name: id, stage: "working", activity: null, step: null, ...over });
const lead = (id: string, over: Partial<Lead> = {}, subagents: Character[] = []): Lead => ({
  ...char(id), tty: null, termProgram: null, kind: "terminal", shortId: null, subagents, ...over,
});
const parcel = (number: number): Parcel => ({ number, title: `PR ${number}`, url: `https://example.test/${number}`, draft: false, checks: "none" });
const house = (leads: Lead[], over: Partial<House> = {}): House => ({ project: "alpha", cwd: "/work/alpha", leads, ...over });
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

const load = () => import("../../web/src/town/interior.ts");
const of = <K extends InPlaced["kind"]>(all: InPlaced[], kind: K) => all.filter((p): p is Extract<InPlaced, { kind: K }> => p.kind === kind);

describe("interior", () => {
  test("the_observer_is_always_placed_once_at_the_back_even_in_an_empty_house", async () => {
    const { interior, OBSERVER } = await load();
    for (const h of [house([]), house([lead("a1", {}, [char("x1")])], { parcels: [parcel(1)] })]) {
      const observers = of(interior(h), "observer");
      expect(observers).toHaveLength(1);
      expect(observers[0].at).toEqual(OBSERVER);
    }
  });

  test("leads_stand_at_the_front_in_the_house_colour_and_their_subagents_sit_behind_them_in_the_hat_for_their_role", async () => {
    const { interior, FRONT, OBSERVER } = await load();
    const roles = ["implementer", "Plan", "code-reviewer", "statusline-setup"];
    const subs = roles.map((role, i) => char(`x${i}`, { role }));
    const all = interior(house([lead("a1", {}, [...subs, char("untyped")]), lead("a2")]));

    const leads = of(all, "lead");
    expect(leads.map((l) => l.id).sort()).toEqual(["a1", "a2"]);
    const hats = of(all, "hat");
    expect(hats.map((h) => h.id).sort()).toEqual(["untyped", "x0", "x1", "x2", "x3"]);
    for (const l of leads) {
      expect(l.colour).toBe(colourFor("alpha"));
      expect(dist(l.at, FRONT)).toBeLessThan(dist(l.at, OBSERVER));
      for (const h of hats) expect(dist(l.at, FRONT), `${l.id} is nearer the front than desk ${h.id}`).toBeLessThan(dist(h.at, FRONT));
    }
    for (const h of hats) {
      expect(h.lead).toBe("a1");
      expect(h.colour).toBe(colourFor("alpha"));
    }
    expect(Object.fromEntries(hats.map((h) => [h.id, h.hat]))).toEqual({
      x0: hatFor("implementer"), x1: hatFor("Plan"), x2: hatFor("code-reviewer"), x3: hatFor("statusline-setup"), untyped: "cap",
    });
  });

  test("a_done_subagent_is_not_placed_and_a_lead_missing_from_the_house_is_not_placed", async () => {
    const { interior } = await load();
    const before = interior(house([lead("a1", {}, [char("x1"), char("x2")]), lead("a2")]));
    expect(of(before, "hat").map((h) => h.id).sort()).toEqual(["x1", "x2"]);
    const after = interior(house([lead("a1", {}, [char("x1"), char("x2", { stage: "done" })])]));
    expect(of(after, "hat").map((h) => h.id)).toEqual(["x1"]);
    expect(of(after, "lead").map((l) => l.id)).toEqual(["a1"]);
  });

  test("a_waiting_or_stuck_subagent_and_lead_carry_the_pose_the_town_gives_them", async () => {
    const { interior } = await load();
    const asking = char("x1", { stage: "needs_you", needs: "permission", since: 5 });
    const stuck = char("x2", { stage: "needs_you", needs: "stuck", reason: "rate limit", since: 6 });
    const all = interior(house([lead("a1", { stage: "needs_you", needs: "question", since: 4 }, [asking, stuck, char("x3")])]));
    const pose = (id: string) => (of(all, "hat").find((h) => h.id === id) ?? of(all, "lead").find((l) => l.id === id))!.pose;
    expect(pose("x1")).toBe(poseOf(asking));
    expect(pose("x2")).toBe("stuck");
    expect(pose("x3")).toBe("work");
    expect(pose("a1")).toBe("queue");
    expect(new Set([pose("x1"), pose("x2"), pose("x3")]).size, "the three poses differ").toBe(3);
  });

  test("open_parcels_sit_on_the_table_by_the_door_one_each_for_this_house", async () => {
    const { interior, TABLE, FRONT, OBSERVER } = await load();
    const all = interior(house([lead("a1")], { parcels: [parcel(7), parcel(5), parcel(3), parcel(2), parcel(1)] }));
    const parcels = of(all, "parcel");
    expect(parcels.map((p) => p.number).sort()).toEqual([1, 2, 3, 5, 7]);
    for (const p of parcels) {
      expect(p.cwd).toBe("/work/alpha");
      expect(dist(p.at, TABLE)).toBeLessThan(dist(p.at, FRONT));
      expect(dist(p.at, TABLE)).toBeLessThan(dist(p.at, OBSERVER));
    }
  });

  test("no_two_things_share_a_place_even_in_a_crowded_room", async () => {
    const { interior } = await load();
    const subs = (n: number, p: string) => Array.from({ length: n }, (_, i) => char(`${p}${i}`, { role: i % 2 ? "Plan" : "implementer" }));
    const all = interior(house([lead("a1", {}, subs(9, "x")), lead("a2", {}, subs(9, "y")), lead("a3")], { parcels: [1, 2, 3, 4, 5, 6, 7, 8].map(parcel) }));
    expect(all.length).toBe(1 + 3 + 18 + 8);
    for (const [i, a] of all.entries()) {
      for (const b of all.slice(i + 1)) expect(dist(a.at, b.at), `${a.kind} and ${b.kind} stand apart`).toBeGreaterThan(0.3);
    }
  });

  test("the_same_house_gives_the_same_places_on_every_call", async () => {
    const { interior } = await load();
    const h = house([lead("a1", {}, [char("x1", { role: "Plan" }), char("x2")]), lead("a2")], { parcels: [parcel(2), parcel(1)] });
    expect(interior(h)).toEqual(interior(structuredClone(h)));
    expect(interior(h)).toEqual(interior(h));
  });
});

describe("boardOf", () => {
  const withPhase = (phase: House["phase"]) => house([], { phase });
  const steps = ["plan", "build", "review", "merge"];
  const states = (b: { steps: { state: string }[] }) => b.steps.map((s) => s.state);

  test("steps_before_the_phase_are_done_it_is_now_the_next_is_next_and_the_rest_later", async () => {
    const { boardOf } = await load();
    const board = boardOf(withPhase({ phase: "build", note: "tests first", steps }));
    expect(board.project).toBe("alpha");
    expect(board.phase).toBe("build");
    expect(board.note).toBe("tests first");
    expect(board.steps).toEqual([
      { label: "plan", state: "done" },
      { label: "build", state: "now" },
      { label: "review", state: "next" },
      { label: "merge", state: "later" },
    ]);
  });

  test("the_first_and_the_last_step_as_phase_mark_nothing_done_and_nothing_next_respectively", async () => {
    const { boardOf } = await load();
    expect(states(boardOf(withPhase({ phase: "plan", steps })))).toEqual(["now", "next", "later", "later"]);
    expect(states(boardOf(withPhase({ phase: "merge", steps })))).toEqual(["done", "done", "done", "now"]);
  });

  test("a_phase_that_is_not_exactly_one_of_the_steps_marks_every_step_later", async () => {
    const { boardOf } = await load();
    for (const phase of ["Build", "building", "build "]) {
      const board = boardOf(withPhase({ phase, steps }));
      expect(board.phase).toBe(phase);
      expect(board.steps.map((s) => s.label)).toEqual(steps);
      expect(states(board), phase).toEqual(["later", "later", "later", "later"]);
    }
  });

  test("a_phase_file_without_steps_gives_the_phase_and_note_and_no_steps_and_without_a_note_the_note_is_null", async () => {
    const { boardOf } = await load();
    expect(boardOf(withPhase({ phase: "build", note: "tests first" }))).toMatchObject({ phase: "build", note: "tests first", steps: [] });
    expect(boardOf(withPhase({ phase: "build" }))).toMatchObject({ phase: "build", note: null, steps: [] });
  });

  test("no_phase_file_gives_a_blank_board", async () => {
    const { boardOf } = await load();
    expect(boardOf(house([]))).toMatchObject({ phase: null, note: null, steps: [] });
  });
});

describe("drawn", () => {
  const leadAt = (id: string, x: number): InPlaced => ({ kind: "lead", id, colour: "#abc", pose: "work", at: { x, z: -3 } });
  const hatAt = (id: string, x: number): InPlaced => ({ kind: "hat", id, lead: "a1", colour: "#abc", hat: "cap", pose: "work", at: { x, z: 1 } });
  const parcelAt = (number: number): InPlaced => ({ kind: "parcel", cwd: "/work/alpha", number, at: { x: 4, z: 3 } });
  const observer: InPlaced = { kind: "observer", at: { x: 0, z: 5.2 } };
  const idsOf = (all: InPlaced[]) => all.map((p) => (p.kind === "lead" || p.kind === "hat" ? p.id : p.kind)).sort();
  const figure = (all: Drawn[], id: string) => all.find((p) => (p.kind === "lead" || p.kind === "hat") && p.id === id);

  test("everyone_placed_is_drawn_at_their_place_and_nobody_is_marked_leaving", async () => {
    const { drawn } = await load();
    const placed = [leadAt("a1", 0), hatAt("x1", -1), parcelAt(3), observer];
    const out = drawn([], placed, 1000);
    expect(out).toEqual(placed);
    expect(out.some((p) => "leftAt" in p && p.leftAt !== undefined)).toBe(false);
  });

  test("a_figure_that_left_is_kept_at_the_door_marked_with_the_time_it_first_left", async () => {
    const { drawn, DOOR } = await load();
    const first = drawn([], [leadAt("a1", 0), hatAt("x1", -1), observer], 1000);
    const out = drawn(first, [leadAt("a1", 0), observer], 5000);
    const gone = figure(out, "x1")!;
    expect(gone, "the hat is still drawn").toBeDefined();
    expect(gone.at).toEqual(DOOR);
    expect(gone.kind).toBe("hat");
    expect(gone.leftAt).toBe(5000);
    expect(figure(out, "a1")!.leftAt).toBeUndefined();

    // A lead leaves the same way.
    const led = drawn(drawn([], [leadAt("a1", 0), leadAt("a2", 1.5)], 0), [leadAt("a1", 0)], 10);
    expect(figure(led, "a2")!.at).toEqual(DOOR);
    expect(figure(led, "a2")!.leftAt).toBe(10);
  });

  test("a_leaver_keeps_its_first_leftAt_and_is_dropped_once_LEAVE_MS_has_passed", async () => {
    const { drawn, LEAVE_MS } = await load();
    expect(LEAVE_MS).toBe(2500);
    const placed = [leadAt("a1", 0), observer];
    const leaving = drawn(drawn([], [...placed, hatAt("x1", -1)], 0), placed, 10_000);
    expect(figure(leaving, "x1")!.leftAt).toBe(10_000);
    const later = drawn(leaving, placed, 10_000 + LEAVE_MS - 1);
    expect(figure(later, "x1")!.leftAt, "the earlier leftAt is kept").toBe(10_000);
    expect(idsOf(drawn(later, placed, 10_000 + LEAVE_MS)), "gone at exactly LEAVE_MS").toEqual(["a1", "observer"]);
    expect(idsOf(drawn(later, placed, 10_000 + 60_000))).toEqual(["a1", "observer"]);
  });

  test("a_figure_that_comes_back_while_leaving_is_drawn_at_its_place_and_no_longer_marked_leaving", async () => {
    const { drawn, DOOR } = await load();
    const desk = hatAt("x1", -1);
    const leaving = drawn(drawn([], [desk], 0), [], 100);
    expect(figure(leaving, "x1")!.leftAt).toBe(100);
    const back = drawn(leaving, [desk], 200);
    expect(back).toEqual([desk]);
    expect(figure(back, "x1")!.at).not.toEqual(DOOR);
    expect(figure(back, "x1")!.leftAt).toBeUndefined();
  });

  test("a_parcel_and_the_observer_that_are_no_longer_placed_are_dropped_at_once", async () => {
    const { drawn } = await load();
    const before = drawn([], [leadAt("a1", 0), parcelAt(3), observer], 0);
    expect(idsOf(drawn(before, [leadAt("a1", 0)], 1))).toEqual(["a1"]);
  });

  test("drawn_is_pure_the_same_inputs_give_the_same_output_and_the_inputs_are_left_alone", async () => {
    const { drawn } = await load();
    const before = drawn([], [leadAt("a1", 0), hatAt("x1", -1), hatAt("x2", 1), observer], 0);
    const placed = [leadAt("a1", 0), hatAt("x2", 1), observer];
    const [b, p] = [structuredClone(before), structuredClone(placed)];
    const once = drawn(before, placed, 500);
    expect(drawn(before, placed, 500)).toEqual(once);
    expect(before).toEqual(b);
    expect(placed).toEqual(p);
  });
});
