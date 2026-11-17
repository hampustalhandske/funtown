import { describe, expect, test } from "vitest";
import type { Character, House, Lead, Town } from "../../server/types.ts";
import { waitingList } from "../../web/src/needs.tsx";
import { layout } from "../../web/src/town/layout.ts";

const char = (id: string, over: Partial<Character> = {}): Character => ({ id, name: id, stage: "working", activity: null, step: null, ...over });
const lead = (id: string, over: Partial<Lead> = {}, subagents: Character[] = []): Lead => ({
  ...char(id), tty: null, termProgram: null, kind: "terminal", shortId: null, subagents, ...over,
});
const house = (project: string, leads: Lead[]): House => ({ project, cwd: `/work/${project}`, leads });
const town = (houses: House[]): Town => ({ houses, cards: [], started: 1, claude: { version: "2.1.325", problems: [] } });
const needs = (need: string, since: number, over: Partial<Character> = {}): Partial<Character> => ({ stage: "needs_you", needs: need, since, ...over });

/** Oldest first inside each group: ended-old(1) < perm-new(50) in time, but cards go first. */
const mixed = () =>
  town([
    house("alpha", [
      lead("ended-old", needs("turn ended", 1)),
      lead("perm-new", needs("permission", 50)),
      lead("stuck-mid", needs("stuck", 20, { reason: "loop" }), [char("plan-sub", needs("plan", 40, { role: "Plan" }))]),
    ]),
    house("beta", [
      lead("question-old", needs("question", 30)),
      lead("waiting-new", needs("waiting", 60)),
      lead("perm-oldest", needs("permission", 10)),
    ]),
  ]);

describe("waitingList", () => {
  test("a_card_holder_stands_ahead_of_a_turn_ended_session_that_waited_longer_and_each_group_is_oldest_first", async () => {
    // Cards (permission, question, plan) by since: 10, 30, 40, 50. The rest (turn ended, stuck, waiting): 1, 20, 60.
    expect(waitingList(mixed()).map((w) => w.id)).toEqual([
      "perm-oldest", "question-old", "plan-sub", "perm-new", "ended-old", "stuck-mid", "waiting-new",
    ]);
  });

  test("a_town_without_cards_keeps_pure_oldest_first", async () => {
    const t = town([house("alpha", [lead("b", needs("stuck", 5, { reason: "x" })), lead("a", needs("turn ended", 2)), lead("c", needs("waiting", 9))])]);
    expect(waitingList(t).map((w) => w.id)).toEqual(["a", "b", "c"]);
  });

  test("the_desk_queue_places_characters_in_the_waiting_order_not_oldest_first", async () => {
    const t = town([house("alpha", [lead("ended-old", needs("turn ended", 1)), lead("perm-new", needs("permission", 50))])]);
    const [first, second] = waitingList(t);
    expect([first.id, second.id]).toEqual(["perm-new", "ended-old"]);
    const spot = (all: ReturnType<typeof layout>, id: string) => all.find((p) => p.kind === "lead" && p.id === id)!.at;
    const placed = layout(t, waitingList(t));
    const swapped = layout(t, [second, first]);
    // The card holder takes the first desk spot; the swapped queue (the old pure oldest-first order) gives it to the other.
    expect(spot(placed, "perm-new")).toEqual(spot(swapped, "ended-old"));
    expect(spot(placed, "ended-old")).toEqual(spot(swapped, "perm-new"));
    expect(spot(placed, "perm-new")).not.toEqual(spot(placed, "ended-old"));
  });
});
