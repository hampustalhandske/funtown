import { describe, expect, test } from "vitest";
import type { Character, House, Lead, Parcel, Town } from "../../server/types.ts";
import { characterEntries, urgencyList } from "../../web/src/needs.tsx";
import { layout } from "../../web/src/town/layout.ts";

const char = (id: string, over: Partial<Character> = {}): Character => ({ id, name: id, stage: "working", activity: null, step: null, ...over });
const lead = (id: string, over: Partial<Lead> = {}, subagents: Character[] = []): Lead => ({
  ...char(id), cwd: "/work/app", tty: null, termProgram: null, kind: "terminal", shortId: null, subagents, ...over,
});
const house = (project: string, leads: Lead[]): House => ({ project, cwd: `/work/${project}`, leads });
const town = (houses: House[]): Town => ({ houses, cards: [], started: 1, claude: { version: "2.1.325", problems: [] } });
const needs = (need: string, since: number, over: Partial<Character> = {}): Partial<Character> => ({ stage: "needs_you", needs: need, since, ...over });

const NOW = 1_000_000;
const ids = (t: Town) => urgencyList(t, NOW).map((w) => (w.kind === "pr" ? w.key : w.id));
const parcel = (number: number, over: Partial<Parcel> = {}): Parcel => ({ number, title: `PR ${number}`, url: `https://example.test/${number}`, draft: false, checks: "green", ...over });
const withParcels = (h: House, parcels: Parcel[]): House => ({ ...h, parcels });

/** Every tier at once; each id says its tier, `since` is the order inside it. */
const mixed = () =>
  town([
    house("alpha", [
      lead("rest-old", needs("turn ended", 1)),
      lead("ask-new", needs("permission", 50)),
      lead("stuck-mid", needs("stuck", 20, { reason: "loop: Bash: npm test" }), [char("plan-sub", needs("plan", 40, { role: "Plan" }))]),
    ]),
    house("beta", [
      lead("limit-new", needs("stuck", 60, { reason: "rate limit" })),
      lead("question-old", needs("question", 30)),
      lead("waiting-mid", needs("waiting", 45)),
      lead("limit-old", needs("stuck", 5, { reason: "rate limit" })),
      lead("ask-oldest", needs("permission", 10)),
    ]),
  ]);

