import { describe, expect, test } from "vitest";
import type { Character, House, Lead, Parcel, Town } from "../../server/types.ts";
import { FOG_AFTER_MS, fogLabel, fogLine, fogWords, glanceOf, LIST_FAILING_MS, townFog } from "../../web/src/glance.ts";

const NOW = 1_000_000;
const char = (id: string, over: Partial<Character> = {}): Character => ({ id, name: id, stage: "working", activity: null, step: null, ...over });
const lead = (id: string, over: Partial<Lead> = {}, subagents: Character[] = []): Lead => ({
  ...char(id), cwd: "/work/alpha", tty: null, termProgram: null, kind: "terminal", shortId: null, subagents, ...over,
});
const resting = (id: string) => lead(id, { stage: "needs_you", needs: "turn ended", since: 1 });
const parcel = (number: number, over: Partial<Parcel> = {}): Parcel => ({ number, title: `PR ${number}`, url: `https://example.test/${number}`, draft: false, checks: "green", ...over });
const house = (leads: Lead[], parcels?: Parcel[], over: Partial<House> = {}): House => ({ project: "alpha", cwd: "/work/alpha", leads, parcels, parcelsAt: NOW - 1000, ...over });
const numbers = (ps: Parcel[]) => ps.map((p) => p.number);

describe("glanceOf", () => {
  test("a_house_with_no_failed_parcel_is_not_on_fire_whoever_works", async () => {
    // Catches a running or none PR counted as fire.
    for (const checks of ["green", "running", "none"] as const) {
      expect(glanceOf(house([resting("a")], [parcel(1, { checks })]), NOW).fire).toBe("none");
    }
    expect(glanceOf(house([resting("a")]), NOW).fire).toBe("none");
  });

  test("a_failed_parcel_with_no_lead_working_is_burning_and_a_house_with_no_leads_burns_too", async () => {
    expect(glanceOf(house([resting("a")], [parcel(1, { checks: "red" })]), NOW).fire).toBe("burning");
    expect(glanceOf(house([], [parcel(1, { checks: "red" })]), NOW).fire).toBe("burning");
  });

  test("a_failed_parcel_while_any_lead_works_is_handled_and_a_subagent_alone_does_not_hold_the_bucket", async () => {
    const red = [parcel(1, { checks: "red" })];
    expect(glanceOf(house([resting("a"), lead("b")], red), NOW).fire).toBe("handled");
    // A run working in its worktree folder holds the bucket for its project's house.
    const run = lead("run", { kind: "background", cwd: "/work/alpha/.claude/worktrees/fix-ci" });
    expect(glanceOf(house([resting("a"), run], red), NOW).fire).toBe("handled");
    // A lead waiting on its subagents is still working.
    expect(glanceOf(house([lead("c", { activity: "waiting on 2 agents" })], red), NOW).fire).toBe("handled");
    // A working subagent under a resting lead is not a lead working.
    expect(glanceOf(house([resting("a")].map((l) => ({ ...l, subagents: [char("sub")] })), red), NOW).fire).toBe("burning");
  });

  test("red_parcels_come_oldest_failure_first_and_an_unknown_time_last", async () => {
    const g = glanceOf(
      house([], [parcel(1, { checks: "red" }), parcel(2, { checks: "red", redAt: 500 }), parcel(3, { checks: "red", redAt: 100 }), parcel(4, { checks: "red" })]),
      NOW,
    );
    expect(numbers(g.red)).toEqual([3, 2, 1, 4]);
  });

  test("green_and_no_check_parcels_wait_in_a_house_where_no_lead_works_in_the_houses_own_order", async () => {
    const parcels = [parcel(5, { checks: "none" }), parcel(4), parcel(3, { checks: "running" }), parcel(2, { checks: "red" }), parcel(1)];
    expect(numbers(glanceOf(house([resting("a")], parcels), NOW).waiting)).toEqual([5, 4, 1]);
  });

  test("nothing_waits_while_a_lead_works_and_a_failed_or_running_parcel_never_waits", async () => {
    // Catches "waits for you" shown while someone is already on the PRs, and on a PR still in flight.
    expect(glanceOf(house([lead("a")], [parcel(1)]), NOW).waiting).toEqual([]);
    expect(glanceOf(house([], [parcel(1, { checks: "running" }), parcel(2, { checks: "red" })]), NOW).waiting).toEqual([]);
  });

  test("a_house_without_parcels_has_nothing_to_say", async () => {
    expect(glanceOf(house([]), NOW)).toEqual({ fire: "none", red: [], waiting: [], fog: false });
  });
});

