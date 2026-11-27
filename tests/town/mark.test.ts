import { describe, expect, test } from "vitest";
import { nextHouse, type Direction, type Door, type Move } from "../../web/src/town/mark.ts";

/** Doors on the screen (x right, y down, the screen's middle at 0,0), named by one letter each. */
const doors = (spots: Record<string, [number, number]>): Door[] => Object.entries(spots).map(([cwd, [x, y]]) => ({ cwd: `/work/${cwd}`, x, y }));
const at = (letter: string) => `/work/${letter}`;
const go = (points: Door[], from: string | null, direction: Direction, lastMove: Move | null = null) =>
  nextHouse(points, from === null ? null : at(from), direction, lastMove);

describe("nextHouse", () => {
  test("a_straight_row_walks_one_house_a_press_and_stops_at_its_ends", () => {
    const row = doors({ A: [-200, 0], B: [0, 0], C: [200, 0] });
    expect(go(row, "A", "right")).toBe(at("B"));
    expect(go(row, "B", "right")).toBe(at("C"));
    expect(go(row, "C", "left")).toBe(at("B"));
    // No wrap: the end of the row keeps the mark.
    expect(go(row, "C", "right")).toBe(at("C"));
    expect(go(row, "A", "left")).toBe(at("A"));
  });

  test("a_staggered_row_prefers_the_house_more_in_line_over_a_nearer_one_off_to_the_side", () => {
    // From A, right: B is 100 ahead but 90 off the line (score 280); C is 200 ahead on the line (score 200).
    const spots = doors({ A: [0, 0], B: [100, 90], C: [200, 0] });
    expect(go(spots, "A", "right")).toBe(at("C"));
  });

  test("a_cove_gives_the_nearest_house_in_the_cone_not_the_ones_further_along", () => {
    // From B, right: C is 160 ahead; E (380) and F (420) are further along the same way.
    const cove = doors({ A: [-140, 0], B: [0, 0], C: [160, 0], D: [-140, 160], E: [380, 40], F: [420, -60] });
    expect(go(cove, "B", "right")).toBe(at("C"));
    expect(go(cove, "C", "right")).toBe(at("E"));
    expect(go(cove, "B", "down")).toBe(at("D"));
  });

  test("a_house_more_than_twice_as_far_to_the_side_as_ahead_is_not_a_candidate", () => {
    // Right of A, but 250 sideways against 100 forward: nothing is ahead.
    const spots = doors({ A: [0, 0], B: [100, 250] });
    expect(go(spots, "A", "right")).toBe(at("A"));
    // Exactly twice is still a candidate.
    expect(go(doors({ A: [0, 0], B: [100, 200] }), "A", "right")).toBe(at("B"));
  });

  test("nothing_to_one_side_keeps_the_mark_and_a_house_behind_is_never_chosen", () => {
    const spots = doors({ A: [0, 0], B: [200, 0] });
    expect(go(spots, "A", "left")).toBe(at("A"));
    expect(go(spots, "A", "up")).toBe(at("A"));
    expect(go(spots, "A", "down")).toBe(at("A"));
  });

  test("up_and_down_follow_the_screen_so_a_house_lower_on_screen_is_down", () => {
    const spots = doors({ A: [0, -150], B: [30, 0], C: [0, 150] });
    expect(go(spots, "B", "up")).toBe(at("A"));
    expect(go(spots, "B", "down")).toBe(at("C"));
  });

  test("back_the_way_you_came_returns_to_the_house_you_came_from_over_a_nearer_one", () => {
    // From B, left: D (100 ahead, 60 across, score 220) beats A (300 ahead, score 300), unless the last move was A to B by right.
    const spots = doors({ A: [-300, 0], B: [0, 0], D: [-100, 60] });
    expect(go(spots, "B", "left")).toBe(at("D"));
    expect(go(spots, "B", "left", { from: at("A"), to: at("B"), direction: "right" })).toBe(at("A"));
    // A move that ended elsewhere, or by another arrow, is no way back.
    expect(go(spots, "B", "left", { from: at("A"), to: at("D"), direction: "right" })).toBe(at("D"));
    expect(go(spots, "B", "left", { from: at("A"), to: at("B"), direction: "down" })).toBe(at("D"));
  });

  test("the_way_back_is_not_taken_when_the_house_you_came_from_is_gone_or_the_mark_was_put_not_walked", () => {
    const spots = doors({ B: [0, 0], D: [-100, 60] });
    expect(go(spots, "B", "left", { from: at("A"), to: at("B"), direction: "right" })).toBe(at("D"));
    expect(go(spots, "B", "left", { to: at("B") })).toBe(at("D"));
  });

  test("ties_go_to_the_nearer_house_then_to_the_folder_name", () => {
    // Both score 140 (B: 100 ahead and 20 across; C: 140 ahead): the shorter straight line, B, wins.
    const near = doors({ A: [0, 0], B: [100, 20], C: [140, 0] });
    expect(go(near, "A", "right")).toBe(at("B"));
    // Same score and distance: the name, however the points are ordered.
    const mirrored = doors({ A: [0, 0], Z: [100, 50], M: [100, -50] });
    expect(go(mirrored, "A", "right")).toBe(at("M"));
    expect(go([...mirrored].reverse(), "A", "right")).toBe(at("M"));
  });

  test("the_first_press_marks_the_house_nearest_the_screens_middle_whatever_the_arrow", () => {
    const spots = doors({ A: [-300, 20], B: [80, -40], C: [200, 100] });
    for (const direction of ["left", "right", "up", "down"] as const) expect(go(spots, null, direction)).toBe(at("B"));
  });

  test("the_first_press_marks_the_last_marked_house_if_the_town_still_has_it", () => {
    const spots = doors({ A: [-300, 20], B: [80, -40], C: [200, 100] });
    expect(go(spots, null, "left", { to: at("C") })).toBe(at("C"));
    // Gone: the one nearest the middle.
    expect(go(spots, null, "left", { to: at("X") })).toBe(at("B"));
  });

  test("a_mark_on_a_house_that_is_gone_is_no_mark_and_an_empty_town_marks_nothing", () => {
    const spots = doors({ A: [-300, 20], B: [80, -40] });
    expect(go(spots, "X", "right")).toBe(at("B"));
    expect(go([], null, "right")).toBeNull();
    expect(go([], "A", "right")).toBeNull();
  });
});