describe("urgencyList", () => {
  test("tiers_are_strict_asks_then_stuck_then_rate_limits_then_resting_each_oldest_first_and_cards_lead_the_asks", async () => {
    // Tier 1: cards by since (10, 30, 40, 50), then the other ask (45). Tier 2: stuck (20). Tier 4: rate limits (5, 60), then resting (1).
    expect(ids(mixed())).toEqual([
      "ask-oldest", "question-old", "plan-sub", "ask-new", "waiting-mid", "stuck-mid", "limit-old", "limit-new", "rest-old",
    ]);
  });

  test("each_entry_says_its_tier_so_loud_one_and_two_tell_from_quiet_four", async () => {
    const tier = Object.fromEntries(urgencyList(mixed(), NOW).map((w) => [w.kind === "pr" ? w.key : w.id, w.tier]));
    expect(tier).toEqual({
      "ask-oldest": 1, "question-old": 1, "plan-sub": 1, "ask-new": 1, "waiting-mid": 1,
      "stuck-mid": 2, "limit-old": 4, "limit-new": 4, "rest-old": 4,
    });
  });

  test("equal_times_keep_the_order_of_the_town_and_a_missing_time_goes_last_in_its_tier", async () => {
    const t = town([
      house("alpha", [lead("x", needs("waiting", 7)), lead("y", { stage: "needs_you", needs: "waiting" }), lead("z", needs("waiting", 7))]),
    ]);
    expect(ids(t)).toEqual(["x", "z", "y"]);
  });

  test("an_empty_town_a_missing_town_and_working_characters_give_nothing", async () => {
    expect(urgencyList(null, NOW)).toEqual([]);
    expect(urgencyList(town([house("alpha", [lead("w", {}, [char("h")])])]), NOW)).toEqual([]);
  });

  test("the_entry_carries_its_house_lead_and_words", async () => {
    const [w] = urgencyList(town([house("alpha", [lead("a", needs("stuck", 3, { reason: "rate limit" }))])]), NOW);
    expect(w).toEqual({ kind: "character", key: "a/a", lead: "a", id: "a", project: "alpha", cwd: "/work/alpha", name: "a", need: "stuck: rate limit", since: 3, tier: 4 });
  });

  test("the_desk_queue_places_characters_in_the_urgency_order_not_oldest_first", async () => {
    const t = town([house("alpha", [lead("old-ask", needs("question", 1)), lead("new-ask", needs("permission", 50))])]);
    const [first, second] = characterEntries(urgencyList(t, NOW));
    expect([first.id, second.id]).toEqual(["old-ask", "new-ask"]);
    const spot = (all: ReturnType<typeof layout>, id: string) => all.find((p) => p.kind === "lead" && p.id === id)!.at;
    const placed = layout(t, urgencyList(t, NOW));
    const swapped = layout(t, [second, first]);
    expect(spot(placed, "old-ask")).toEqual(spot(swapped, "new-ask"));
    expect(spot(placed, "new-ask")).toEqual(spot(swapped, "old-ask"));
    expect(spot(placed, "old-ask")).not.toEqual(spot(placed, "new-ask"));
  });

  test("a_resting_lead_is_not_in_the_castle_queue_and_a_rate_limited_one_is_where_it_was", async () => {
    const t = town([
      house("alpha", [lead("rest", needs("turn ended", 1)), lead("ask", needs("permission", 2)), lead("limit", needs("stuck", 3, { reason: "rate limit" }))]),
    ]);
    const all = layout(t, urgencyList(t, NOW));
    const pose = Object.fromEntries(all.flatMap((p) => (p.kind === "lead" ? [[p.id, p.pose]] : [])));
    expect(pose).toEqual({ rest: "idle", ask: "queue", limit: "stuck" });
  });

  test("a_resting_lead_stands_by_its_own_door_clear_of_the_parcels_and_the_rack", async () => {
    // Catches a resting lead placed off to one side, where it reads as any other lead at the house.
    const t = town([
      house("alpha", [lead("rest", needs("turn ended", 1), [char("hat")]), lead("worker")]),
    ]);
    t.houses[0].parcels = [{ number: 1, title: "PR", url: "https://example.test/1", draft: false, checks: "none" }];
    const all = layout(t, urgencyList(t, NOW));
    const building = all.find((p) => p.kind === "building")!.at;
    const door = { x: building.x, z: building.z + 0.6 };
    const rest = all.find((p) => p.kind === "lead" && p.id === "rest")!.at;
    expect(Math.hypot(rest.x - door.x, rest.z - door.z)).toBeLessThan(0.6);
    expect(rest.z).toBeGreaterThan(door.z);
    for (const p of all.filter((p) => p.kind === "parcel" || p.kind === "hat" || (p.kind === "lead" && p.id !== "rest"))) {
      expect(Math.hypot(p.at.x - rest.x, p.at.z - rest.z), p.kind).toBeGreaterThanOrEqual(0.55);
    }
  });

  /** `mixed` plus gamma (a resting lead, a red PR 8 since 100, a red PR 7 since 900, a green PR 9) and delta (a resting lead, a PR with no checks). */
  const withPrs = () => {
    const t = mixed();
    t.houses.push(
      withParcels(house("gamma", [lead("rest-g", needs("turn ended", 2))]), [parcel(9), parcel(8, { checks: "red", redAt: 100 }), parcel(7, { checks: "red", redAt: 900 })]),
      withParcels(house("delta", [lead("rest-d", needs("turn ended", 3))]), [parcel(4, { checks: "none" })]),
    );
    return t;
  };

  test("a_burning_house_comes_after_asks_and_stuck_and_before_the_quiet_where_a_waiting_pr_sits_between_a_rate_limit_and_a_resting_lead", async () => {
    // Catches tier 3 sorted among the asks or the quiet, and a waiting PR ahead of a rate limit or behind a resting lead.
    expect(ids(withPrs())).toEqual([
      "ask-oldest", "question-old", "plan-sub", "ask-new", "waiting-mid", // tier 1
      "stuck-mid", // tier 2
      "/work/gamma#8", // tier 3: one entry for gamma, its oldest red PR
      "limit-old", "limit-new", "/work/gamma#9", "/work/delta#4", "rest-old", "rest-g", "rest-d", // tier 4
    ]);
  });

  test("burning_houses_go_oldest_failure_first_an_unknown_time_last_and_a_handled_fire_is_not_listed", async () => {
    // Catches two entries for one house, the newest fire first, and a fire someone is already fixing asking for you.
    const red = (n: number, redAt?: number) => parcel(n, { checks: "red", redAt });
    const t = town([
      withParcels(house("h1", []), [red(1)]),
      withParcels(house("h2", []), [red(5, 500), red(6, 50)]),
      withParcels(house("h3", [lead("fixer", { kind: "background" })]), [red(3, 20)]),
      withParcels(house("h4", []), [red(4, 300)]),
    ]);
    expect(ids(t)).toEqual(["/work/h2#6", "/work/h4#4", "/work/h1#1"]);
  });

  test("waiting_prs_put_a_ready_review_first_then_keep_house_order_and_pr_order_and_none_waits_where_a_lead_works_or_checks_run", async () => {
    const ready = { state: "ready", letter: "l1" } as const;
    const t = town([
      withParcels(house("a", []), [parcel(1), parcel(2, { review: ready })]),
      withParcels(house("b", []), [parcel(3, { checks: "none", review: ready })]),
      withParcels(house("c", [lead("worker")]), [parcel(4)]),
      withParcels(house("d", []), [parcel(5, { checks: "running" })]),
    ]);
    expect(ids(t)).toEqual(["/work/a#2", "/work/b#3", "/work/a#1"]);
  });

  test("a_pr_entry_has_its_own_key_project_words_and_tier_and_a_waiting_one_has_no_time", async () => {
    const t = town([
      withParcels(house("alpha", []), [parcel(12, { title: "Fix it", checks: "red", redAt: 900 })]),
      withParcels(house("beta", []), [parcel(13, { title: "Ship it" })]),
    ]);
    expect(urgencyList(t, NOW)).toEqual([
      { kind: "pr", key: "/work/alpha#12", project: "alpha", cwd: "/work/alpha", number: 12, title: "Fix it", need: "burning: checks failed", since: 900, tier: 3 },
      { kind: "pr", key: "/work/beta#13", project: "beta", cwd: "/work/beta", number: 13, title: "Ship it", need: "waits for you", since: Infinity, tier: 4 },
    ]);
  });

  test("the_castle_queue_and_morning_read_only_the_characters_so_a_pr_entry_changes_no_place", async () => {
    // Catches a PR entry shifting the queue or leaking into a character-only reader.
    const t = withPrs();
    const characters = characterEntries(urgencyList(t, NOW));
    expect(characters.map((w) => w.id)).toEqual([
      "ask-oldest", "question-old", "plan-sub", "ask-new", "waiting-mid", "stuck-mid", "limit-old", "limit-new", "rest-old", "rest-g", "rest-d",
    ]);
    expect(layout(t, urgencyList(t, NOW))).toEqual(layout(t, characters));
  });
});
