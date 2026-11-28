import { CASTLE, HILL, hillLand, lawn, onHill, onPlateau, onStair, stairHeight } from "./hill.ts";
import { Color } from "three";
import { makeNoise, smooth } from "./noise.ts";

/**
 * The island: a natural cove in open sea, a west lobe and a lighthouse point, the harbour village round the cove and the
 * castle hill at the back. Pure: every height and colour comes from fixed numbers and seeded noise. +z faces the camera.
 */
const noise = makeNoise(61);

/** An ellipse on the ground: centre, radii and turn. */
type Ellipse = [x: number, z: number, rx: number, rz: number, turn?: number];
/** The land is the smooth union of these ellipses less the cuts, with a noisy edge. */
const BLOBS: Ellipse[] = [[2, -1, 25, 17, 0.1], [-15, 0, 8, 6.5, 0.5], [CASTLE.x + 1.5, CASTLE.z - 3.5, 15.5, 10, 0.1]];
/** The cove and its mouth. */
const CUTS: Ellipse[] = [[4.5, 10.5, 4.4, 3.6, 0.3], [5.5, 14.5, 2.2, 2.8]];
/** Round hills: centre, height, spread and squash. */
const HILLS = [[-9, -9, 2.6, 22, 1.5], [-16, 4, 1.0, 8, 1], [14, -6, 1.2, 10, 1]] as const;
/** How far the ground reaches from the middle: the terrain mesh and the sea's height texture cover twice this. */
export const REACH = 38;

/** A smooth minimum: `a` and `b` blended where they are within `k` of each other. */
function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function ellipse(x: number, z: number, [cx, cz, rx, rz, turn = 0]: Ellipse): number {
  const [c, s, dx, dz] = [Math.cos(turn), Math.sin(turn), x - cx, z - cz];
  return Math.hypot((dx * c - dz * s) / rx, (dx * s + dz * c) / rz);
}

/** About 1 on the shoreline, below 1 inland and above 1 out at sea. */
function coast(x0: number, z0: number): number {
  const x = x0 + 2 * noise(x0 * 0.07 + 11, z0 * 0.07 - 4, 3);
  const z = z0 + 2 * noise(x0 * 0.07 - 8, z0 * 0.07 + 13, 3);
  let d = 9;
  for (const blob of BLOBS) d = smin(d, ellipse(x, z, blob), 0.35);
  d += 0.45 * noise(x * 0.06 + 17, z * 0.06 - 9, 4);
  for (const cut of CUTS) d = -smin(-d, -(2 - ellipse(x, z, cut)), 0.3);
  return d * (1 + 0.03 * noise(x * 0.13 + 3, z * 0.13 - 2, 3) + 0.02 * noise(x * 0.45 - 6, z * 0.45 + 1, 2));
}

/** The terrain's height at (x, z): meadow a little above the sea, the hills, the castle hill, and the sea floor offshore. */
export function landHeight(x: number, z: number): number {
  const t = coast(x, z);
  const inland = smooth(1.03, 0.82, t);
  const sea = -0.9 - Math.min(3, Math.max(0, t - 1) * 5);
  let land = 0.32 + 0.32 * noise(x * 0.22, z * 0.22, 3) * (1 - smooth(0.86, 0.6, t));
  for (const [hx, hz, height, spread, squash] of HILLS) land += height * Math.exp(-((x - hx) ** 2 / squash + (z - hz) ** 2 * squash) / spread);
  return sea + (hillLand(x, z, land, noise) - sea) * inland;
}

/** The height things stand on at (x, z): a tread on the stair, the plateau's top on the forecourt, else the terrain. */
export function groundHeight(x: number, z: number): number {
  if (onStair(x, z)) return stairHeight(x, z);
  return onPlateau(x, z) ? HILL.top : landHeight(x, z);
}

const GROUND = {
  grass: new Color("#9fcd72"),
  grass2: new Color("#b3d67a"),
  dry: new Color("#c9d27f"),
  deep: new Color("#7fae5c"),
  hill: new Color("#86b864"),
  soil: new Color("#c7b48a"),
  rock: new Color("#b9ae9c"),
  rock2: new Color("#a0957f"),
  sand: new Color("#efdcaa"),
};
const paint = new Color();

/**
 * The ground's colour at (x, z), at height `h` where its normal points `up` (1 flat, toward 0 a cliff), as linear RGB:
 * meadow with dry patches, deeper green in hollows and on hills, bare soil and banded rock on steep faces, sand on low gentle
 * shores. The castle hill and its foot stay grass at any slope, deeper green where steep.
 */
