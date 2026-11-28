import { describe, expect, test } from "vitest";
import type { Character, House, Lead, Parcel, Town } from "../../server/types.ts";
import { urgencyList } from "../../web/src/needs.tsx";
import { PILE_AT, PILE_DROP, pileSpot } from "../../web/src/town/court.ts";
import { onPlateau } from "../../web/src/town/hill.ts";
import { doorOf } from "../../web/src/town/houses.ts";
import { layout } from "../../web/src/town/layout.ts";
import { colourFor } from "../../web/src/town/kit/palette.ts";
import { actOf, pose, PROPS, restPosture } from "../../web/src/town/acts.ts";
import { QUEEN_TEAL, type Prop } from "../../web/src/town/folk-dress.ts";
import { costumeOf } from "../../web/src/town/folk.ts";
import { rigOf } from "../../web/src/town/rig.ts";
import { along, carrying, drawnFlag, gaitOf, nextChange, routeLength, stepOf, walkEnd, walksAfter, walkWords, type Walks } from "../../web/src/town/walk.ts";

const NOW = 100 * 60_000;
const char = (id: string, over: Partial<Character> = {}): Character => ({ id, name: id, stage: "working", activity: null, step: null, ...over });
const lead = (id: string, over: Partial<Lead> = {}): Lead => ({ ...char(id), cwd: "/work/app", tty: null, termProgram: null, kind: "terminal", shortId: null, subagents: [], ...over });
const pr = (number: number, over: Partial<Parcel> = {}): Parcel => ({ number, title: `PR ${number}`, url: `https://example.test/${number}`, draft: false, checks: "green", ...over });
const house = (project: string, leads: Lead[], parcels: Parcel[]): House => ({ project, cwd: `/work/${project}`, leads, parcels, parcelsAt: NOW });
const town = (houses: House[]): Town => ({ houses, cards: [], started: 1, claude: { version: "2.1.325", problems: [] }, listedAt: NOW });
const place = (t: Town) => layout(t, urgencyList(t, NOW), NOW, false);
type Placed = ReturnType<typeof place>[number];
type Box = Extract<Placed, { kind: "parcel" }>;
const boxes = (t: Town): Box[] => place(t).filter((p): p is Box => p.kind === "parcel");
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
/** A town of one house holding `parcels`, its lead working. */
const one = (parcels: Parcel[]) => town([house("alpha", [lead("a1")], parcels)]);

