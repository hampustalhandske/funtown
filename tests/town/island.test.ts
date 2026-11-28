import { describe, expect, test } from "vitest";
import { HILL, castleAt, onHill } from "../../web/src/town/hill.ts";
import { groundColour, groundHeight, landHeight } from "../../web/src/town/island.ts";

/** Whether a ground colour reads as grass: green above both red and blue. */
const grassy = ([r, g, b]: [number, number, number]) => g > r && g > b;

describe("the castle hill", () => {
  test("the_ground_on_the_stair_rises_sixteen_even_steps_from_its_foot_to_the_forecourt", () => {
    const heights: number[] = [];
    // Up the stair's middle line in small strides, from just inside its foot to a little way onto the forecourt.
    for (let w = HILL.stair.foot - 0.01; w >= HILL.edge - 1; w -= 0.02) {
      const h = groundHeight(...castleAt(0, w));
      if (heights.length === 0 || Math.abs(h - heights[heights.length - 1]) > 1e-9) heights.push(h);
    }
    const rises = heights.slice(1).map((h, i) => h - heights[i]);
    expect(rises).toHaveLength(16);
    for (const rise of rises) expect(rise).toBeCloseTo(0.24, 9);
    expect(heights[heights.length - 1]).toBeCloseTo(4.2, 9);
  });

  test("the_castle_hill_is_painted_grass_at_any_slope_while_a_steep_face_elsewhere_is_rock", () => {
    const hill: [number, number][] = [];
    const meadow: [number, number][] = [];
    for (let z = -24; z <= 6; z += 0.75) {
      for (let x = -24; x <= 24; x += 0.75) {
        if (landHeight(x, z) > 0.3) (onHill(x, z) ? hill : meadow).push([x, z]);
      }
    }
    expect(hill.length).toBeGreaterThan(100);
    // Upright to a cliff: every slope on the hill stays green.
    for (const up of [1, 0.85, 0.7, 0.5, 0.3]) {
      for (const [x, z] of hill) expect(grassy(groundColour(x, z, groundHeight(x, z), up)), `(${x}, ${z}) at up ${up}`).toBe(true);
    }
    // The same cliff off the hill is bare rock somewhere.
    expect(meadow.some(([x, z]) => !grassy(groundColour(x, z, landHeight(x, z), 0.5)))).toBe(true);
  });
});
