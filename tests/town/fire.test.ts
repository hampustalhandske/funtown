import { describe, expect, test } from "vitest";
import type { Character, House, Lead, Parcel, Town } from "../../server/types.ts";
import { urgencyList } from "../../web/src/needs.tsx";
import { bucketOf, LOOKS, roofOf, splashOf } from "../../web/src/town/fire.ts";
import { groundHeight } from "../../web/src/town/island.ts";
import { actOf, PROPS } from "../../web/src/town/acts.ts";
import { planOf, VARIANTS } from "../../web/src/town/houses.ts";
import { layout, type Placed } from "../../web/src/town/layout.ts";

const NOW = 1_000_000;
const char = (id: string, over: Partial<Character> = {}): Character => ({ id, name: id, stage: "working", activity: null, step: null, ...over });
const lead = (id: string, over: Partial<Lead> = {}, subagents: Character[] = []): Lead => ({
  ...char(id), cwd: "/work/alpha", tty: null, termProgram: null, kind: "terminal", shortId: null, subagents, ...over,
});
const parcel = (number: number, over: Partial<Parcel> = {}): Parcel => ({ number, title: `PR ${number}`, url: `https://example.test/${number}`, draft: false, checks: "green", ...over });
const red = (number: number, redAt = 1) => parcel(number, { checks: "red", redAt });
/** A house whose PR list was read a second ago, unless `over` says otherwise (`parcelsAt: undefined` is fog). */
const house = (project: string, leads: Lead[], parcels: Parcel[] = [], over: Partial<House> = {}): House => ({
  project, cwd: `/work/${project}`, leads: leads.map((l) => ({ ...l, cwd: `/work/${project}` })), parcels, parcelsAt: NOW - 1000, ...over,
});
const town = (houses: House[], over: Partial<Town> = {}): Town => ({ houses, cards: [], started: 1, claude: { version: "2.1.325", problems: [] }, listedAt: NOW, ...over });
const asks = (since: number): Partial<Lead> => ({ stage: "needs_you", needs: "permission", since });
const resting = (id: string) => lead(id, { stage: "needs_you", needs: "turn ended", since: 1 });

const place = (t: Town, lost = false) => layout(t, urgencyList(t, NOW), NOW, lost);
const fires = (all: Placed[]) => Object.fromEntries(all.flatMap((p) => (p.kind === "building" ? [[p.cwd.split("/").pop(), p.fire]] : [])));

describe("a house's fire", () => {
  test("each_form_comes_from_the_glance_and_only_the_head_of_the_urgency_list_is_loud", () => {
    // Catches a burning house that is not the head drawn loud, a handled fire drawn as burning, and a calm house on fire.
    const t = town([
      house("calm", [resting("c")], [parcel(1)]),
      house("burns-head", [resting("b")], [red(2, 5)]),
      house("burns-later", [resting("d")], [red(3, 50)]),
      house("handled", [lead("e")], [red(4)]),
    ]);
    expect(fires(place(t))).toEqual({ calm: "none", "burns-head": "burning-loud", "burns-later": "burning", handled: "handled" });
  });

  test("an_ask_ahead_of_the_fire_keeps_the_fire_quiet_and_without_an_urgency_list_nothing_is_loud", () => {
    const t = town([house("alpha", [lead("a", asks(10))]), house("beta", [resting("b")], [red(2)])]);
    expect(fires(place(t))).toEqual({ alpha: "none", beta: "burning" });
    expect(fires(layout(t, [], NOW, false))).toEqual({ alpha: "none", beta: "burning" });
  });

  test("a_burning_house_is_not_loud_once_the_page_has_lost_the_server", () => {
    const t = town([house("beta", [resting("b")], [red(2)])]);
    expect(fires(place(t, true))).toEqual({ beta: "burning" });
  });

  test("a_fire_under_fog_is_last_seen_and_never_loud_whatever_else_is_on_the_list", () => {
    // Catches a house under fog drawn with live flames: Funtown could not look, so it shows the last thing it saw.
    const t = town([house("foggy", [resting("f")], [red(2)], { parcelsAt: undefined })]);
    expect(urgencyList(t, NOW)[0].tier).toBe(4);
    expect(fires(place(t))).toEqual({ foggy: "last-seen" });
  });

  test("a_handled_fire_stays_handled_under_fog_because_a_lead_is_working_on_it_now", () => {
    const t = town([house("h", [lead("w")], [red(2)], { parcelsAt: undefined })]);
    expect(fires(place(t))).toEqual({ h: "handled" });
  });
});

const folk = (all: Placed[], id: string) => all.find((p): p is Extract<Placed, { kind: "lead" }> => p.kind === "lead" && p.id === id)!;
const at = (all: Placed[], project: string) => all.find((p): p is Extract<Placed, { kind: "building" }> => p.kind === "building" && p.cwd === `/work/${project}`)!;

