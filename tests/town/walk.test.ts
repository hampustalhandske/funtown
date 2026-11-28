import { describe, expect, test } from "vitest";
import type { Character, House, Lead, Town } from "../../server/types.ts";
import { urgencyList } from "../../web/src/needs.tsx";
import { layout, type Placed } from "../../web/src/town/layout.ts";
import { HEAD_AT } from "../../web/src/town/court.ts";
import { castleLocal, HILL, onStair } from "../../web/src/town/hill.ts";
import { doorOf, facingOf } from "../../web/src/town/houses.ts";
import { groundHeight, landHeight, lotOf } from "../../web/src/town/island.ts";
import { linePlace } from "../../web/src/town/line.ts";
import { actOf, PROPS } from "../../web/src/town/acts.ts";
import { along, anyWalking, drawnFlag, gaitOf, routeLength, routeOf, stepOf, walkEnd, walksAfter, walkWords, type Walks } from "../../web/src/town/walk.ts";

/** Ground above this is dry: the sea is at 0 and the shore's sand rises just over it. */
const LAND = 0.05;
/** The door of the house on lot `i`. */
const doorOfLot = (i: number) => doorOf({ at: lotOf(i), facing: facingOf(i) });
/** Every point of `route` in strides of 0.1, as the walk draws it. */
function samples(route: ReturnType<typeof routeOf>) {
  const out = [];
  for (let d = 0; d <= routeLength(route); d += 0.1) out.push(along(route, d));
  out.push(along(route, routeLength(route)));
  return out;
}

describe("the route", () => {
  test("a_climb_starts_at_the_door_ends_at_the_place_and_goes_up_the_stair_by_its_right_half_only", () => {
    // Catches a climber who cuts across the left half, where the line stands, or one who starts off the lane.
    for (const i of [0, 1, 2, 3, 4, 6, 7, 11, 13, 20]) {
      const door = doorOfLot(i);
      const route = routeOf(door, HEAD_AT, door);
      expect(route[0], `lot ${i} starts at the door`).toEqual(door);
      expect(route[route.length - 1], `lot ${i} ends at the head's place`).toEqual(HEAD_AT);
      const onTreads = samples(route).filter((s) => onStair(s.x, s.z));
      expect(onTreads.length, `lot ${i} climbs`).toBeGreaterThan(40);
      for (const s of onTreads) expect(castleLocal(s.x, s.z)[0], `lot ${i} on the right half at (${s.x}, ${s.z})`).toBeGreaterThan(0.1);
    }
  });

  test("a_walk_stays_on_land_at_the_height_of_the_ground_under_it", () => {
    // Catches a route that crosses the cove or floats over the stair's steps.
    for (let i = 0; i < 40; i++) {
      const door = doorOfLot(i);
      for (const route of [routeOf(door, HEAD_AT, door), routeOf(HEAD_AT, door, door), routeOf(door, linePlace(4), door)]) {
        for (const s of samples(route)) {
          expect(landHeight(s.x, s.z), `lot ${i} on land at (${s.x}, ${s.z})`).toBeGreaterThan(LAND);
          expect(s.y).toBe(groundHeight(s.x, s.z));
        }
      }
    }
  });

  test("the_way_home_is_the_way_up_backwards_down_the_same_right_half", () => {
    // Catches a walker who goes home down the left half, through the line.
    const door = doorOfLot(3);
    const up = routeOf(door, HEAD_AT, door);
    const home = routeOf(HEAD_AT, door, door);
    expect(home).toEqual([...up].reverse());
  });

  test("a_climb_to_a_tread_of_the_line_climbs_the_right_half_then_steps_across_on_that_tread", () => {
    // Catches a climber who crosses to the left half at the stair's foot and walks up through the line.
    const door = doorOfLot(0);
    const place = linePlace(5);
    const route = routeOf(door, place, door);
    const across = route[route.length - 2];
    expect(samples(route).filter((s) => onStair(s.x, s.z)).length).toBeGreaterThan(20);
    const [u, w] = castleLocal(across.x, across.z);
    expect(u, "the last stop before the place is on the right half").toBeGreaterThan(0.1);
    expect(u).toBeLessThan(HILL.stair.width / 2);
    expect(w, "on the place's own tread").toBeCloseTo(castleLocal(place.x, place.z)[1], 6);
    for (const s of samples(route).slice(0, -1)) {
      const [su, sw] = castleLocal(s.x, s.z);
      if (onStair(s.x, s.z) && sw > w + 0.01) expect(su).toBeGreaterThan(0.1);
    }
  });

  test("a_walk_inside_the_castle_or_between_two_spots_by_a_house_goes_straight", () => {
    // Catches a line that shuffles up by walking back down to the village first.
    const a = linePlace(1);
    const b = linePlace(0);
    expect(routeOf(a, b, null)).toEqual([a, b]);
    const door = doorOfLot(0);
    const spot = { x: door.x + 1, z: door.z + 1 };
    expect(routeOf(door, spot, door)).toEqual([door, spot]);
  });
});

