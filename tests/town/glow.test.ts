import { describe, expect, test } from "vitest";
import { glowSpots } from "../../web/src/town/glow.ts";
import { PartList } from "../../web/src/town/parts.tsx";
import { village } from "../../web/src/town/village.ts";
import { houseParts } from "../../web/src/town/houseParts.ts";

describe("where the glow sprites go", () => {
  test("only_window_panes_and_lantern_panes_glow", () => {
    const list = new PartList();
    list.put("box", [0, 0, 0]);
    list.put("pane", [1, 2, 3], { s: [0.4, 0.4, 0.04] });
    list.put("cone", [4, 0, 0]);
    expect(glowSpots(list.parts)).toHaveLength(1);
  });

  test("a_flat_window_glows_a_little_out_from_its_wall_whichever_way_the_house_faces", () => {
    const list = new PartList();
    list.at(10, 0, 20, Math.PI / 2);
    list.put("pane", [0, 1, 0], { s: [0.4, 0.4, 0.04] });
    const [spot] = glowSpots(list.parts);
    // A house turned a quarter turn faces along +x: the glow is in front of the pane there, not behind it.
    expect(spot.x).toBeGreaterThan(10.05);
    expect(spot.x).toBeLessThan(10.5);
    expect(spot.y).toBeCloseTo(1, 9);
    expect(spot.z).toBeCloseTo(20, 9);
  });

  test("a_lantern_glows_where_it_hangs_and_wider_than_a_window", () => {
    const list = new PartList();
    list.put("pane", [0, 1.3, 0], { s: [0.22, 0.26, 0.22] });
    list.put("pane", [0, 1, 0], { s: [0.4, 0.42, 0.04] });
    const [lantern, window] = glowSpots(list.parts);
    expect([lantern.x, lantern.y, lantern.z]).toEqual([0, 1.3, 0]);
    expect(lantern.size).toBeGreaterThan(window.size);
  });

  test("the_village_has_a_glow_for_every_lamp_and_the_lighthouse_shines_widest", () => {
    const spots = glowSpots(village().parts.parts);
    const panes = village().parts.parts.filter((p) => p.kind === "pane");
    expect(spots).toHaveLength(panes.length);
    expect(spots.length).toBeGreaterThanOrEqual(5);
    const widest = spots.reduce((a, b) => (b.size > a.size ? b : a));
    expect(widest.y).toBeGreaterThan(3);
    expect(spots.filter((s) => s.size === widest.size)).toHaveLength(1);
  });

  test("a_house_lights_every_window_it_has", () => {
    const list = new PartList();
    houseParts(list, { cwd: "/work/demo", colour: "#c46a4e", at: { x: 0, z: 0 }, facing: 0, variant: "storey" });
    expect(glowSpots(list.parts)).toHaveLength(list.parts.filter((p) => p.kind === "pane").length);
    expect(glowSpots(list.parts).length).toBeGreaterThanOrEqual(4);
  });

  test("sizes_come_in_a_few_steps_so_the_glows_draw_in_a_few_batches", () => {
    const list = new PartList();
    houseParts(list, { cwd: "/work/demo", colour: "#c46a4e", at: { x: 0, z: 0 }, facing: 0, variant: "balcony" });
    for (const part of village().parts.parts) list.parts.push(part);
    const sizes = new Set(glowSpots(list.parts).map((s) => s.size));
    expect(sizes.size).toBeLessThanOrEqual(8);
  });
});