describe("how each form looks", () => {
  test("the_loud_fire_is_the_biggest_with_the_tallest_dark_column_and_the_quiet_burning_plume_stays_under_two_house_heights", () => {
    const height = Math.min(...VARIANTS.map((v) => planOf(v).top + planOf(v).rh));
    expect(LOOKS["burning-loud"].rise).toBeGreaterThan(LOOKS.burning.rise * 2);
    expect(LOOKS["burning-loud"].flame).toBeGreaterThan(LOOKS.burning.flame);
    expect(LOOKS.burning.rise).toBeLessThan(2 * height);
    // The loud smoke is dark, the quiet one grey and the handled one white.
    const lightness = (hex: string) => parseInt(hex.slice(1, 3), 16);
    expect(lightness(LOOKS["burning-loud"].smoke)).toBeLessThan(lightness(LOOKS.burning.smoke));
    expect(lightness(LOOKS.burning.smoke)).toBeLessThan(lightness(LOOKS.handled.smoke));
    expect(LOOKS.handled.flame).toBeLessThan(LOOKS.burning.flame);
  });

  test("every_form_a_house_can_burn_in_has_flames_and_smoke_so_a_quiet_fire_is_never_drawn_as_nothing", () => {
    // Catches a form added without flames: the house would be named as burning and show nothing.
    for (const look of Object.values(LOOKS)) {
      expect(look.flame).toBeGreaterThan(0);
      expect(look.puffs).toBeGreaterThan(0);
    }
  });

  test("only_a_fire_last_seen_is_frozen_and_it_has_no_glow_and_the_burning_size", () => {
    expect(Object.entries(LOOKS).filter(([, l]) => l.frozen).map(([form]) => form)).toEqual(["last-seen"]);
    expect(LOOKS["last-seen"]).toEqual({ ...LOOKS.burning, glow: 0, frozen: true });
  });
});

describe("where a fire sits", () => {
  test("the_flames_stand_on_the_ridge_within_the_roofs_footprint_and_the_water_leaves_the_bucket_in_front_of_its_thrower", () => {
    const t = town([house("handled", [lead("a")], [red(4)])]);
    const all = place(t);
    const b = at(all, "handled");
    const roof = roofOf(b);
    const { top, rh } = planOf(b.variant);
    expect(Math.hypot(roof.x - b.at.x, roof.z - b.at.z)).toBeLessThan(0.5);
    expect(roof.y - groundHeight(b.at.x, b.at.z)).toBeGreaterThan(top);
    expect(roof.y - groundHeight(b.at.x, b.at.z)).toBeLessThan(top + rh);
    // The thrower is out in front of the house, so the water flies back across to the roof.
    const thrower = folk(all, "a");
    const hand = bucketOf(thrower);
    expect(Math.hypot(hand.x - thrower.at.x, hand.z - thrower.at.z)).toBeCloseTo(0.45);
    expect(Math.hypot(splashOf(b).x - hand.x, splashOf(b).z - hand.z)).toBeLessThan(Math.hypot(splashOf(b).x - thrower.at.x, splashOf(b).z - thrower.at.z));
  });
});

describe("the lead at a handled fire", () => {
  test("a_working_lead_of_a_handled_house_holds_the_bucket_and_faces_its_roof_and_a_subagent_keeps_working", () => {
    const t = town([house("handled", [lead("a", {}, [char("sub", { role: "implementer" })])], [red(4)]), house("calm", [lead("b")])]);
    const all = place(t);
    expect(folk(all, "a").pose).toBe("bucket");
    expect(folk(all, "b").pose).toBe("work");
    expect(all.find((p) => p.kind === "hat")).toMatchObject({ pose: "work" });
    // It stands where the working do, turned the other way: toward the house.
    const worker = folk(place(town([house("handled", [lead("a")])])), "a");
    expect(folk(all, "a").at).toEqual(worker.at);
    expect(Math.cos(folk(all, "a").facing - worker.facing)).toBeCloseTo(-1);
    expect(actOf({ pose: "bucket", animal: "cat" })).toBe("bucket");
    expect(PROPS.bucket).toEqual(["bucket"]);
  });

  test("a_lead_that_does_not_work_holds_no_bucket_and_a_fire_nobody_handles_throws_none", () => {
    const t = town([house("handled", [lead("a"), lead("r", { stage: "needs_you", needs: "turn ended", since: 1 })], [red(4)]), house("burns", [resting("c")], [red(5)])]);
    const all = place(t);
    expect(folk(all, "r").pose).toBe("rest");
    expect(at(all, "burns").fire).not.toBe("handled");
    expect(folk(all, "c").pose).toBe("rest");
  });
});

describe("the loud stuck character", () => {
  test("only_the_stuck_character_at_the_head_of_the_list_has_stars_and_none_while_the_page_is_lost", () => {
    // Catches stars on every stuck character, on a stuck one behind an ask, and on one the page can no longer vouch for.
    const stuck = (since: number): Partial<Lead> => ({ stage: "needs_you", needs: "stuck", since, reason: "loop" });
    const t = town([house("alpha", [lead("old", stuck(5)), lead("new", stuck(9))])]);
    const stars = (all: Placed[]) => Object.fromEntries(all.flatMap((p) => (p.kind === "lead" ? [[p.id, p.stars]] : [])));
    expect(stars(place(t))).toEqual({ old: true, new: false });
    expect(stars(place(t, true))).toEqual({ old: false, new: false });
    const behindAsk = town([house("alpha", [lead("old", stuck(5)), lead("ask", asks(9))])]);
    expect(stars(place(behindAsk))).toEqual({ old: false, ask: false });
  });

  test("a_quiet_stuck_rate_limit_and_a_working_lead_have_no_stars", () => {
    const limited = lead("lim", { stage: "needs_you", needs: "stuck", since: 3, reason: "rate limit" });
    const all = place(town([house("alpha", [limited, lead("w")])]));
    expect([folk(all, "lim").stars, folk(all, "w").stars]).toEqual([false, false]);
  });
});