export function groundColour(x: number, z: number, h: number, up: number): [number, number, number] {
  const c = paint.copy(GROUND.grass).lerp(GROUND.grass2, smooth(-0.3, 0.5, noise(x * 0.15 + 9, z * 0.15, 3)));
  c.lerp(GROUND.dry, 0.55 * smooth(0.15, 0.55, noise(x * 0.06 - 3, z * 0.06 + 8, 3)));
  c.lerp(GROUND.deep, 0.5 * smooth(0.1, 0.5, noise(x * 0.21 + 2, z * 0.21 - 5, 2)));
  c.lerp(GROUND.hill, smooth(1.0, 3.0, h));
  const grass = lawn(x, z);
  const steep = smooth(0.86, 0.62, up);
  c.lerp(GROUND.soil, Math.min(steep * 2.2, 1) * 0.5 * (1 - smooth(0.6, 1.5, h)) * (1 - grass));
  c.lerp(Math.floor(h * 2.2) & 1 ? GROUND.rock : GROUND.rock2, smooth(0.8, 0.66, up) * (1 - grass));
  c.lerp(GROUND.deep, 0.6 * steep * grass);
  c.lerp(GROUND.sand, smooth(0.26, 0.14, h) * smooth(0.7, 0.88, up));
  return [c.r, c.g, c.b];
}

/** The village square, the default view's middle, at the stair's foot. */
export const SQUARE = { x: 4.6, z: 1.4, radius: 1.8 };
/** The quay along the cove's north shore, from one end to the other; no lot sits on it. */
const QUAY = { from: { x: 1.5, z: 5.0 }, to: { x: 10.0, z: 5.6 } };

/**
 * The island's named lots, in the order houses take them. The first twelve make the harbour village round the square and on
 * the slope above the quay, with a hamlet on the west lobe; the rest spread over the open meadow and the farmland in the east.
 */
const LOTS: [x: number, z: number][] = [
  [-1.0, 4.2], [9.6, 3.4], [0.9, -1.3], [12.8, 5.2], [-3.4, 9.4], [-3.2, 13.2],
  [9.3, -1.5], [11.8, 0.6], [-15.0, 0.2], [-18.0, 3.2], [-12.0, -2.8], [16.2, -2.2],
  [-4.5, -1.0], [-6.5, 2.0], [-4.5, 5.5], [15.5, 1.5], [-8.5, -1.0], [-8.5, 5.0],
  [17.5, 4.5], [-6.5, -4.0], [19.5, -0.5], [-7.0, 8.5], [11.5, 9.0], [-18.5, -1.5], [0.0, 15.0],
];

/** Whether a house could stand at (x, z): meadow or a low hill, clear of the shore, the castle hill, the stair, the square and the quay. */
function open(x: number, z: number): boolean {
  const h = landHeight(x, z);
  if (h < 0.3 || h > 2 || onHill(x, z) || onStair(x, z) || Math.hypot(x - SQUARE.x, z - SQUARE.z) < SQUARE.radius + 1.8) return false;
  if (x > QUAY.from.x - 1 && x < QUAY.to.x + 1 && z > QUAY.from.z - 1) return false;
  for (let a = 0; a < 2 * Math.PI; a += Math.PI / 6) {
    const [px, pz] = [x + 1.4 * Math.cos(a), z + 1.4 * Math.sin(a)];
    if (landHeight(px, pz) < 0.2 || onHill(px, pz) || onStair(px, pz)) return false;
  }
  return true;
}

/** Every lot handed out so far: the named ones, then the fallback rows as they are needed. */
const lots: { x: number; z: number }[] = LOTS.map(([x, z]) => ({ x, z }));
/** The spacing of the fallback rows now being filled; each pass is half as wide and fills the gaps the last one left. */
let spacing = 2.6;

/**
 * The lot of the i-th house in town order. Past the named lots come fallback rows on the open meadow, row by row from the
 * back of the island, each lot at least the rows' spacing from every lot before it; when a spacing runs out, the next pass
 * fills the gaps at half of it. The same i always gives the same lot.
 */
export function lotOf(i: number): { x: number; z: number } {
  while (i >= lots.length) {
    const before = lots.length;
    for (let z = -REACH; z <= REACH; z += spacing) {
      for (let x = -REACH; x <= REACH; x += spacing) {
        if (open(x, z) && lots.every((l) => Math.hypot(l.x - x, l.z - z) >= spacing)) lots.push({ x, z });
      }
    }
    if (lots.length === before) spacing /= 2;
  }
  return lots[i];
}
