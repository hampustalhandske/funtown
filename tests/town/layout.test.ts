import { describe, expect, test } from "vitest";
import type { Character, House, Lead, Parcel, Town } from "../../server/types.ts";
import { characterEntries, urgencyList } from "../../web/src/needs.tsx";
import { layout } from "../../web/src/town/layout.ts";
import { colourFor, hatFor } from "../../web/src/town/kit/palette.ts";
import { onHill, onPlateau, onStair } from "../../web/src/town/hill.ts";
import { landHeight, SQUARE } from "../../web/src/town/island.ts";
import { doorOf } from "../../web/src/town/houses.ts";

const char = (id: string, over: Partial<Character> = {}): Character => ({ id, name: id, stage: "working", activity: null, step: null, ...over });
const lead = (id: string, over: Partial<Lead> = {}, subagents: Character[] = []): Lead => ({
  ...char(id), cwd: "/work/app", tty: null, termProgram: null, kind: "terminal", shortId: null, subagents, ...over,
});
const house = (project: string, leads: Lead[], parcels?: Parcel[]): House => ({ project, cwd: `/work/${project}`, leads, parcels });
const parcel = (number: number): Parcel => ({ number, title: `PR ${number}`, url: `https://example.test/${number}`, draft: false, checks: "none" });
const town = (houses: House[]): Town => ({ houses, cards: [], started: 1, claude: { version: "2.1.325", problems: [] } });
const needs = (since: number, over: Partial<Character> = {}): Partial<Character> => ({ stage: "needs_you", needs: "permission", since, ...over });

