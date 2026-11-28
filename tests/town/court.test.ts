import { describe, expect, test } from "vitest";
import type { Card, Character, House, Lead, Town, Word } from "../../server/types.ts";
import { urgencyList } from "../../web/src/needs.tsx";
import { castleLocal, HILL, onPlateau } from "../../web/src/town/hill.ts";
import { avatarFor } from "../../web/src/town/kit/avatars.ts";
import { layout } from "../../web/src/town/layout.ts";

const char = (id: string, over: Partial<Character> = {}): Character => ({ id, name: id, stage: "working", activity: null, step: null, ...over });
const lead = (id: string, over: Partial<Lead> = {}, subagents: Character[] = []): Lead => ({
  ...char(id), cwd: "/work/app", tty: null, termProgram: null, kind: "terminal", shortId: null, subagents, ...over,
});
const steward = (over: Partial<Lead> = {}, subagents: Character[] = []) =>
  lead("st1", { name: "steward", kind: "background", shortId: "st1short", steward: true, ...over }, subagents);
const house = (project: string, leads: Lead[], over: Partial<House> = {}): House => ({ project, cwd: `/work/${project}`, leads, ...over });
const card = (leadId: string, word?: Word, over: Partial<Card> = {}): Card => ({
  id: `c-${leadId}`, lead: leadId, agent: null, kind: "question", tool: "AskUserQuestion", input: {}, cwd: "/work/alpha", at: 1,
  severity: { level: "low", reason: "", source: "kind" }, ...(word ? { word } : {}), ...over,
});
const town = (houses: House[], cards: Card[] = [], over: Partial<Town> = {}): Town => ({ houses, cards, started: 1, claude: { version: "2.1.325", problems: [] }, ...over });

const place = (t: Town) => layout(t, urgencyList(t, 1_000_000), 1_000_000, false);
type Placed = ReturnType<typeof place>[number];
const of = <K extends Placed["kind"]>(all: Placed[], kind: K) => all.filter((p): p is Extract<Placed, { kind: K }> => p.kind === kind);
const queenOf = (t: Town) => of(place(t), "queen")[0];
/** A town whose steward is listed (working unless said), with an asker `a1` whose card has `word`. */
const withWord = (word: Word | undefined, st: Partial<Lead> = {}) =>
  town([house("alpha", [lead("a1", { stage: "needs_you", needs: "question", since: 5 })]), house("steward", [steward(st)])], [card("a1", word)]);

