import { describe, expect, test } from "vitest";
import { lightAt } from "../../web/src/town/light.ts";

/** The light at a local clock time on one fixed day. */
const at = (h: number, m = 0, s = 0) => lightAt(new Date(2026, 10, 28, h, m, s));
const channel = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
/** How blue a colour reads next to how red it is: positive for a night's deep blue, negative for orange. */
const blueness = (hex: string) => channel(hex, 2) - channel(hex, 0);

describe("the bands", () => {
  test("night_holds_until_six_dawn_runs_to_seven_day_to_seven_in_the_evening_dusk_to_eight_then_night", () => {
    const bands: [number, number, string][] = [[0, 0, "night"], [5, 59, "night"], [6, 0, "dawn"], [6, 59, "dawn"], [7, 0, "day"], [12, 0, "day"], [18, 59, "day"], [19, 0, "dusk"], [19, 59, "dusk"], [20, 0, "night"], [23, 59, "night"]];
    for (const [h, m, band] of bands) expect(at(h, m).band, `${h}:${m}`).toBe(band);
  });

  test("daylight_is_nothing_at_night_and_full_by_day_and_half_at_sunrise_and_at_sunset", () => {
    expect(at(0).day).toBe(0);
    expect(at(6, 0).day).toBe(0);
    expect(at(6, 30).day).toBeCloseTo(0.5, 9);
    expect(at(7, 0).day).toBe(1);
    expect(at(13, 0).day).toBe(1);
    expect(at(19, 0).day).toBe(1);
    expect(at(19, 30).day).toBeCloseTo(0.5, 9);
    expect(at(20, 0).day).toBe(0);
    expect(at(22, 0).day).toBe(0);
  });

  test("the_light_is_continuous_across_every_band_edge", () => {
    // A jump at an edge would show as a pop once a minute; the sky, the key light and the lamps all stay within a hair.
    for (const [h, m] of [[6, 0], [7, 0], [19, 0], [20, 0]]) {
      const [before, after] = [at(h, m - 1, 59), at(h, m, 0)];
      expect(Math.abs(before.day - after.day)).toBeLessThan(0.02);
      expect(Math.abs(before.lamps - after.lamps)).toBeLessThan(0.05);
      expect(Math.abs(before.key.intensity - after.key.intensity)).toBeLessThan(0.1);
      expect(Math.abs(before.key.from[0] - after.key.from[0])).toBeLessThan(0.05);
    }
  });
});

describe("windows and lamps", () => {
  test("they_are_lit_from_dusk_to_dawn_and_dark_by_day", () => {
    expect(at(13, 0).lamps).toBe(0);
    expect(at(7, 0).lamps).toBe(0);
    expect(at(19, 0).lamps).toBe(0);
    expect(at(19, 15).lamps).toBeGreaterThan(0);
    expect(at(19, 30).lamps).toBe(1);
    expect(at(20, 0).lamps).toBe(1);
    expect(at(23, 0).lamps).toBe(1);
    expect(at(3, 0).lamps).toBe(1);
    expect(at(6, 30).lamps).toBe(1);
    expect(at(6, 45).lamps).toBeGreaterThan(0);
    expect(at(6, 45).lamps).toBeLessThan(1);
  });
});

describe("the sky and the sea", () => {
  test("by_day_the_sky_is_blue_and_the_shallows_turquoise", () => {
    const noon = at(13, 0);
    expect(noon.sky.top).toBe("#56a2e6");
    expect(noon.sea.shallow).toBe("#82d8d2");
    expect(noon.stars).toBe(0);
    expect(noon.sea.light).toBe(1);
  });

  test("at_sunset_the_horizon_is_orange_and_at_night_the_sky_is_a_deep_blue_with_stars", () => {
    const dusk = at(19, 30);
    expect(blueness(dusk.sky.horizon)).toBeLessThan(0);
    const night = at(23, 0);
    expect(blueness(night.sky.top)).toBeGreaterThan(40);
    expect(channel(night.sky.top, 2)).toBeLessThan(90);
    expect(night.stars).toBe(1);
    expect(night.sky.night).toBe(1);
    expect(night.sea.light).toBeLessThan(1);
  });

  test("the_moon_shows_only_at_night_and_the_stars_fade_in_with_the_dark", () => {
    expect(at(13, 0).sky.night).toBe(0);
    expect(at(23, 0).sky.night).toBe(1);
    expect(at(19, 30).stars).toBeGreaterThan(0);
    expect(at(19, 30).stars).toBeLessThan(1);
    expect(at(7, 0).stars).toBe(0);
  });
});

describe("the key light", () => {
  test("it_always_comes_from_the_viewers_side_and_never_from_below", () => {
    for (let m = 0; m < 24 * 60; m += 5) {
      const { key, sky } = at(Math.floor(m / 60), m % 60);
      expect(key.from[2], `${m}`).toBeGreaterThan(0);
      expect(key.from[1], `${m}`).toBeGreaterThan(0);
      expect(Math.hypot(...key.from)).toBeCloseTo(1, 9);
      // The sun and the moon as drawn in the sky are in front of the camera, which looks away from the viewer's side.
      expect(sky.sun[2]).toBeLessThan(0);
      expect(sky.moon[2]).toBeLessThan(0);
    }
  });

  test("the_sun_crosses_from_the_east_in_the_morning_to_the_west_in_the_evening_and_is_highest_at_midday", () => {
    // From 07:00 to 19:00 the key light is the sun alone.
    const [rise, noon, set] = [at(7, 0), at(13, 0), at(19, 0)];
    expect(rise.key.from[0]).toBeLessThan(noon.key.from[0]);
    expect(noon.key.from[0]).toBeLessThan(set.key.from[0]);
    expect(noon.key.from[1]).toBeGreaterThan(rise.key.from[1]);
    expect(noon.key.from[1]).toBeGreaterThan(set.key.from[1]);
  });

  test("it_is_bright_and_warm_white_by_day_dimmer_and_blue_at_night", () => {
    expect(at(13, 0).key.intensity).toBe(2.5);
    expect(at(23, 0).key.intensity).toBeLessThan(1);
    expect(blueness(at(23, 0).key.colour)).toBeGreaterThan(0);
  });
});