describe("the pile and the doorstep", () => {
  test("green_and_no_check_parcels_lie_on_the_pile_and_running_and_red_ones_stay_at_the_door", () => {
    // Catches finished work left in the village, or unfinished work carried up to the Queen.
    const t = one([pr(1), pr(2, { checks: "none" }), pr(3, { checks: "running" }), pr(4, { checks: "red", redAt: 1 })]);
    const by = Object.fromEntries(boxes(t).map((b) => [b.number, b]));
    expect([1, 2].map((n) => by[n].place)).toEqual(["pile", "pile"]);
    expect([3, 4].map((n) => by[n].place)).toEqual(["doorstep", "doorstep"]);
    const door = doorOf(place(t).find((p) => p.kind === "building")! as never);
    for (const n of [1, 2]) {
      expect(onPlateau(by[n].at.x, by[n].at.z), `#${n} up at the castle`).toBe(true);
      expect(dist(by[n].at, PILE_AT), `#${n} by the Queen's seat`).toBeLessThan(1.5);
    }
    for (const n of [3, 4]) expect(dist(by[n].at, door), `#${n} at its house's door`).toBeLessThan(2.5);
  });

  test("a_parcel_wears_its_projects_colour_and_a_draft_is_judged_by_its_checks_like_any_other", () => {
    const [a, b] = boxes(town([house("alpha", [lead("a1")], [pr(1)]), house("beta", [lead("b1")], [pr(2, { draft: true })])]));
    expect([a.colour, b.colour]).toEqual([colourFor("alpha"), colourFor("beta")]);
    expect(b.place).toBe("pile");
  });

  test("a_parcel_goes_back_to_its_door_when_its_checks_run_again", () => {
    // Catches a pile that keeps a parcel whose new push is still being checked.
    expect(boxes(one([pr(1, { checks: "running" })]))[0].place).toBe("doorstep");
    expect(boxes(one([pr(1)]))[0].place).toBe("pile");
  });

  test("the_parcels_of_every_house_share_one_pile_each_in_a_place_of_its_own", () => {
    const t = town([house("alpha", [lead("a1")], [pr(1), pr(2)]), house("beta", [lead("b1")], [pr(1)]), house("gamma", [lead("c1")], [pr(7)])]);
    const all = boxes(t);
    expect(all.map((b) => `${b.cwd}#${b.number}`)).toEqual(["/work/alpha#1", "/work/alpha#2", "/work/beta#1", "/work/gamma#7"]);
    expect(all.every((b) => b.place === "pile")).toBe(true);
    const spots = new Set(all.map((b) => `${b.at.x.toFixed(3)},${b.at.z.toFixed(3)},${b.lift.toFixed(3)}`));
    expect(spots.size).toBe(4);
  });

  test("doorstep_parcels_of_a_house_sit_apart_and_never_on_the_pile_spots", () => {
    const all = boxes(one([pr(1, { checks: "running" }), pr(2, { checks: "red", redAt: 1 }), pr(3, { checks: "running" }), pr(4, { checks: "running" })]));
    expect(new Set(all.map((b) => `${b.at.x.toFixed(2)},${b.at.z.toFixed(2)}`)).size).toBe(4);
    for (const b of all) expect(b.lift).toBe(0);
  });
});

describe("stacking", () => {
  test("one_or_two_parcels_lie_flat_and_from_three_on_the_next_lies_on_the_first", () => {
    // Catches a pile that stacks too early, or one that spreads over the forecourt.
    const flat = (n: number) => boxes(one(Array.from({ length: n }, (_, i) => pr(i + 1)))).map((b) => b.lift);
    expect(flat(1)).toEqual([0]);
    expect(flat(2)).toEqual([0, 0]);
    const three = boxes(one([pr(1), pr(2), pr(3)]));
    expect(three[2].lift).toBeGreaterThan(0.2);
    expect(three[2].at).toEqual(three[0].at);
  });

  test("a_parcels_place_does_not_move_when_more_come_so_only_the_new_one_appears", () => {
    // Catches a pile that reshuffles all its parcels each time one more is laid.
    const five = boxes(one([1, 2, 3, 4, 5].map((n) => pr(n))));
    for (const n of [1, 2, 3, 4]) {
      const fewer = boxes(one([1, 2, 3, 4, 5].slice(0, n).map((k) => pr(k))));
      fewer.forEach((b, i) => {
        expect(b.at).toEqual(five[i].at);
        expect(b.lift).toBe(five[i].lift);
      });
    }
  });

  test("five_parcels_make_a_pile_of_two_columns_three_high_with_no_two_in_one_place", () => {
    const five = boxes(one([1, 2, 3, 4, 5].map((n) => pr(n))));
    expect(five.map((b) => b.lift > 0 ? 1 : 0)).toEqual([0, 0, 1, 1, 1]);
    expect(Math.max(...five.map((b) => b.lift))).toBeGreaterThan(five[2].lift);
    expect(new Set(five.map((b) => `${b.at.x},${b.at.z},${b.lift}`)).size).toBe(5);
    for (const b of five) expect(dist(b.at, PILE_AT)).toBeLessThan(1.5);
  });

  test("the_pile_spot_of_each_place_is_on_the_forecourt_and_the_carrier_stops_before_it_on_the_forecourt_too", () => {
    for (let k = 0; k < 12; k++) expect(onPlateau(pileSpot(k).x, pileSpot(k).z)).toBe(true);
    expect(onPlateau(PILE_DROP.x, PILE_DROP.z)).toBe(true);
    expect(dist(PILE_DROP, PILE_AT)).toBeGreaterThan(0.8);
    expect(dist(PILE_DROP, PILE_AT)).toBeLessThan(2);
  });
});

