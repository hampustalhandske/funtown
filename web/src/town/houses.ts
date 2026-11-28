import type { House } from "../../../server/types.ts";
import { groundHeight, lotOf } from "./island.ts";
import type { Spot } from "./layout.ts";

/**
 * The toy-harbour house, as numbers: which of five looks a folder gets, which way each lot faces, and where the house's door,
 * pennant pole and chimney stand on the ground. Pure; the drawing is in `houseParts.ts`. A house's frame has its front wall on
 * +z, turned by the lot's `facing`; places in it are `[across, up, forward]`.
 */

/** The one feature that sets a house apart, picked by its folder. */
export const VARIANTS = ["porch", "dormer", "lean-to", "storey", "balcony"] as const;
export type Variant = (typeof VARIANTS)[number];

/** A 32-bit FNV-1a hash of `text`. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0)!, 0x01000193);
  return h >>> 0;
}

/** The feature of the house in folder `cwd`: the same folder always gets the same one, wherever its lot is. */
export const variantOf = (cwd: string): Variant => VARIANTS[hash(cwd) % VARIANTS.length];

const WALLS = ["#f1e6d2", "#efe2c8", "#e2cfa8", "#f3e6d6", "#e9dcc3", "#ddc7a4", "#f3ead8", "#e8dccb"];
const ROOFS = ["#c46a4e", "#5f7088", "#b59a5a", "#b8553f", "#6f7f96", "#a8614a", "#7d8a6a"];
/** The plaster and the tiles of the house in folder `cwd`. */
export const paintOf = (cwd: string) => ({ wall: WALLS[(hash(cwd) >>> 5) % WALLS.length], roof: ROOFS[(hash(cwd) >>> 11) % ROOFS.length] });

/** The two shores the houses look toward: the cove's middle, and the west lobe's inner shore. */
const HARBOURS: [number, number][] = [[4.6, 11], [-14, 6]];
/** What each of the first twelve lots looks at, with its own small turn: [x, z, turn]. */
const LOOKS: [number, number, number][] = [
  [5, 10, 0.1], [5, 10, -0.1], [5, 8, 0.05], [6, 12, 0], [8, 10, 0.1], [8, 13, -0.1],
  [5, 8, -0.05], [6, 8, 0.1], [-14, 6, 0.2], [-14, 6, -0.1], [-12, 6, 0.15], [12, 6, 0],
];

/** The yaw that turns the house on lot `i` to face its harbour, with a little jitter so the rows are never a grid. */
export function facingOf(i: number): number {
  const lot = lotOf(i);
  if (i < LOOKS.length) {
    const [x, z, turn] = LOOKS[i];
    return Math.atan2(x - lot.x, z - lot.z) + turn;
  }
  const [x, z] = [...HARBOURS].sort((a, b) => Math.hypot(a[0] - lot.x, a[1] - lot.z) - Math.hypot(b[0] - lot.x, b[1] - lot.z))[0];
  return Math.atan2(x - lot.x, z - lot.z) + (((i * 37) % 11) - 5) * 0.03;
}

/** The size of a house, which its variant changes: the plan, and how high the walls reach before the roof. */
export function planOf(variant: Variant) {
  const upper = variant === "storey" || variant === "balcony";
  const jetty = variant === "storey" ? 0.2 : 0;
  const [w, d, h1, h2] = [2.2, 1.9, 1.05, 0.95];
  const rw = upper ? w + 0.2 : w;
  const rd = d + jetty;
  return { upper, jetty, w, d, h1, h2, rw, rd, rz: jetty / 2, top: upper ? 0.25 + h1 + 0.1 + h2 : 0.25 + h1, rh: Math.min(1.35, rw * 0.6) };
}

/** The door's place in the house's frame: left of the front's middle, out past its step. */
export const DOOR = { across: -0.528, forward: 1.31 };

/** Where `local` ([across, up, forward] in the frame of a house at `at`, turned `facing`) is in the world, up from the ground there. */
export function houseToWorld({ at, facing }: { at: Spot; facing: number }, [across, up, forward]: [number, number, number]): { x: number; y: number; z: number } {
  const [sin, cos] = [Math.sin(facing), Math.cos(facing)];
  const [x, z] = [at.x + across * cos + forward * sin, at.z - across * sin + forward * cos];
  return { x, y: groundHeight(at.x, at.z) + up, z };
}

/** Where a house's front door is, a step out from the front wall, on the ground. */
export function doorOf(b: { at: Spot; facing: number }): Spot {
  const { x, z } = houseToWorld(b, [DOOR.across, 0, DOOR.forward]);
  return { x, z };
}
/** The foot of the house's pennant pole: on the roof's front left corner. */
export function pennantOf(b: { at: Spot; facing: number; variant: Variant }) {
  const p = planOf(b.variant);
  return houseToWorld(b, [-p.rw / 2 + 0.05, p.top + p.rh * 0.15, p.rz + p.rd / 2 + 0.2]);
}

/** Where the chimney's mouth is, which its smoke leaves from. */
export function chimneyOf(b: { at: Spot; facing: number; variant: Variant }) {
  const p = planOf(b.variant);
  return houseToWorld(b, [p.rw * 0.27, p.top + p.rh * 0.45 + 1.4, p.rz - p.rd * 0.2]);
}

/**
 * Whether anyone of `house` works, so its chimney puffs: a lead or a subagent of it with the stage working. The steward's
 * own work happens at the castle, so it never makes the folder it was started in busy.
 */
export function isBusy(house: House, steward?: string): boolean {
  return house.leads.some((lead) => lead.id !== steward && [lead, ...lead.subagents].some((c) => c.stage === "working"));
}