describe("the Queen's state", () => {
  test("a_queued_or_writing_word_makes_her_lean_and_write_even_while_she_works", () => {
    for (const state of ["queued", "writing"] as const) expect(queenOf(withWord({ state })).state, state).toBe("asked");
    expect(queenOf(withWord({ state: "writing" }, { stage: "working" })).state).toBe("asked");
  });

  test("a_working_steward_with_no_word_being_written_is_busy_reading_a_parcel", () => {
    expect(queenOf(withWord({ state: "idle" }, { stage: "working" })).state).toBe("busy");
    expect(queenOf(withWord(undefined, { stage: "working" })).state).toBe("busy");
  });

  test("busy_outranks_a_ready_word_and_asked_outranks_both", () => {
    const t = town(
      [house("alpha", [lead("a1", { stage: "needs_you", needs: "question", since: 5 }), lead("a2", { stage: "needs_you", needs: "question", since: 6 })]), house("steward", [steward()])],
      [card("a1", { state: "ready", letter: "L1" }), card("a2", { state: "queued" })],
    );
    expect(queenOf(t).state).toBe("asked");
    const ready = town(t.houses, [t.cards[0]]);
    expect(queenOf(ready).state).toBe("busy");
  });

  test("a_ready_word_with_the_steward_at_rest_is_ready_and_names_the_character_whose_slip_carries_her_note", () => {
    const rest = { stage: "needs_you" as const, needs: "turn ended", since: 2 };
    const queen = queenOf(withWord({ state: "ready", letter: "L1" }, rest));
    expect(queen.state).toBe("ready");
    expect(queen.note).toBe("a1");
    // A subagent's card names the subagent, not its lead.
    const sub = town(
      [house("alpha", [lead("a1", {}, [char("x1", { stage: "needs_you", needs: "question", since: 5 })])]), house("steward", [steward(rest)])],
      [card("a1", { state: "ready", letter: "L1" }, { agent: "x1" })],
    );
    expect(queenOf(sub).note).toBe("x1");
  });

  test("an_idle_queen_has_no_note_and_so_has_one_with_no_cards_or_a_word_not_asked_or_a_failed_one", () => {
    const rest = { stage: "needs_you" as const, needs: "turn ended", since: 2 };
    for (const word of [undefined, { state: "idle" }, { state: "failed", reason: "x" }] as const) {
      const queen = queenOf(withWord(word as Word | undefined, rest));
      expect([queen.state, queen.note], JSON.stringify(word)).toEqual(["idle", null]);
    }
  });

  test("with_no_steward_listed_she_sits_idle_whatever_the_cards_say_and_cannot_be_opened", () => {
    const t = town([house("alpha", [lead("a1", { stage: "needs_you", needs: "question", since: 5 })])], [card("a1", { state: "writing" })]);
    const queen = queenOf(t);
    expect([queen.state, queen.note, queen.id]).toEqual(["idle", null, null]);
  });

  test("with_a_steward_listed_the_queen_is_that_lead_wherever_its_folder_is", () => {
    const t = town([house("elsewhere", [steward()]), house("alpha", [lead("a1")])]);
    expect(of(place(t), "queen").map((q) => q.id)).toEqual(["st1"]);
  });

  test("the_queen_sits_on_the_forecourt_right_of_your_throne_and_lower", () => {
    const [you] = of(place(town([])), "you");
    const queen = queenOf(town([]));
    const [yu, yw] = castleLocal(you.at.x, you.at.z);
    const [qu, qw] = castleLocal(queen.at.x, queen.at.z);
    expect(qu).toBeGreaterThan(yu + 1);
    expect(Math.abs(qw - yw)).toBeLessThan(0.5);
    expect(onPlateau(you.at.x, you.at.z) && onPlateau(queen.at.x, queen.at.z)).toBe(true);
  });
});

describe("you", () => {
  test("you_sit_on_your_throne_in_the_chosen_preset_and_in_the_king_for_no_choice_or_an_unknown_one", () => {
    const chosen = of(place(town([], [], { avatar: "sage" })), "you");
    expect(chosen.map((y) => y.avatar)).toEqual(["sage"]);
    for (const avatar of [undefined, "no-such-avatar", "constructor"]) {
      expect(of(place(town([], [], { avatar })), "you").map((y) => y.avatar), String(avatar)).toEqual([avatarFor(undefined).id]);
    }
    expect(avatarFor(undefined).id).toBe("king");
  });

  test("you_are_placed_once_with_no_projects_and_stand_left_of_the_queen_behind_the_line", () => {
    const [you] = of(place(town([])), "you");
    const queen = queenOf(town([]));
    expect(castleLocal(you.at.x, you.at.z)[0]).toBeLessThan(castleLocal(queen.at.x, queen.at.z)[0]);
  });
});

describe("the steward's yard", () => {
  test("the_stewards_subagents_work_in_a_small_yard_beside_the_castle_on_the_plateau_and_clear_of_the_table", () => {
    const subs = Array.from({ length: 4 }, (_, i) => char(`y${i}`, { role: "implementer" }));
    const all = place(town([house("steward", [steward({}, subs)])]));
    const hats = of(all, "hat");
    expect(hats.map((h) => h.id).sort()).toEqual(["y0", "y1", "y2", "y3"]);
    for (const h of hats) {
      const [u, w] = castleLocal(h.at.x, h.at.z);
      expect(onPlateau(h.at.x, h.at.z), h.id).toBe(true);
      // Left of the table (which spans u -1.75 to 1.75) and in front of the castle, which ends at w = 2.
      expect(u, h.id).toBeLessThan(-1.75);
      expect(w, h.id).toBeGreaterThan(2);
      expect(w, h.id).toBeLessThan(HILL.edge);
    }
  });

  test("the_stewards_own_house_gets_no_building_unless_added_or_another_lead_works_there", () => {
    const lone = of(place(town([house("steward", [steward()])])), "building");
    expect(lone).toEqual([]);
    const added = of(place(town([house("steward", [steward()], { added: true })])), "building");
    expect(added).toHaveLength(1);
    const shared = of(place(town([house("steward", [steward(), lead("o1")])])), "building");
    expect(shared).toHaveLength(1);
  });
});
