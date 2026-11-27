import { describe, expect, test } from "vitest";
import type { Character, House, Lead, Parcel, Town } from "../../server/types.ts";
import { urgencyList } from "../../web/src/needs.tsx";
import { layout } from "../../web/src/town/layout.ts";
import { colourFor, hatFor } from "../../web/src/town/kit/palette.ts";

const char = (id: string, over: Partial<Character> = {}): Character => ({ id, name: id, stage: "working", activity: null, step: null, ...over });
const lead = (id: string, over: Partial<Lead> = {}, subagents: Character[] = []): Lead => ({
  ...char(id), tty: null, termProgram: null, kind: "terminal", shortId: null, subagents, ...over,
});
const house = (project: string, leads: Lead[], parcels?: Parcel[]): House => ({ project, cwd: `/work/${project}`, leads, parcels });
const parcel = (number: number): Parcel => ({ number, title: `PR ${number}`, url: `https://example.test/${number}`, draft: false });
const town = (houses: House[]): Town => ({ houses, cards: [], started: 1, claude: { version: "2.1.325", problems: [] } });
const needs = (since: number, over: Partial<Character> = {}): Partial<Character> => ({ stage: "needs_you", needs: "permission", since, ...over });

const place = (t: Town) => layout(t, urgencyList(t));
type Placed = ReturnType<typeof place>[number];
const of = <K extends Placed["kind"]>(all: Placed[], kind: K) => all.filter((p): p is Extract<Placed, { kind: K }> => p.kind === kind);
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe("layout", () => {
  test("a_lead_stands_at_its_own_building_in_that_projects_colour", async () => {
    const all = place(town([house("alpha", [lead("a1")]), house("beta", [lead("b1")]), house("gamma", [lead("c1")])]));
    const buildings = of(all, "building");
    expect(buildings.map((b) => b.cwd).sort()).toEqual(["/work/alpha", "/work/beta", "/work/gamma"]);
    for (const b of buildings) expect(b.colour).toBe(colourFor(b.cwd.split("/").pop()!));
    for (const l of of(all, "lead")) {
      const own = buildings.find((b) => b.cwd === l.cwd)!;
      expect(l.colour).toBe(own.colour);
      // Working means standing at its own building, not at another one.
      expect(l.pose).toBe("work");
      const nearest = [...buildings].sort((p, q) => dist(l.at, p.at) - dist(l.at, q.at))[0];
      expect(nearest.cwd).toBe(l.cwd);
    }
  });

  test("a_working_subagent_is_the_hat_for_its_role_on_its_leads_rack", async () => {
    const roles = ["implementer", "Plan", "code-reviewer", "statusline-setup"];
    const subs = roles.map((role, i) => char(`x${i}`, { role }));
    const all = place(town([house("alpha", [lead("a1", {}, [...subs, char("untyped")])])]));
    const hats = of(all, "hat");
    expect(hats.map((h) => h.id).sort()).toEqual(["untyped", "x0", "x1", "x2", "x3"]);
    for (const h of hats) {
      expect(h.lead).toBe("a1");
      expect(h.cwd).toBe("/work/alpha");
      expect(h.pose).toBe("work");
    }
    const byId = Object.fromEntries(hats.map((h) => [h.id, h.hat]));
    expect(byId).toEqual({ x0: hatFor("implementer"), x1: hatFor("Plan"), x2: hatFor("code-reviewer"), x3: hatFor("statusline-setup"), untyped: "cap" });
  });

  test("a_done_subagent_is_not_placed_but_its_working_sibling_is", async () => {
    const all = place(town([house("alpha", [lead("a1", {}, [char("gone", { stage: "done" }), char("here")])])]));
    expect(of(all, "hat").map((h) => h.id)).toEqual(["here"]);
  });

  test("a_lead_missing_from_the_town_is_not_placed_with_its_hats", async () => {
    const both = town([house("alpha", [lead("a1", {}, [char("x1")]), lead("a2", {}, [char("x2")])])]);
    const one = town([house("alpha", [lead("a2", {}, [char("x2")])])]);
    expect(of(place(both), "lead").map((l) => l.id).sort()).toEqual(["a1", "a2"]);
    const after = place(one);
    expect(of(after, "lead").map((l) => l.id)).toEqual(["a2"]);
    expect(of(after, "hat").map((h) => h.id)).toEqual(["x2"]);
  });

  test("needs_you_and_stuck_are_poses_and_a_needs_you_subagent_queues_as_a_figure_wearing_its_hat", async () => {
    const all = place(town([
      house("alpha", [
        lead("waiter", needs(1)),
        lead("stuck-lead", needs(2, { needs: "stuck", reason: "rate limit" }), [
          char("q-sub", { ...needs(3), role: "Plan" }),
          char("s-sub", { ...needs(4, { needs: "stuck", reason: "loop" }), role: "implementer" }),
          char("w-sub", { role: "implementer" }),
        ]),
        lead("worker"),
      ]),
    ]));
    const pose = Object.fromEntries(all.flatMap((p) => (p.kind === "lead" || p.kind === "hat" ? [[p.id, p.pose]] : [])));
    expect(pose).toEqual({ waiter: "queue", "stuck-lead": "stuck", "q-sub": "queue", "s-sub": "stuck", "w-sub": "work", worker: "work" });
    expect(of(all, "hat").find((h) => h.id === "q-sub")!.hat).toBe(hatFor("Plan"));
  });

  test("the_queue_follows_the_urgency_order_so_swapping_it_swaps_the_spots", async () => {
    const t = town([house("alpha", [lead("old", needs(10))]), house("beta", [lead("new", needs(20))])]);
    const [first, second] = urgencyList(t);
    expect([first.id, second.id]).toEqual(["old", "new"]);
    const spot = (all: Placed[], id: string) => of(all, "lead").find((l) => l.id === id)!.at;
    const oldestFirst = layout(t, [first, second]);
    const newestFirst = layout(t, [second, first]);
    expect(spot(oldestFirst, "old")).toEqual(spot(newestFirst, "new"));
    expect(spot(oldestFirst, "new")).toEqual(spot(newestFirst, "old"));
    expect(spot(oldestFirst, "old")).not.toEqual(spot(oldestFirst, "new"));
  });

  test("an_open_parcel_is_placed_once_at_its_buildings_cwd_with_its_number", async () => {
    const all = place(town([house("alpha", [lead("a1")], [parcel(12), parcel(11)]), house("beta", [lead("b1")], [parcel(7)])]));
    expect(of(all, "parcel").map((p) => `${p.cwd}#${p.number}`).sort()).toEqual(["/work/alpha#11", "/work/alpha#12", "/work/beta#7"]);
  });

  test("the_lead_marked_steward_is_the_queen_wherever_its_folder_is_and_none_without_a_mark", async () => {
    const steward = house("elsewhere", [lead("st1", { name: "steward", kind: "background", shortId: "st1short", steward: true })]);
    expect(of(place(town([steward, house("alpha", [lead("a1")])])), "steward").map((s) => s.id)).toEqual(["st1"]);
    expect(of(place(town([house("alpha", [lead("a1")])])), "steward")).toEqual([]);
  });

  test("a_lead_in_the_default_steward_folder_or_named_by_a_review_is_no_queen_without_the_mark", async () => {
    const folder = house("steward", [lead("st1", { name: "steward", kind: "background", shortId: "s" })]);
    folder.cwd = "/home/me/.funtown/steward";
    const reviewed = house("alpha", [lead("a1")], [{ ...parcel(1), review: { state: "ready", steward: "a1", letter: "L" } }]);
    const ended = house("beta", [lead("b1")], [{ ...parcel(2), review: { state: "ready", steward: "ended-one", letter: "L" } }]);
    expect(of(place(town([folder, reviewed, ended])), "steward")).toEqual([]);
  });

  test("a_done_lead_gets_the_idle_pose_not_work", async () => {
    const all = place(town([house("alpha", [lead("finished", { stage: "done" }), lead("busy")])]));
    expect(Object.fromEntries(of(all, "lead").map((l) => [l.id, l.pose]))).toEqual({ finished: "idle", busy: "work" });
  });

  test("thirteen_or_more_seated_characters_stay_inside_their_own_lot", async () => {
    const crowded = house("alpha", Array.from({ length: 14 }, (_, i) => lead(`a${i}`)));
    // Eight houses make rows of five and three, so the third house of row one has a neighbour right of it and one below it.
    const others = ["a", "b", "c", "d", "e", "f", "g"].map((n) => house(n, [lead(`${n}1`)]));
    const all = place(town([...others.slice(0, 2), crowded, ...others.slice(2)]));
    const buildings = of(all, "building");
    const own = buildings.find((b) => b.cwd === crowded.cwd)!;
    const below = buildings.find((b) => b.at.x === own.at.x && b.at.z > own.at.z)!;
    const side = buildings.find((b) => b.at.z === own.at.z && b.at.x > own.at.x)!;
    const seated = of(all, "lead").filter((l) => l.cwd === crowded.cwd);
    expect(seated).toHaveLength(14);
    for (const l of seated) {
      expect(l.at.z - own.at.z).toBeLessThanOrEqual((below.at.z - own.at.z) / 2);
      expect(Math.abs(l.at.x - own.at.x)).toBeLessThanOrEqual((side.at.x - own.at.x) / 2);
    }
  });

  test("no_two_things_stand_on_one_spot_in_a_crowded_town", async () => {
    const crowd = (p: string, n: number) =>
      Array.from({ length: n }, (_, i) => lead(`${p}${i}`, i % 3 === 0 ? needs(i + 1) : {}, [
        char(`${p}${i}-h1`, { role: "implementer" }),
        char(`${p}${i}-h2`, { role: "implementer" }),
        char(`${p}${i}-h3`, { ...needs(100 + i), role: "Plan" }),
        char(`${p}${i}-h4`, { ...needs(200 + i, { needs: "stuck", reason: "x" }), role: "Plan" }),
      ]));
    const steward = house("steward", [lead("st1", { name: "steward", kind: "background", shortId: "s", steward: true })]);
    const all = place(town([
      house("alpha", crowd("a", 4), [parcel(1), parcel(2), parcel(3)]),
      house("beta", crowd("b", 3), [parcel(4)]),
      house("gamma", crowd("c", 1)),
      steward,
    ]));
    expect(all.length).toBeGreaterThan(40);
    const spots = all.map((p) => `${p.at.x.toFixed(3)},${p.at.z.toFixed(3)}`);
    expect(new Set(spots).size).toBe(spots.length);
  });

  test("the_same_state_gives_the_same_places_on_every_call", async () => {
    const make = () => town([
      house("alpha", [lead("a1", needs(5), [char("x1", { role: "Plan" }), char("x2", { ...needs(6), role: "Explore" })])], [parcel(3)]),
      house("beta", [lead("b1")]),
    ]);
    const t = make();
    expect(layout(t, urgencyList(t))).toEqual(layout(t, urgencyList(t)));
    const u = make();
    expect(layout(u, urgencyList(u))).toEqual(layout(t, urgencyList(t)));
  });
});
