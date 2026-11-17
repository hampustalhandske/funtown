import { describe, expect, test } from "vitest";
import { colourFor, hatFor, PALETTE } from "../../web/src/town/kit/palette.ts";

describe("hatFor", () => {
  test("every_listed_role_gets_its_own_hat_not_the_cap", () => {
    const roles = ["implementer", "test-writer", "explorer", "Explore", "Plan", "general-purpose", "ui-reviewer"];
    expect(Object.fromEntries(roles.map((r) => [r, hatFor(r)]))).toEqual({
      implementer: "hardhat",
      "test-writer": "toque",
      explorer: "pith",
      Explore: "pith",
      Plan: "wizard",
      "general-purpose": "straw",
      "ui-reviewer": "beret",
    });
  });

  test("any_other_reviewer_gets_the_top_hat", () => {
    expect(hatFor("code-reviewer")).toBe("tophat");
  });

  test("an_unknown_role_or_a_lead_without_one_gets_the_cap", () => {
    expect(hatFor("statusline-setup")).toBe("cap");
    expect(hatFor(undefined)).toBe("cap");
  });

  test("a_role_named_like_an_object_key_gets_the_cap_not_a_crash", () => {
    expect(hatFor("constructor")).toBe("cap");
  });
});

describe("colourFor", () => {
  test("every_colour_comes_from_the_palette_and_names_spread_over_it", () => {
    const seen = new Set(Array.from({ length: 200 }, (_, i) => colourFor(`project-${i}`)));
    for (const c of seen) expect(PALETTE).toContain(c);
    expect(seen.size).toBe(PALETTE.length);
  });
});
