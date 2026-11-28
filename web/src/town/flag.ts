import { BufferAttribute, Color, CylinderGeometry, PlaneGeometry, SphereGeometry, TorusGeometry, type BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { QUEEN_TEAL } from "./folk-dress.ts";
import { HEAD, TABLE } from "./court.ts";
import { castleAt, CASTLE_TURN, HILL } from "./hill.ts";
import { planOf, houseToWorld, type Variant } from "./houses.ts";
import type { PartList } from "./parts.tsx";

/**
 * The ask flag: a ship's signal flag, white at the hoist and crimson at the fly, so it never reads as fire's red-orange. In its
 * own frame the grip is the origin, the pole runs up +y and the cloth hangs from the pole's top toward +x. The waved cloth
 * ripples by moving its points on the CPU each frame; a still one keeps a soft fixed curve. Also the still house flag and the
 * slip laid on the table, as parts.
 */

/** The ask's crimson, and the white of its hoist. */
export const ASK_RED = "#d6283f";
export const HOIST = "#f7f4ee";
const WOOD = "#7a5a42";
const GOLD = "#e8b84a";

/** The flag a character in the line carries: its cloth, how far the pole reaches above the grip and below it. */
export const HAND_FLAG = { w: 1.35, h: 0.88, pole: 2.2, butt: 0.35 } as const;
/** The small flag by a house's pennant: its cloth and its pole. */
export const HOUSE_FLAG = { w: 1.0, h: 0.66, pole: 2.3 } as const;

/** A strip of the cloth from `a` to `b` of its width, in `colour`, with enough points across to ripple. */
function strip(a: number, b: number, colour: string): BufferGeometry {
  const { w, h } = HAND_FLAG;
  const width = (b - a) * w;
  const geometry = new PlaneGeometry(width, h, Math.max(4, Math.round(16 * (b - a))), 6).translate(a * w + width / 2, -h / 2, 0);
  const c = new Color(colour);
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(geometry.attributes.position.count * 3).map((_, i) => [c.r, c.g, c.b][i % 3]), 3));
  return geometry;
}

/** A new cloth of the hand flag, hanging from the pole's top, white then crimson meeting on a straight line; its points start flat. */
export function clothGeometry(): BufferGeometry {
  const cloth = mergeGeometries([strip(0, 0.5, HOIST), strip(0.5, 1, ASK_RED)])!.translate(0, HAND_FLAG.pole - 0.02, 0);
  cloth.userData.flat = Float32Array.from(cloth.attributes.position.array);
  return cloth;
}

/**
 * Moves `cloth`'s points (made by `clothGeometry`): waving at time `t` (seconds), travelling ripples strongest at the fly and
 * a little droop; else the still shape, a soft fixed curve.
 */
export function shapeCloth(cloth: BufferGeometry, wave: boolean, t = 0) {
  const flat = cloth.userData.flat as Float32Array;
  const position = cloth.attributes.position;
  const { w } = HAND_FLAG;
  for (let i = 0; i < position.count; i++) {
    const [x, y] = [flat[i * 3], flat[i * 3 + 1]];
    const f = x / w;
    const z = wave ? 0.2 * f * Math.sin(f * 7.5 - t * 7) + 0.07 * f * Math.sin(f * 13 - t * 11 + y * 2) : 0.06 * f * Math.sin(f * 5);
    position.setXYZ(i, x, y - (wave ? 0.05 * f * f : 0), z);
  }
  position.needsUpdate = true;
  cloth.computeVertexNormals();
}

/** `g` coloured `colour` by its points, without texture coordinates, so geometries made apart merge. */
function paint(g: BufferGeometry, colour: string): BufferGeometry {
  const c = new Color(colour);
  g.setAttribute("color", new BufferAttribute(new Float32Array(g.attributes.position.count * 3).map((_, i) => [c.r, c.g, c.b][i % 3]), 3));
  return g.deleteAttribute("uv");
}

/**
 * The cloth furled: rolled up round the top of the pole, white above and crimson below, tied with a gold cord. Hangs from the
 * pole's top as the cloth does.
 */
export function furledGeometry(): BufferGeometry {
  const { h, pole } = HAND_FLAG;
  const roll = (radius: number, length: number, at: number, colour: string) => paint(new CylinderGeometry(radius, radius * 0.7, length, 10).translate(0, pole - 0.02 - at, 0), colour);
  return mergeGeometries([
    roll(0.085, h * 0.55, h * 0.275, HOIST),
    roll(0.075, h * 0.45, h * 0.775, ASK_RED),
    paint(new TorusGeometry(0.09, 0.018, 6, 14).rotateX(Math.PI / 2).translate(0, pole - 0.02 - h * 0.4, 0), GOLD),
  ])!;
}

/** The pole from the butt to its top and the gold knob on it, as one geometry coloured by its points. */
export function poleGeometry(): BufferGeometry {
  const { pole, butt } = HAND_FLAG;
  return mergeGeometries([
    paint(new CylinderGeometry(0.035, 0.04, pole + butt, 8).translate(0, (pole - butt) / 2, 0), WOOD),
    paint(new SphereGeometry(0.075, 10, 8).translate(0, pole + 0.04, 0), GOLD),
  ])!;
}

/** What a house flag is put by: where the house stands, which way it faces and its look. */
type FlagHouse = { at: { x: number; z: number }; facing: number; variant: Variant };

/**
 * A house's flag, still, as parts: on its own pole just outside the pennant's roof corner, the cloth flying out over the gable
 * end, white at the pole and crimson at the fly.
 */
export function houseFlagParts(list: PartList, house: FlagHouse) {
  const p = planOf(house.variant);
  const { w, h, pole } = HOUSE_FLAG;
  const foot = houseToWorld(house, [-p.rw / 2 - 0.15, p.top + p.rh * 0.1, p.rz + p.rd / 2 - 0.25]);
  list.at(foot.x, foot.y, foot.z, house.facing);
  list.put("cyl", [0, pole / 2, 0], { s: [0.07, pole, 0.07], c: WOOD });
  list.put("sph", [0, pole + 0.04, 0], { s: 0.13, c: GOLD });
  for (const [k, c] of [[0, HOIST], [1, ASK_RED]] as const) list.put("box", [-(k + 0.5) * (w / 2) - 0.03, pole - h / 2, 0], { s: [w / 2, h, 0.025], c });
}

/** How far to the right of the head the slip lies, so the head's body doesn't hide it from the camera. */
const SLIP_BESIDE = 0.45;

/**
 * The head's slip laid on the table before your throne, its seal toward the head, in its project's `colour`; with the Queen's
 * `note` lying on it, sealed in her teal.
 */
export function tableSlipParts(list: PartList, colour: string, note: boolean) {
  const [x, z] = castleAt(HEAD.u + SLIP_BESIDE, TABLE.w - 0.12);
  list.at(x, HILL.top + TABLE.top + 0.012, z, CASTLE_TURN);
  list.put("box", [0, 0, 0], { s: [0.5, 0.02, 0.62], c: "#fbf6ea" });
  list.put("cyl", [-0.12, 0.012, 0.16], { s: [0.1, 0.02, 0.1], c: colour });
  if (!note) return;
  // Her note lies across the slip's near right corner, toward the viewer, so the head's body never hides it.
  list.put("box", [0.1, 0.02, 0.12], { r: [0, 0.18, 0], s: [0.42, 0.02, 0.34], c: "#fffdf6" });
  list.put("cyl", [0.1, 0.032, 0.14], { s: [0.16, 0.02, 0.16], c: QUEEN_TEAL });
}
