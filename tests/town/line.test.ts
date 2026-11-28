import { describe, expect, test } from "vitest";
import type { Character, House, Lead, Parcel, Town } from "../../server/types.ts";
import { urgencyList, type Entry } from "../../web/src/needs.tsx";
import { castleLocal, HILL, onPlateau, onStair, TREAD } from "../../web/src/town/hill.ts";
import { HEAD_AT } from "../../web/src/town/court.ts";
import { landHeight } from "../../web/src/town/island.ts";
import { layout } from "../../web/src/town/layout.ts";

const NOW = 100 * 60_000;
const MIN = 60_000;
const char = (id: string, over: Partial<Character> = {}): Character => ({ id, name: id, stage: "working", activity: null, step: null, ...over });
const lead = (id: string, over: Partial<Lead> = {}, subagents: Character[] = []): Lead => ({
  ...char(id), cwd: "/work/app", tty: null, termProgram: null, kind: "terminal", shortId: null, subagents, ...over,
});
const house = (project: string, leads: Lead[], parcels?: Parcel[]): House => ({ project, cwd: `/work/${project}`, leads, parcels, parcelsAt: NOW });
const town = (houses: House[], over: Partial<Town> = {}): Town => ({ houses, cards: [], started: 1, claude: { version: "2.1.325", problems: [] }, listedAt: NOW, ...over });
/** Asking for the user since `minutesAgo` minutes before NOW. */
const asks = (minutesAgo: number, over: Partial<Character> = {}): Partial<Character> => ({ stage: "needs_you", needs: "question", since: NOW - minutesAgo * MIN, ...over });

const place = (t: Town, lost = false, waiting: Entry[] = urgencyList(t, NOW)) => layout(t, waiting, NOW, lost);
type Placed = ReturnType<typeof place>[number];
type Folk = Extract<Placed, { kind: "lead" | "hat" }>;
const folk = (all: Placed[]) => all.filter((p): p is Folk => p.kind === "lead" || p.kind === "hat");
/** The characters in the line, head first. */
const lineOf = (all: Placed[]) => folk(all).filter((f) => f.line).sort((a, b) => a.line!.place - b.line!.place);
/** `n` leads asking, one per house, the first the oldest. */
const askers = (n: number) => town(Array.from({ length: n }, (_, i) => house(`p${i}`, [lead(`w${i}`, asks(60 - i))])));

describe("the line", () => {
  test("waiting_characters_stand_in_urgency_order_at_the_table_the_stair_head_then_every_third_tread_down_the_left_half_oldest_highest", () => {
    const line = lineOf(place(askers(7)));
    expect(line.map((f) => [f.id, f.line!.place])).toEqual([0, 1, 2, 3, 4, 5, 6].map((i) => [`w${i}`, i]));
    expect(line[0].at).toEqual(HEAD_AT);
    const [u1, w1] = castleLocal(line[1].at.x, line[1].at.z);
    expect(onPlateau(line[1].at.x, line[1].at.z)).toBe(true);
    expect(HILL.edge - w1, "the second waits at the stair head").toBeLessThan(0.6);
    expect(u1).toBeLessThan(0);
    const treads = line.slice(2).map((f) => {
      const [u, w] = castleLocal(f.at.x, f.at.z);
      expect(onStair(f.at.x, f.at.z), `${f.id} on the stair`).toBe(true);
      expect(u, `${f.id} on the left half`).toBeLessThan(0);
      expect(u, `${f.id} on the stair`).toBeGreaterThan(-HILL.stair.width / 2);
      return Math.floor((w - HILL.edge) / TREAD);
    });
    // Counted from the top tread: every third one, the oldest highest.
    expect(treads.map((t) => t - treads[0])).toEqual([0, 3, 6, 9, 12]);
  });

  test("a_line_too_long_for_the_stair_goes_on_in_order_in_a_short_row_on_the_square_at_the_stairs_foot", () => {
    const line = lineOf(place(askers(12)));
    expect(line.map((f) => f.id)).toEqual(Array.from({ length: 12 }, (_, i) => `w${i}`));
    const rest = line.slice(7);
    for (const f of rest) {
      const [, w] = castleLocal(f.at.x, f.at.z);
      expect(onStair(f.at.x, f.at.z), `${f.id} off the stair`).toBe(false);
      expect(w, `${f.id} below the stair's foot`).toBeGreaterThan(HILL.stair.foot);
      expect(w - HILL.stair.foot, `${f.id} near the stair's foot`).toBeLessThan(2.5);
      expect(landHeight(f.at.x, f.at.z), `${f.id} on land`).toBeGreaterThan(0.2);
    }
    const spots = line.map((f) => `${f.at.x.toFixed(3)},${f.at.z.toFixed(3)}`);
    expect(new Set(spots).size).toBe(spots.length);
  });

  test("only_the_head_waves_its_flag_and_the_rest_hold_theirs_still", () => {
    expect(lineOf(place(askers(3))).map((f) => f.line!.flag)).toEqual(["wave", "still", "still"]);
  });

  test("nothing_waves_while_the_page_has_lost_the_server", () => {
    expect(lineOf(place(askers(3), true)).map((f) => f.line!.flag)).toEqual(["still", "still", "still"]);
  });

  test("a_known_ask_stays_loud_while_only_the_session_list_fails", () => {
    const t = { ...askers(2), listedAt: NOW - 60_000 };
    expect(lineOf(place(t)).map((f) => f.line!.flag)).toEqual(["wave", "still"]);
  });

  test("the_head_does_not_wave_when_the_head_of_the_urgency_list_is_a_burning_house", () => {
    const t = askers(2);
    const fire: Entry = { kind: "pr", key: "/work/p9#1", project: "p9", cwd: "/work/p9", number: 1, title: "x", need: "burning", since: 1, tier: 3 };
    expect(lineOf(place(t, false, [fire, ...urgencyList(t, NOW)])).map((f) => f.line!.flag)).toEqual(["still", "still"]);
  });

  test("a_house_flies_its_flag_exactly_while_one_of_its_characters_is_in_the_line", () => {
    const all = place(town([
      house("asking", [lead("a1", asks(3))]),
      house("sub-asks", [lead("b1", {}, [char("b-sub", { ...asks(2), role: "Plan" })])]),
      house("working", [lead("c1")]),
      house("stuck", [lead("d1", asks(5, { needs: "stuck", reason: "loop" }))]),
      house("resting", [lead("e1", asks(5, { needs: "turn ended" }))]),
    ]));
    const flying = all.flatMap((p) => (p.kind === "building" && p.flag ? [p.cwd] : []));
    expect(flying.sort()).toEqual(["/work/asking", "/work/sub-asks"]);
  });

  test("a_waiting_character_stands_under_2_minutes_taps_from_2_sits_from_10_and_sleeps_from_30_while_the_waving_head_stands", () => {
    const waits = [45, 1.9, 2, 9.9, 10, 29.9, 30];
    const t = town(waits.map((m, i) => house(`p${i}`, [lead(`w${i}`, asks(m))])));
    const line = lineOf(place(t));
    expect(line.map((f) => [f.id, f.line!.posture])).toEqual([
      ["w0", "stand"], ["w6", "asleep"], ["w5", "sit"], ["w4", "sit"], ["w3", "tap"], ["w2", "tap"], ["w1", "stand"],
    ]);
    // A head that doesn't wave acts its wait like the rest.
    expect(lineOf(place(t, true))[0].line!.posture).toBe("asleep");
  });
});
