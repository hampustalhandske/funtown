import { describe, expect, test } from "vitest";
import type { Character, House, Lead, Parcel } from "../../server/types.ts";
import { glanceOf } from "../../web/src/glance.ts";

const NOW = 1_000_000;
const char = (id: string, over: Partial<Character> = {}): Character => ({ id, name: id, stage: "working", activity: null, step: null, ...over });
const lead = (id: string, over: Partial<Lead> = {}, subagents: Character[] = []): Lead => ({
  ...char(id), cwd: "/work/alpha", tty: null, termProgram: null, kind: "terminal", shortId: null, subagents, ...over,
});
const resting = (id: string) => lead(id, { stage: "needs_you", needs: "turn ended", since: 1 });
const parcel = (number: number, over: Partial<Parcel> = {}): Parcel => ({ number, title: `PR ${number}`, url: `https://example.test/${number}`, draft: false, checks: "green", ...over });
const house = (leads: Lead[], parcels?: Parcel[]): House => ({ project: "alpha", cwd: "/work/alpha", leads, parcels });
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
    expect(glanceOf(house([]), NOW)).toEqual({ fire: "none", red: [], waiting: [] });
  });
});