const NOW = 100 * 60_000;
const MIN = 60_000;
const char = (id: string, over: Partial<Character> = {}): Character => ({ id, name: id, stage: "working", activity: null, step: null, ...over });
const lead = (id: string, over: Partial<Lead> = {}): Lead => ({ ...char(id), cwd: "/work/app", tty: null, termProgram: null, kind: "terminal", shortId: null, subagents: [], ...over });
const house = (project: string, leads: Lead[]): House => ({ project, cwd: `/work/${project}`, leads, parcelsAt: NOW });
const town = (houses: House[]): Town => ({ houses, cards: [], started: 1, claude: { version: "2.1.325", problems: [] }, listedAt: NOW });
const asks = (minutesAgo: number): Partial<Character> => ({ stage: "needs_you", needs: "question", since: NOW - minutesAgo * MIN });
/** The town with one house per `[lead, minutes asking or null for working]`, laid out. */
const placeAll = (leads: [string, number | null][]): Placed[] => {
  const t = town(leads.map(([id, m], i) => house(`p${i}`, [lead(id, m === null ? {} : asks(m))])));
  return layout(t, urgencyList(t, NOW), NOW, false);
};
type Folk = Extract<Placed, { kind: "lead" | "hat" }>;
const folkOf = (all: Placed[], id: string) => all.find((p): p is Folk => (p.kind === "lead" || p.kind === "hat") && p.id === id)!;
/** The walks the change from `before` to `after` starts at `t`. */
const walks = (before: Placed[], after: Placed[], t = NOW, then: Walks = new Map()) => walksAfter(then, before, after, t);
const keyOf = (id: string) => `character:${id}`;