describe("the Queen's note", () => {
  test("only_a_parcel_whose_review_is_ready_carries_her_note", () => {
    const states = ["idle", "queued", "reviewing", "ready"] as const;
    const t = one(states.map((state, i) => pr(i + 1, { review: { state } })).concat(pr(9)));
    expect(boxes(t).map((b) => b.note)).toEqual([false, false, false, true, false]);
  });
});

describe("who carries", () => {
  const carrier = (leads: Lead[], parcels: Parcel[] = [pr(1)]) => boxes(town([house("alpha", leads, parcels)]))[0].carrier;

  test("a_working_resting_or_done_first_lead_carries_its_houses_parcel", () => {
    expect(carrier([lead("a1")])).toBe("character:a1");
    expect(carrier([lead("a1", { stage: "needs_you", needs: "turn ended", since: 1 })])).toBe("character:a1");
    expect(carrier([lead("a1", { stage: "done" })])).toBe("character:a1");
  });

  test("a_first_lead_in_the_line_or_stuck_carries_nothing_and_the_second_does_not_take_over", () => {
    // Catches a parcel carried by a lead who is up at the table or sitting stuck on the step.
    const waiting = lead("a1", { stage: "needs_you", needs: "question", since: 1 });
    const stuck = lead("a1", { stage: "needs_you", needs: "stuck", since: 1 });
    expect(carrier([waiting, lead("a2")])).toBeNull();
    expect(carrier([stuck, lead("a2")])).toBeNull();
  });

  test("a_house_with_no_lead_and_a_parcel_on_a_doorstep_have_no_carrier", () => {
    expect(carrier([])).toBeNull();
    expect(carrier([lead("a1")], [pr(1, { checks: "running" })])).toBeNull();
  });

  test("the_steward_is_not_a_houses_first_lead_so_the_next_lead_carries", () => {
    const st = lead("st", { steward: true, kind: "background", name: "steward" });
    expect(carrier([st, lead("a1")])).toBe("character:a1");
  });
});