const place = (t: Town) => layout(t, urgencyList(t, 1_000_000), 1_000_000, false);
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

  test("a_working_subagent_is_its_roles_animal_in_its_hat_and_clothes_at_its_leads_house", async () => {
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
    const byId = Object.fromEntries(hats.map((h) => [h.id, [h.animal, h.hat, h.clothes]]));
    expect(byId).toEqual({
      x0: ["beaver", "hardhat", ["toolbelt"]], x1: ["hare", "wizard", []], x2: ["owl", "tophat", []], x3: ["beaver", "cap", []], untyped: ["beaver", "cap", []],
    });
    expect(of(all, "lead").map((l) => [l.animal, l.hat, l.clothes])).toEqual([["cat", "captain", ["scarf", "apron"]]]);
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

  test("needs_you_waits_and_stuck_sits_and_a_waiting_subagent_wears_its_hat", async () => {
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
    expect(pose).toEqual({ waiter: "wait", "stuck-lead": "stuck", "q-sub": "wait", "s-sub": "stuck", "w-sub": "work", worker: "work" });
    expect(of(all, "hat").find((h) => h.id === "q-sub")!.hat).toBe(hatFor("Plan"));
  });

  test("the_queue_follows_the_urgency_order_so_swapping_it_swaps_the_spots", async () => {
    const t = town([house("alpha", [lead("old", needs(10))]), house("beta", [lead("new", needs(20))])]);
    const [first, second] = characterEntries(urgencyList(t, 1_000_000));
    expect([first.id, second.id]).toEqual(["old", "new"]);
    const spot = (all: Placed[], id: string) => of(all, "lead").find((l) => l.id === id)!.at;
    const oldestFirst = layout(t, [first, second], 1_000_000, false);
    const newestFirst = layout(t, [second, first], 1_000_000, false);
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
    expect(of(place(town([steward, house("alpha", [lead("a1")])])), "queen").map((s) => s.id)).toEqual(["st1"]);
    expect(of(place(town([house("alpha", [lead("a1")])])), "queen").map((s) => s.id)).toEqual([null]);
  });

  test("a_lead_in_the_default_steward_folder_or_named_by_a_review_is_no_queen_without_the_mark", async () => {
    const folder = house("steward", [lead("st1", { name: "steward", kind: "background", shortId: "s" })]);
    folder.cwd = "/home/me/.funtown/steward";
    const reviewed = house("alpha", [lead("a1")], [{ ...parcel(1), review: { state: "ready", steward: "a1", letter: "L" } }]);
    const ended = house("beta", [lead("b1")], [{ ...parcel(2), review: { state: "ready", steward: "ended-one", letter: "L" } }]);
    expect(of(place(town([folder, reviewed, ended])), "queen").map((s) => s.id)).toEqual([null]);
  });

  test("a_done_lead_stands_and_a_lead_whose_turn_ended_rests_neither_works", async () => {
    const all = place(town([house("alpha", [lead("finished", { stage: "done" }), lead("ended", needs(3, { needs: "turn ended" })), lead("busy")])]));
    expect(Object.fromEntries(of(all, "lead").map((l) => [l.id, l.pose]))).toEqual({ finished: "stand", ended: "rest", busy: "work" });
  });

  test("at_every_house_whichever_way_it_faces_the_stuck_sit_on_its_doorstep_a_resting_lead_stands_by_its_door_and_workers_work_out_front_facing_out", async () => {
    // Six houses, so the lots that face east (4 and 5) are among them, and "its own" door is told apart from the others'.
    const all = place(town(Array.from({ length: 6 }, (_, i) => house(`p${i}`, [
      lead(`stuck${i}`, needs(2, { needs: "stuck", reason: "loop" }), [char(`stuck-sub${i}`, { ...needs(4, { needs: "stuck", reason: "x" }), role: "implementer" })]),
      lead(`rest${i}`, needs(3, { needs: "turn ended" }), [char(`w${i}a`, { role: "implementer" }), char(`w${i}b`, { role: "explorer" })]),
      lead(`work${i}`),
    ], [parcel(i + 1)]))));
    const folk = [...of(all, "lead"), ...of(all, "hat")];
    const parcels = of(all, "parcel");
    for (const b of of(all, "building")) {
      const door = doorOf(b);
      // How far in front of the house's middle a spot is, along the way it faces; its front wall is under 1 out.
      const out = (p: { x: number; z: number }) => (p.x - b.at.x) * Math.sin(b.facing) + (p.z - b.at.z) * Math.cos(b.facing);
      const mine = folk.filter((f) => f.cwd === b.cwd);
      for (const f of mine) expect(f.facing, `${f.id} faces out from its house`).toBeCloseTo(b.facing);
      for (const f of mine.filter((f) => f.pose === "stuck")) expect(dist(f.at, door), `${f.id} on its own doorstep`).toBeLessThan(0.9);
      for (const f of mine.filter((f) => f.pose === "rest")) expect(dist(f.at, door), `${f.id} by its door`).toBeLessThan(1);
      for (const f of mine.filter((f) => f.pose === "work")) {
        expect(dist(f.at, door), `${f.id} works clear of the door`).toBeGreaterThan(1.3);
        expect(out(f.at), `${f.id} works out in front`).toBeGreaterThan(1.8);
      }
      for (const p of parcels.filter((p) => p.cwd === b.cwd)) expect(out(p.at), `parcel ${p.number} outside the front wall`).toBeGreaterThan(1.1);
      expect(mine.map((f) => f.pose).sort()).toEqual(["rest", "stuck", "stuck", "work", "work", "work"]);
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
    expect(layout(t, urgencyList(t, 1_000_000), 1_000_000, false)).toEqual(layout(t, urgencyList(t, 1_000_000), 1_000_000, false));
    const u = make();
    expect(layout(u, urgencyList(u, 1_000_000), 1_000_000, false)).toEqual(layout(t, urgencyList(t, 1_000_000), 1_000_000, false));
  });

  test("every_house_of_a_big_town_stands_on_its_own_lot_on_land_off_the_stair_the_square_and_the_castle_hill", async () => {
    // Sixty houses: past the island's first twelve lots, past its last named lot and into the fallback rows.
    const houses = Array.from({ length: 60 }, (_, i) => house(`p${i}`, [lead(`l${i}`)]));
    const buildings = of(place(town(houses)), "building");
    expect(buildings.map((b) => b.cwd)).toEqual(houses.map((h) => h.cwd));
    const spots = buildings.map((b) => b.at);
    for (const [i, { x, z }] of spots.entries()) {
      expect(landHeight(x, z), `house ${i} on land`).toBeGreaterThan(0.2);
      expect(onStair(x, z) || onHill(x, z), `house ${i} off the stair and the hill`).toBe(false);
      expect(Math.hypot(x - SQUARE.x, z - SQUARE.z), `house ${i} off the square`).toBeGreaterThan(SQUARE.radius + 1);
      for (const other of spots.slice(0, i)) expect(dist(other, { x, z }), `house ${i} clear of the houses before it`).toBeGreaterThan(1.2);
    }
  });

  test("a_house_keeps_its_lot_by_its_place_in_house_order_whatever_its_name_or_the_houses_after_it", async () => {
    const named = (names: string[]) => of(place(town(names.map((n) => house(n, [lead(`${n}-lead`)])))), "building").map((b) => b.at);
    const first = named(Array.from({ length: 30 }, (_, i) => `a${i}`));
    expect(named(Array.from({ length: 31 }, (_, i) => `b${i}`)).slice(0, 30)).toEqual(first);
    // The first house of any town stands on the island's first lot, on the slope above the quay.
    expect(first[0]).toEqual({ x: -1, z: 4.2 });
  });

  test("a_dozen_characters_asking_for_you_wait_up_on_the_castles_forecourt", async () => {
    const askers = Array.from({ length: 12 }, (_, i) => lead(`w${i}`, needs(i + 1)));
    const all = place(town([house("alpha", askers.slice(0, 6)), house("beta", askers.slice(6))]));
    const waiting = of(all, "lead");
    expect(waiting.map((l) => l.pose)).toEqual(Array(12).fill("wait"));
    for (const l of waiting) expect(onPlateau(l.at.x, l.at.z), l.id).toBe(true);
  });
});
