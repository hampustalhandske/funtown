import { describe, expect, test } from "vitest";
import type { Character, House, Lead, Town } from "../../server/types.ts";
import { layout } from "../../web/src/town/layout.ts";
import { doorOf, facingOf, VARIANTS, variantOf } from "../../web/src/town/houses.ts";
import { onPlateau, onStair } from "../../web/src/town/hill.ts";
import { groundHeight, lotOf, SQUARE } from "../../web/src/town/island.ts";
import { treesFor } from "../../web/src/town/village.ts";

const char = (id: string, over: Partial<Character> = {}): Character => ({ id, name: id, stage: "working", activity: null, step: null, ...over });
const lead = (id: string, over: Partial<Lead> = {}, subagents: Character[] = []): Lead => ({
  ...char(id), cwd: "/work/app", tty: null, termProgram: null, kind: "terminal", shortId: null, subagents, ...over,
});
const house = (project: string, leads: Lead[], added = false): House => ({ project, cwd: `/work/${project}`, leads, added });
const town = (houses: House[]): Town => ({ houses, cards: [], started: 1, claude: { version: "2.1.325", problems: [] } });
const resting = (id: string, subagents: Character[] = []) => lead(id, { stage: "needs_you", needs: "turn ended", since: 1 }, subagents);

const buildings = (t: Town, marked: string | null = null) =>
  layout(t, [], 1_000_000, false, marked).flatMap((p) => (p.kind === "building" ? [p] : []));
const byCwd = (t: Town, marked: string | null = null) => Object.fromEntries(buildings(t, marked).map((b) => [b.cwd, b]));

describe("a house's chimney", () => {
  test("puffs_while_a_lead_or_a_subagent_of_the_house_works_and_not_while_all_of_them_rest", () => {
    const all = byCwd(town([
      house("lead-works", [lead("a")]),
      house("sub-works", [resting("b", [char("b1")])]),
      house("all-rest", [resting("c", [char("c1", { stage: "done" })])]),
      house("done", [lead("d", { stage: "done" })]),
      house("nobody", []),
    ]));
    expect(Object.fromEntries(Object.entries(all).map(([cwd, b]) => [cwd.split("/").pop(), b.busy]))).toEqual({
      "lead-works": true, "sub-works": true, "all-rest": false, done: false, nobody: false,
    });
  });

  test("the_stewards_work_at_the_castle_does_not_make_its_own_folder_busy", () => {
    const folder = house("steward-folder", [lead("st", { steward: true, kind: "background", shortId: "s" })], true);
    expect(byCwd(town([folder]))["/work/steward-folder"].busy).toBe(false);
  });
});

describe("the marked house", () => {
  test("only_the_house_whose_folder_is_marked_carries_the_mark", () => {
    const t = town([house("alpha", []), house("beta", []), house("gamma", [])]);
    expect(Object.values(byCwd(t, "/work/beta")).map((b) => [b.cwd, b.marked])).toEqual([["/work/alpha", false], ["/work/beta", true], ["/work/gamma", false]]);
    expect(buildings(t).every((b) => !b.marked)).toBe(true);
  });
});

describe("where a house stands", () => {
  // The two shores houses look toward: the cove's middle, and the west lobe's inner shore.
  const HARBOURS = [[4.6, 11], [-14, 6]];
  const toward = (from: { x: number; z: number }, [x, z]: number[]) => Math.atan2(x - from.x, z - from.z);
  const gap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

  test("every_house_on_the_first_lots_and_the_fallback_rows_looks_toward_its_harbour", () => {
    for (let i = 0; i < 45; i++) {
      const lot = lotOf(i);
      const nearest = [...HARBOURS].sort((a, b) => Math.hypot(a[0] - lot.x, a[1] - lot.z) - Math.hypot(b[0] - lot.x, b[1] - lot.z))[0];
      expect(gap(facingOf(i), toward(lot, nearest)), `house ${i}`).toBeLessThan(0.7);
    }
  });

  test("the_houses_never_stand_in_a_grid_each_has_its_own_small_turn", () => {
    const turns = new Set(Array.from({ length: 25 }, (_, i) => facingOf(i).toFixed(3)));
    expect(turns.size).toBeGreaterThanOrEqual(20);
  });

  test("the_door_is_on_the_front_wall_a_step_out_from_the_house_in_the_direction_it_faces", () => {
    for (let i = 0; i < 25; i++) {
      const at = lotOf(i);
      const facing = facingOf(i);
      const door = doorOf({ at, facing });
      const [dx, dz] = [door.x - at.x, door.z - at.z];
      expect(Math.hypot(dx, dz)).toBeGreaterThan(1.1);
      expect(Math.hypot(dx, dz)).toBeLessThan(1.7);
      expect(dx * Math.sin(facing) + dz * Math.cos(facing)).toBeGreaterThan(1.2);
    }
  });

  test("a_building_carries_the_facing_of_its_lot_and_the_house_keeps_its_variant_when_another_goes", () => {
    const first = byCwd(town([house("alpha", []), house("beta", []), house("gamma", [])]));
    const after = byCwd(town([house("beta", []), house("gamma", [])]));
    expect(first["/work/beta"].facing).toBe(facingOf(1));
    expect(after["/work/beta"].facing).toBe(facingOf(0));
    expect(after["/work/beta"].variant).toBe(first["/work/beta"].variant);
  });

  test("the_five_variants_all_turn_up_among_projects_and_one_folder_always_gives_the_same", () => {
    const names = Array.from({ length: 40 }, (_, i) => `/work/proj-${i}`);
    expect(new Set(names.map(variantOf))).toEqual(new Set(VARIANTS));
    expect(variantOf("/work/proj-3")).toBe(variantOf("/work/proj-3"));
  });
});

describe("the trees", () => {
  const lots = Array.from({ length: 60 }, (_, i) => lotOf(i));
  const doors = lots.map((at, i) => doorOf({ at, facing: facingOf(i) }));
  const trees = treesFor(lots, doors);
  const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

  test("there_are_groves_and_they_stand_on_hills_only", () => {
    expect(trees.length).toBeGreaterThan(20);
    for (const t of trees) expect(groundHeight(t.x, t.z), `(${t.x}, ${t.z})`).toBeGreaterThanOrEqual(0.8);
  });

  test("no_tree_stands_within_3_units_of_a_house_a_door_or_the_square", () => {
    for (const t of trees) {
      for (const lot of lots) expect(dist(t, lot)).toBeGreaterThanOrEqual(3);
      for (const door of doors) expect(dist(t, door)).toBeGreaterThanOrEqual(3);
      expect(dist(t, SQUARE)).toBeGreaterThanOrEqual(SQUARE.radius + 3);
    }
  });

  test("no_tree_stands_on_the_stair_or_the_forecourt", () => {
    for (const t of trees) {
      expect(onStair(t.x, t.z)).toBe(false);
      expect(onPlateau(t.x, t.z)).toBe(false);
    }
  });

  test("a_house_on_a_grove_takes_only_the_trees_near_it_and_the_rest_stay_where_they_were", () => {
    const hill = { x: -9.4, z: -9.4 };
    const without = treesFor(lots.slice(0, 5), doors.slice(0, 5));
    const withHouse = treesFor([...lots.slice(0, 5), hill], [...doors.slice(0, 5), doorOf({ at: hill, facing: 0 })]);
    expect(withHouse.length).toBeLessThan(without.length);
    expect(withHouse.every((t) => without.some((u) => u.x === t.x && u.z === t.z))).toBe(true);
  });
});
