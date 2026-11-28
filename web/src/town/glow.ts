import { Vector3 } from "three";
import type { Part } from "./parts.tsx";

/** Where one glow sprite sits and how wide it is, in world units. */
export type Spot = { x: number; y: number; z: number; size: number };

/** How far out from its wall a window's glow sits, so the wall never hides it. */
const OUT = 0.14;
/** A window's glow is this many times its larger side wide, a lantern's or the lighthouse's lamp this many. */
const WINDOW_WIDTH = 2.6;
const LAMP_WIDTH = 8;
/** Sizes are rounded to this step, so all the glows fall into a few sizes and are drawn in a few batches. */
const STEP = 0.4;

const scratch = new Vector3();

/**
 * The glow for every pane in `parts`: a flat window glows a little out from its wall, along the way it faces; a deep pane (a
 * lantern, the lighthouse's lamp room) glows where it is, and wider for its size. Other parts give none.
 */
export function glowSpots(parts: Part[]): Spot[] {
  const spots: Spot[] = [];
  for (const { kind, matrix } of parts) {
    if (kind !== "pane") continue;
    const at = new Vector3().setFromMatrixPosition(matrix);
    const [sx, sy, sz] = [matrix.elements.slice(0, 3), matrix.elements.slice(4, 7), matrix.elements.slice(8, 11)].map((c) => Math.hypot(c[0], c[1], c[2]));
    const flat = sz < 0.1;
    if (flat) at.addScaledVector(scratch.setFromMatrixColumn(matrix, 2).normalize(), OUT);
    const size = Math.max(sx, sy) * (flat ? WINDOW_WIDTH : LAMP_WIDTH);
    spots.push({ x: at.x, y: at.y, z: at.z, size: Math.round(size / STEP) * STEP });
  }
  return spots;
}