describe("fog on a house", () => {
  test("a_house_is_in_fog_when_its_pr_list_never_worked_or_last_worked_more_than_the_constant_ago_by_the_pages_clock", async () => {
    // Catches fog by a different age than the one constant, and a house never read passing for clear.
    expect(FOG_AFTER_MS).toBe(3 * 60_000);
    expect(glanceOf(house([], [], { parcelsAt: undefined }), NOW).fog).toBe(true);
    expect(glanceOf(house([], [], { parcelsAt: NOW - FOG_AFTER_MS }), NOW).fog).toBe(false);
    expect(glanceOf(house([], [], { parcelsAt: NOW - FOG_AFTER_MS - 1 }), NOW).fog).toBe(true);
    // The same house, judged later by the page's clock, goes into fog without a new frame.
    const h = house([], [], { parcelsAt: NOW });
    expect(glanceOf(h, NOW + FOG_AFTER_MS).fog).toBe(false);
    expect(glanceOf(h, NOW + FOG_AFTER_MS + 1).fog).toBe(true);
  });

  test("the_stewards_house_is_never_in_fog_though_it_has_no_parcelsAt", async () => {
    const mine = house([lead("steward", { steward: true, kind: "background" })], undefined, { parcelsAt: undefined });
    expect(glanceOf(mine, NOW).fog).toBe(false);
    // Another lead in the same house does not make it the steward's.
    expect(glanceOf(house([lead("other")], undefined, { parcelsAt: undefined }), NOW).fog).toBe(true);
  });

  test("a_house_in_fog_has_no_waiting_prs_but_keeps_its_fire", async () => {
    // Catches "waits for you" on a list that may be 10 minutes old, and a fire dropped because its list is old.
    const h = house([resting("a")], [parcel(1), parcel(2, { checks: "red" })], { parcelsAt: NOW - FOG_AFTER_MS - 1 });
    const g = glanceOf(h, NOW);
    expect(g.waiting).toEqual([]);
    expect(g.fire).toBe("burning");
    expect(numbers(g.red)).toEqual([2]);
    expect(numbers(glanceOf({ ...h, parcelsAt: NOW }, NOW).waiting)).toEqual([1]);
  });
});

describe("fogWords", () => {
  test("a_house_never_read_says_not_read_yet_and_one_read_before_says_the_local_clock_time", async () => {
    expect(fogWords(house([], [], { parcelsAt: undefined }))).toBe("PRs not read yet");
    const at = new Date(2026, 10, 28, 14, 2, 31).getTime();
    expect(fogWords(house([], [], { parcelsAt: at }))).toBe("PRs last read 14:02");
    expect(fogWords(house([], [], { parcelsAt: new Date(2026, 10, 28, 9, 5).getTime() }))).toBe("PRs last read 09:05");
  });
});

describe("townFog", () => {
  const town = (over: Partial<Town> = {}): Town => ({ houses: [], cards: [], started: NOW - 600_000, claude: { version: "2.1.325", problems: [] }, ...over });

  test("a_list_that_worked_within_10_seconds_is_no_fog_and_one_older_is_fog_since_it_last_worked", async () => {
    // Catches fog on a healthy town, and none (or the wrong time) once the session list stopped working.
    expect(townFog(town({ listedAt: NOW - 1000 }), null, NOW)).toBeNull();
    expect(townFog(town({ listedAt: NOW - LIST_FAILING_MS }), null, NOW)).toBeNull();
    expect(townFog(town({ listedAt: NOW - LIST_FAILING_MS - 1 }), null, NOW)).toEqual({ why: "list", since: NOW - LIST_FAILING_MS - 1 });
  });

  test("a_town_never_listed_is_fog_since_the_server_started", async () => {
    // Catches a town that looks calm because the list never worked.
    expect(townFog(town(), null, NOW)).toEqual({ why: "list", since: NOW - 600_000 });
  });

  test("a_lost_server_is_fog_since_it_was_lost_even_when_the_list_was_fresh_and_before_any_town_arrived", async () => {
    // Catches the lost server being reported as a failing list, or not at all.
    expect(townFog(town({ listedAt: NOW }), NOW - 5000, NOW)).toEqual({ why: "lost", at: NOW - 5000 });
    expect(townFog(null, NOW - 5000, NOW)).toEqual({ why: "lost", at: NOW - 5000 });
  });

  test("no_town_yet_and_a_server_not_lost_is_no_fog", async () => {
    expect(townFog(null, null, NOW)).toBeNull();
  });

  test("an_old_claude_code_or_missing_hooks_are_not_fog", async () => {
    // Catches version problems turning the town grey.
    expect(townFog(town({ listedAt: NOW, claude: { version: "2.1.1", problems: ["no agents --json"] } }), null, NOW)).toBeNull();
    expect(townFog(town({ listedAt: NOW, claude: { version: null, problems: ["claude not found"] } }), null, NOW)).toBeNull();
  });
});

describe("the fog's words", () => {
  const at = new Date(2026, 10, 28, 14, 2, 59).getTime(); // local time, so the words don't depend on the machine's zone

  test("the_line_says_when_the_server_was_lost_or_since_when_sessions_could_not_be_listed_in_local_time", async () => {
    // Catches a changed sentence, a time in UTC or with seconds, and one reason worded as the other.
    expect(fogLine({ why: "lost", at })).toBe("Lost the server at 14:02: this is the town as it was then.");
    expect(fogLine({ why: "list", since: at })).toBe("Could not list sessions since 14:02.");
    expect(fogLine({ why: "list", since: new Date(2026, 10, 28, 9, 5).getTime() })).toBe("Could not list sessions since 09:05.");
  });

  test("the_icon_label_names_the_same_reason", async () => {
    expect(fogLabel({ why: "lost", at })).toBe("Can't see: lost the server at 14:02");
    expect(fogLabel({ why: "list", since: at })).toBe("Can't see: could not list sessions since 14:02");
  });
});