describe("the walks between two layouts", () => {
  test("a_lead_that_starts_asking_climbs_from_where_it_stood_to_its_place_in_the_line", () => {
    // Catches an ask that makes its character jump to the line, or one that walks off its own door.
    const before = placeAll([["a", null]]);
    const after = placeAll([["a", 5]]);
    const w = walks(before, after).get(keyOf("a"))!;
    expect(gaitOf(new Map([[keyOf("a"), w]]), keyOf("a"), NOW)).toBe("up");
    expect(w.route[0]).toEqual(folkOf(before, "a").at);
    expect(w.route[w.route.length - 1]).toEqual(folkOf(after, "a").at);
    expect(w.route.length, "by the door, the square and the stair").toBeGreaterThan(4);
  });

  test("a_character_that_appears_already_asking_stands_in_its_place_with_no_walk", () => {
    // Catches a page that opens on a town where everyone walks up from nowhere.
    expect(walks([], placeAll([["a", 5]])).size).toBe(0);
  });

  test("an_answered_character_walks_home_by_the_way_it_came_and_the_next_in_line_steps_up_straight", () => {
    // Catches a line that stays put after an answer, or one whose next head walks down to the village first.
    const before = placeAll([["a", 9], ["b", 5], ["c", 1]]);
    const after = placeAll([["a", null], ["b", 5], ["c", 1]]);
    const all = walks(before, after);
    expect(gaitOf(all, keyOf("a"), NOW)).toBe("home");
    expect(all.get(keyOf("a"))!.route[0]).toEqual(folkOf(before, "a").at);
    expect(all.get(keyOf("a"))!.route[all.get(keyOf("a"))!.route.length - 1]).toEqual(folkOf(after, "a").at);
    expect(gaitOf(all, keyOf("b"), NOW), "the second becomes the head").toBe("step");
    expect(all.get(keyOf("b"))!.route).toEqual([folkOf(before, "b").at, folkOf(after, "b").at]);
    expect(folkOf(after, "b").line!.place).toBe(0);
    expect(gaitOf(all, keyOf("c"), NOW)).toBe("step");
  });

  test("a_walk_ends_when_the_route_is_walked_at_the_walking_speed_and_then_nothing_walks", () => {
    // Catches a walk that never ends, which would keep the town drawing at its fastest.
    const w = walks(placeAll([["a", null]]), placeAll([["a", 5]]));
    const walk = w.get(keyOf("a"))!;
    expect(anyWalking(w, NOW)).toBe(true);
    expect(walkEnd(walk) - NOW).toBeCloseTo((routeLength(walk.route) / 2.4) * 1000, 3);
    expect(anyWalking(w, walkEnd(walk) - 1)).toBe(true);
    expect(anyWalking(w, walkEnd(walk))).toBe(false);
    expect(anyWalking(new Map(), NOW)).toBe(false);
  });

  test("a_climber_whose_place_moves_on_keeps_climbing_from_where_it_is_now", () => {
    // Catches a climber who jumps back to its start, or turns round, when the line shifts under it.
    const before = placeAll([["a", null]]);
    const first = walks(before, placeAll([["a", 5]]));
    const walk = first.get(keyOf("a"))!;
    const t = NOW + 4000;
    const here = stepOf(walk, t);
    // Someone older now asks too: `a` is second in the line.
    const second = placeAll([["a", 5], ["b", 9]].map(([id, m]) => [id, m] as [string, number]));
    const again = walks(placeAll([["a", 5]]), second, t, first);
    const moved = again.get(keyOf("a"))!;
    expect(gaitOf(again, keyOf("a"), t), "still arriving, not yet in the line").toBe("up");
    expect(moved.route[0]).toEqual({ x: here.x, z: here.z });
    expect(moved.route[moved.route.length - 1]).toEqual(folkOf(second, "a").at);
  });

  test("a_walk_that_is_still_on_its_way_is_left_alone_when_nothing_about_its_place_changed", () => {
    // Catches a walk restarted by every state frame, which would stall a character at its door.
    const after = placeAll([["a", 5]]);
    const first = walks(placeAll([["a", null]]), after);
    const again = walks(after, placeAll([["a", 5]]), NOW + 3000, first);
    expect(again.get(keyOf("a"))).toBe(first.get(keyOf("a")));
  });
});

describe("what a walker shows", () => {
  const head = { pose: "wait" as const, animal: "cat" as const, line: { place: 0, posture: "stand" as const, flag: "wave" as const } };

  test("the_head_that_is_still_climbing_holds_its_flag_up_and_still_and_waves_only_once_it_is_at_the_table", () => {
    // Catches a loud flag that waves all the way up the stair.
    expect(drawnFlag(head, "up")).toBe("still");
    expect(actOf(head, "up")).toBe("wait");
    expect(drawnFlag(head, undefined)).toBe("wave");
    expect(actOf(head, undefined)).toBe("wave");
  });

  test("the_next_head_waves_while_it_steps_up_to_the_table", () => {
    // Catches a handover where the loud thing goes quiet until the step is done.
    expect(drawnFlag(head, "step")).toBe("wave");
    expect(actOf(head, "step")).toBe("wave");
  });

  test("an_answered_character_walks_home_with_its_flag_furled_and_nothing_in_its_hands", () => {
    // Catches an answered character that still carries its slip or flies its flag unfurled.
    const home = { pose: "work" as const, animal: "cat" as const };
    expect(drawnFlag(home, "home")).toBe("furled");
    expect(actOf(home, "home")).toBe("home");
    expect(PROPS.home).toEqual([]);
    expect(drawnFlag(home, undefined)).toBeNull();
  });

  test("a_waiter_that_is_not_the_head_holds_its_flag_still_as_the_layout_says", () => {
    expect(drawnFlag({ ...head, line: { place: 2, posture: "tap", flag: "still" } }, undefined)).toBe("still");
  });

  test("the_hidden_list_words_say_up_or_home_while_a_character_walks", () => {
    // Catches a list that says nothing about who is on the stair.
    expect(walkWords("up")).toBe("walking up");
    expect(walkWords("home")).toBe("walking home");
    expect(walkWords("step")).toBeNull();
    expect(walkWords(undefined)).toBeNull();
  });
});
