import { smooth } from "./noise.ts";

/**
 * The castle hill: a higher all-grass hill at the back of the island, its plateau holding the castle and the forecourt, climbed
 * by one straight grand stair from the village square. Every number about its shape is here, so it is tuned in one place.
 * Places on it are in the castle's own frame: `u` across (right as seen from the village) and `w` forward (toward the
 * village), with the castle at u = 0, w = 0.
 */
export const CASTLE = { x: 6.0, z: -12.4 };
/** The castle's turn about the vertical: it looks down its stair toward the harbour. */
export const CASTLE_TURN = Math.atan2(4.6 - CASTLE.x, 6.0 - CASTLE.z);

const top = 4.2;
const deep = 4.8;
const setBack = 1.8;
const foot = 12.1;
export const HILL = {
  /** The plateau's height. */
  top,
  /** The plateau's half-width across and half-depth; a rounded rectangle, so the forecourt is wide at the front. */
  across: 5.0,
  deep,
  /** How far the castle stands behind the plateau's middle, which leaves the forecourt in front of it. */
  setBack,
  /** The forecourt's front edge, where the stair arrives. */
  edge: setBack + deep,
  /** How far the slope runs out beyond the plateau: in front, and behind and at the sides. */
  skirtFront: 5.0,
  skirtBack: 8.5,
  /** The grand stair on the castle's axis: its width, where its foot is, and its even steps up to the plateau. */
  stair: { width: 2.3, foot, rise: 0.24, steps: 16 },
} as const;

const [sin, cos] = [Math.sin(CASTLE_TURN), Math.cos(CASTLE_TURN)];

/** The world point [x, z] of a place in the castle's frame. */
export const castleAt = (u: number, w: number): [number, number] => [CASTLE.x + cos * u + sin * w, CASTLE.z - sin * u + cos * w];
/** The castle-frame place [u, w] of a world point. */
export function castleLocal(x: number, z: number): [number, number] {
  const [dx, dz] = [x - CASTLE.x, z - CASTLE.z];
  return [dx * cos - dz * sin, dx * sin + dz * cos];
}

/** How deep one tread is: the stair's run shared by its steps. */
export const TREAD = (HILL.stair.foot - HILL.edge) / HILL.stair.steps;
/** The bottom tread's height: the last of the steps lands level with the plateau. */
const BASE = HILL.top - HILL.stair.steps * HILL.stair.rise;
/** The height of the stair's i-th tread from its foot (0 is the bottom one). */
export const treadHeight = (i: number) => BASE + i * HILL.stair.rise;

/** How far (u, w) lies outside the plateau's rounded rectangle; negative inside. */
function outside(u: number, w: number): number {
  const { across, deep } = HILL;
  return ((Math.abs(u / across) ** 3 + Math.abs((w - HILL.setBack) / deep) ** 3) ** (1 / 3) - 1) * Math.min(across, deep);
}

/** How far the slope runs out beyond the plateau at (u, w): short in front, long behind and at the sides. */
function skirt(u: number, w: number): number {
  const front = smooth(HILL.setBack, HILL.edge + 1.5, w) * smooth(HILL.across + 2, HILL.across - 1, Math.abs(u));
  return HILL.skirtBack + (HILL.skirtFront - HILL.skirtBack) * front;
}

/** Whether (x, z) is on the stair's treads. */
export function onStair(x: number, z: number): boolean {
  const [u, w] = castleLocal(x, z);
  return Math.abs(u) <= HILL.stair.width / 2 && w > HILL.edge && w <= HILL.stair.foot;
}

/** Whether (x, z) is on the plateau, whose ground is flat at its top. */
export function onPlateau(x: number, z: number): boolean {
  return outside(...castleLocal(x, z)) <= 0;
}

/** The stair's tread height under (x, z), which must be on the stair. */
export function stairHeight(x: number, z: number): number {
  const w = castleLocal(x, z)[1];
  return treadHeight(Math.min(HILL.stair.steps - 1, Math.floor((HILL.stair.foot - w) / TREAD)));
}

/**
 * The hill's own ground height at (x, z), given the island's `land` there and its `noise`, or `land` where that is higher.
 * The slope is an S-shaped skirt, wider behind than in front, roughened by `noise` everywhere but on the plateau; the ground
 * under the stair follows its line a step lower, so treads stand on it and no grass pokes through.
 */
export function hillLand(x: number, z: number, land: number, noise: (x: number, z: number, octaves?: number) => number): number {
  const [u, w] = castleLocal(x, z);
  const out = outside(u, w);
  const e = out + 0.35 * noise(x * 0.18 + 5, z * 0.18 - 3, 2) * smooth(0, 1, out);
  let height = HILL.top * smooth(skirt(u, w), 0, e);
  const s = HILL.stair;
  if (w > HILL.edge && w < s.foot + 1.2) {
    const k = smooth(s.width / 2 + 1.6, s.width / 2 + 0.3, Math.abs(u)) * smooth(s.foot + 1.2, s.foot, w);
    const line = treadHeight(Math.max(0, Math.min(s.steps - 1, Math.floor((s.foot - w) / TREAD)))) - s.rise - 0.06;
    height += (Math.min(height, line) - height) * k;
  }
  return Math.max(land, height);
}

/** Whether (x, z) is on the castle hill: its plateau or the slope where the hill lifts the ground above a quarter of its top. */
export function onHill(x: number, z: number): boolean {
  const [u, w] = castleLocal(x, z);
  return smooth(skirt(u, w), 0, outside(u, w)) > 0.25;
}

/** 1 on the castle hill and its foot, whose ground is painted grass at any slope, fading to 0 beyond. */
export function lawn(x: number, z: number): number {
  return smooth(HILL.skirtBack + 1.5, HILL.skirtBack - 0.5, outside(...castleLocal(x, z)));
}
