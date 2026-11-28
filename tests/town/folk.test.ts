import { describe, expect, test } from "vitest";
import type { Character, Lead, Town } from "../../server/types.ts";
import { urgencyList } from "../../web/src/needs.tsx";
import { costumeOf, departed } from "../../web/src/town/folk.ts";
import { layout } from "../../web/src/town/layout.ts";
import { SQUARE } from "../../web/src/town/island.ts";

const char = (id: string, over: Partial<Character> = {}): Character => ({ id, name: id, stage: "working", activity: null, step: null, ...over });
const lead = (id: string, subagents: Character[]): Lead => ({
  ...char(id), cwd: "/work/app", tty: null, termProgram: null, kind: "terminal", shortId: null, subagents,
});
const town = (subagents: Character[]): Town => ({
  houses: [{ project: "app", cwd: "/work/app", leads: [lead("l1", subagents)], parcels: [{ number: 1, title: "PR", url: "https://example.test/1", draft: false, checks: "none" }] }],
  cards: [],
  started: 1,
  claude: { version: "2.1.325", problems: [] },
});
const place = (t: Town) => layout(t, urgencyList(t, 0), 0, false);
const toSquare = (p: { x: number; z: number }) => Math.hypot(p.x - SQUARE.x, p.z - SQUARE.z);

describe("departed", () => {
  const working = place(town([char("helper", { role: "implementer" })]));
  const finished = place(town([char("helper", { role: "implementer", stage: "done" })]));

  test("a_finished_subagent_walks_off_toward_the_square_in_its_costume_and_is_gone_at_2_5_seconds", () => {
    const was = working.find((p) => p.kind === "hat")!;
    const now = 10_000;
    const shown = departed(working, finished, now);
    const leaving = shown.find((p) => p.kind === "hat")!;
    expect(leaving).toMatchObject({ id: "helper", pose: "leave", animal: "beaver", leftAt: now });
    expect(toSquare(leaving.at), "down the lane, toward the square").toBeLessThan(toSquare(was.at) - 2);
    expect(departed(shown, finished, now + 2499).some((p) => p.kind === "hat")).toBe(true);
    expect(departed(departed(shown, finished, now + 2499), finished, now + 2500).some((p) => p.kind === "hat")).toBe(false);
  });

  test("a_leaver_keeps_the_time_it_left_and_the_spot_it_walks_to_across_frames", () => {
    const first = departed(working, finished, 1_000);
    const later = departed(first, finished, 2_000);
    expect(later.find((p) => p.kind === "hat")).toEqual(first.find((p) => p.kind === "hat"));
  });

  test("everyone_still_placed_is_drawn_once_and_a_gone_house_or_parcel_is_never_kept", () => {
    expect(departed(working, working, 0)).toEqual(working);
    const empty: typeof working = [];
    expect(departed(working, empty, 0).map((p) => p.kind)).toEqual(["lead", "hat"]);
  });
});

describe("costumeOf", () => {
  test("a_lead_is_a_cat_in_the_captains_cap_with_scarf_and_apron_whatever_its_role", () => {
    expect(costumeOf(undefined, true)).toEqual({ animal: "cat", hat: "captain", clothes: ["scarf", "apron"] });
    expect(costumeOf("implementer", true)).toEqual({ animal: "cat", hat: "captain", clothes: ["scarf", "apron"] });
  });

  test("each_named_role_is_its_own_animal_in_its_hat_and_clothes", () => {
    expect(costumeOf("implementer", false)).toEqual({ animal: "beaver", hat: "hardhat", clothes: ["toolbelt"] });
    expect(costumeOf("explorer", false)).toEqual({ animal: "hare", hat: "pith", clothes: ["pack"] });
    expect(costumeOf("test-writer", false)).toEqual({ animal: "hedgehog", hat: "toque", clothes: ["white-apron"] });
    expect(costumeOf("reviewer", false)).toEqual({ animal: "owl", hat: "tophat", clothes: [] });
  });

  test("an_unnamed_type_is_the_nearest_animal_in_its_own_types_hat_with_no_clothes", () => {
    expect(costumeOf("general-purpose", false)).toEqual({ animal: "beaver", hat: "straw", clothes: [] });
    expect(costumeOf("Explore", false)).toEqual({ animal: "hare", hat: "pith", clothes: [] });
    expect(costumeOf("Plan", false)).toEqual({ animal: "hare", hat: "wizard", clothes: [] });
    expect(costumeOf("ui-reviewer", false)).toEqual({ animal: "owl", hat: "beret", clothes: [] });
    expect(costumeOf("code-reviewer", false)).toEqual({ animal: "owl", hat: "tophat", clothes: [] });
    expect(costumeOf("e2e-tester", false)).toEqual({ animal: "hedgehog", hat: "cap", clothes: [] });
  });

  test("an_unknown_or_untyped_subagent_is_a_beaver_in_the_cap", () => {
    expect(costumeOf("statusline-setup", false)).toEqual({ animal: "beaver", hat: "cap", clothes: [] });
    expect(costumeOf(undefined, false)).toEqual({ animal: "beaver", hat: "cap", clothes: [] });
  });
});