describe("the carry", () => {
  const stay = (...parcels: Parcel[]) => town([house("alpha", [lead("a1")], parcels), house("beta", [lead("b1")], [])]);
  const A1 = "character:a1";
  const P1 = "parcel:/work/alpha#1";
  const speed = 2.4;
  const folk = (all: Placed[], id: string) => all.find((p) => (p.kind === "lead" || p.kind === "hat") && p.id === id)!;
  const carry = (before: Town, after: Town, t = NOW, then: Walks = new Map()) => walksAfter(then, place(before), place(after), t);

  test("a_parcel_that_finishes_its_checks_is_carried_up_by_the_first_lead_who_lays_it_and_walks_home", () => {
    // Catches finished work that appears on the pile with nobody bringing it.
    const [before, after] = [stay(pr(1, { checks: "running" })), stay(pr(1))];
    const walks = carry(before, after);
    const walk = walks.get(A1)!;
    expect(walk).toBeDefined();
    expect([...walks.keys()]).toEqual([A1]);
    expect(walk.carry!.parcel).toBe(P1);
    expect(walk.route[0]).toEqual(folk(place(before), "a1").at);
    expect(walk.route[walk.route.length - 1]).toEqual(folk(place(after), "a1").at);
    const laid = along(walk.route, walk.carry!.drop);
    expect(dist(laid, PILE_DROP)).toBeLessThan(1e-6);
    expect(walk.carry!.drop).toBeGreaterThan(routeLength(walk.route) / 3);
    expect(walk.carry!.drop).toBeLessThan(routeLength(walk.route));
    const dropAt = NOW + (walk.carry!.drop / speed) * 1000;
    expect(gaitOf(walks, A1, NOW)).toBe("carry");
    expect(gaitOf(walks, A1, dropAt - 1)).toBe("carry");
    expect(gaitOf(walks, A1, dropAt + 1), "empty-handed, no flag to furl").toBe("back");
    expect(gaitOf(walks, A1, walkEnd(walk))).toBeUndefined();
  });

  test("the_parcel_is_in_the_carriers_arms_until_it_is_laid_and_the_next_change_is_the_lay_then_the_end", () => {
    // Catches a parcel that sits on the pile while it is still being carried, or a page that never redraws to lay it.
    const walks = carry(stay(pr(1, { checks: "running" })), stay(pr(1)));
    const walk = walks.get(A1)!;
    const dropAt = NOW + (walk.carry!.drop / speed) * 1000;
    expect(carrying(walks, NOW)).toEqual(new Map([[P1, A1]]));
    expect(carrying(walks, dropAt + 1).size).toBe(0);
    expect(nextChange(walks, NOW)).toBeCloseTo(dropAt, 3);
    expect(nextChange(walks, dropAt + 1)).toBeCloseTo(walkEnd(walk), 3);
    expect(nextChange(walks, walkEnd(walk))).toBe(Infinity);
    expect(nextChange(new Map(), NOW)).toBe(Infinity);
  });

  test("a_parcel_that_first_appears_on_the_pile_in_a_known_house_is_carried_too", () => {
    expect(carry(stay(), stay(pr(1))).get(A1)?.carry?.parcel).toBe(P1);
  });

  test("a_first_view_a_new_house_and_a_parcel_that_was_already_there_are_laid_with_no_walk", () => {
    // Catches a page that opens with every lead climbing, or a reload that carries the whole pile up.
    expect(walksAfter(new Map(), [], place(stay(pr(1))), NOW).size).toBe(0);
    expect(carry(stay(), town([house("alpha", [lead("a1")], []), house("beta", [lead("b1")], []), house("gamma", [lead("c1")], [pr(5)])])).size).toBe(0);
    expect(carry(stay(pr(1)), stay(pr(1), pr(2))).get(A1)?.carry?.parcel).toBe("parcel:/work/alpha#2");
    expect(carry(stay(pr(1)), stay(pr(1))).size).toBe(0);
  });

  test("a_parcel_that_goes_back_to_its_door_or_arrives_there_is_not_carried", () => {
    expect(carry(stay(pr(1)), stay(pr(1, { checks: "running" }))).size).toBe(0);
    expect(carry(stay(), stay(pr(1, { checks: "red", redAt: 1 }))).size).toBe(0);
  });

  test("a_lead_in_the_line_or_stuck_does_not_carry_and_the_parcel_just_appears", () => {
    // Catches a lead pulled off the line, or off its stuck step, to carry a parcel.
    for (const over of [{ stage: "needs_you", needs: "question", since: 1 }, { stage: "needs_you", needs: "stuck", since: 1 }] as Partial<Lead>[]) {
      const at = (parcels: Parcel[]) => town([house("alpha", [lead("a1", over)], parcels)]);
      expect(carry(at([pr(1, { checks: "running" })]), at([pr(1)])).size).toBe(0);
    }
  });

  test("one_lead_carries_one_parcel_at_a_time_and_the_walk_is_not_restarted_by_the_next_frame", () => {
    // Catches two parcels carried as one, or a walk that starts over with each state frame.
    const [before, after] = [stay(), stay(pr(1), pr(2))];
    const walks = carry(before, after);
    expect([...walks.keys()]).toEqual([A1]);
    expect(walks.get(A1)!.carry!.parcel).toBe(P1);
    const again = carry(after, after, NOW + 1000, walks);
    expect(again.get(A1)).toBe(walks.get(A1));
    // A third parcel finishing on the way does not start another carry for the busy lead.
    const more = carry(after, stay(pr(1), pr(2), pr(3)), NOW + 1000, walks);
    expect(more.get(A1)).toBe(walks.get(A1));
  });

  test("a_lead_whose_work_changes_on_its_way_up_drops_the_parcel_on_the_pile_and_goes_home", () => {
    // Catches a parcel lost in a lead's arms when the lead is called to the line mid-carry.
    const [before, after] = [stay(), stay(pr(1))];
    const walks = carry(before, after);
    const asks = town([house("alpha", [lead("a1", { stage: "needs_you", needs: "question", since: 1 })], [pr(1)]), house("beta", [lead("b1")], [])]);
    const t = NOW + 2000;
    const next = carry(after, asks, t, walks);
    expect(next.get(A1)!.carry).toBeUndefined();
    expect(carrying(next, t).size).toBe(0);
  });

  test("a_parcel_that_is_merged_on_the_way_up_sends_its_carrier_home_without_it_from_where_it_is", () => {
    // Catches a lead that climbs the whole stair to lay a parcel that is gone, its arms still full.
    const walks = carry(stay(), stay(pr(1)));
    const t = NOW + 2000;
    const next = carry(stay(pr(1)), stay(), t, walks);
    const walk = next.get(A1)!;
    expect(walk.carry).toBeUndefined();
    expect(gaitOf(next, A1, t)).toBe("back");
    expect(carrying(next, t).size).toBe(0);
    const here = stepOf(walks.get(A1)!, t);
    expect(walk.route[0]).toEqual({ x: here.x, z: here.z });
    expect(walk.route[walk.route.length - 1]).toEqual(folk(place(stay()), "a1").at);
  });

  test("the_hidden_list_says_a_lead_carries_a_parcel_while_it_climbs_and_walks_home_after", () => {
    expect(walkWords("carry")).toBe("carrying a parcel");
    expect(walkWords("back")).toBe("walking home");
  });

  test("a_carrier_holds_the_parcel_in_both_arms_with_no_flag_and_nothing_is_loud", () => {
    // Catches a carrier that waves or holds a flag: a parcel is never loud.
    const cat = { pose: "work" as const, animal: "cat" as const };
    expect(actOf(cat, "carry")).toBe("carry");
    expect(actOf(cat, "back"), "home again with empty hands").toBe("walk");
    expect(PROPS.walk).toEqual([]);
    expect(drawnFlag(cat, "back")).toBeNull();
    expect(PROPS.carry).toEqual(["parcel"]);
    expect(drawnFlag(cat, "carry")).toBeNull();
    const p = restPosture();
    pose(p, "carry", 1, 0);
    expect(p.armL.up).toBeLessThan(-0.9);
    expect(p.armR.up).toBe(p.armL.up);
    expect(p.legL).not.toBe(0);
    for (const placed of place(stay(pr(1)))) if (placed.kind === "parcel") expect(placed).not.toHaveProperty("flag");
  });

  test("a_carried_parcel_with_a_ready_review_holds_her_note_too", () => {
    const colours = (props: Prop[]) => rigOf(costumeOf(undefined, true), "#7b5aa6", 1, props).parts.map((p) => p.colour.getHexString());
    const [bare, boxed, noted] = [colours([]), colours(["parcel"]), colours(["parcel", "parcel-note"])];
    const [teal, tie] = [QUEEN_TEAL.slice(1), "7b5aa6"];
    expect(boxed.length).toBeGreaterThan(bare.length);
    expect(boxed.filter((c) => c === tie).length, "tied in its project's colour").toBeGreaterThan(bare.filter((c) => c === tie).length);
    expect(boxed).not.toContain(teal);
    expect(noted.length).toBeGreaterThan(boxed.length);
    expect(noted).toContain(teal);
  });
});
