import { describe, expect, test } from "vitest";
import { TONES } from "../../web/src/town/kit/clay.tsx";

const load = () => import("../../web/src/town/kit/avatars.ts");
const KIT_HATS = ["crown", "wizard", "toque", "pith", "straw", "beret", "tophat", "hardhat"];

describe("AVATARS", () => {
  test("there_are_eight_presets_each_with_its_own_id_label_and_look", async () => {
    const { AVATARS } = await load();
    expect(AVATARS).toHaveLength(8);
    for (const key of ["id", "label"] as const) expect(new Set(AVATARS.map((a) => a[key])).size, key).toBe(8);
    expect(new Set(AVATARS.map((a) => `${a.coat}|${a.skin}|${a.hat}`)).size).toBe(8);
    for (const a of AVATARS) {
      expect(a.id).toMatch(/^[a-z0-9-]{1,32}$/);
      expect(a.label.trim()).not.toBe("");
      expect(KIT_HATS).toContain(a.hat);
    }
  });

  test("the_first_preset_is_todays_king_with_the_crown_and_the_ribbon_coat", async () => {
    const { AVATARS } = await load();
    expect(AVATARS[0]).toMatchObject({ id: "king", hat: "crown", coat: TONES.ribbon });
  });

  test("the_presets_offer_at_least_three_skin_tones", async () => {
    const { AVATARS } = await load();
    expect(new Set(AVATARS.map((a) => a.skin)).size).toBeGreaterThanOrEqual(3);
  });
});

describe("avatarFor", () => {
  test("a_known_id_gives_that_preset", async () => {
    const { AVATARS, avatarFor } = await load();
    for (const a of AVATARS) expect(avatarFor(a.id)).toBe(a);
  });

  test("an_absent_unknown_or_object_key_id_falls_back_to_the_default_king", async () => {
    const { AVATARS, avatarFor } = await load();
    for (const id of [undefined, "", "no-such-avatar", "constructor", "__proto__", "KING"]) {
      expect(avatarFor(id), String(id)).toBe(AVATARS[0]);
    }
  });
});
