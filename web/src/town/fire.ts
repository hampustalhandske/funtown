import type { House } from "../../../server/types.ts";
import { glanceOf } from "../glance.ts";
import type { Entry } from "../needs.tsx";
import { houseToWorld, planOf, type Variant } from "./houses.ts";
import { groundHeight } from "./island.ts";
import type { Spot } from "./layout.ts";

/**
 * A house's fire as the town shows it, and how each form looks, as numbers. Pure; the drawing is in `Fire.tsx`. The forms:
 * `burning-loud` (the house is the loud thing: big flames and a tall dark column), `burning` (smaller flames and a short grey
 * plume), `handled` (a small flame and white steam, a lead throwing water), `last-seen` (burning under fog: the quiet fire,
 * frozen) and `none`.
 */
export type FireForm = "none" | "handled" | "burning-loud" | "burning" | "last-seen";

/** The part of an urgency-list entry that says who is loud. */
export type Head = Pick<Entry, "key" | "kind" | "tier" | "cwd">;

/** The loud thing: the head of the urgency list, when it is in tiers 1 to 3 and the page has not lost the server. */
export const loudOf = (waiting: Head[], lost: boolean): Head | null => (!lost && waiting.length > 0 && waiting[0].tier < 4 ? waiting[0] : null);

/**
 * The fire of `house` at `now` (the page's clock): its Glance says whether it burns, is handled or is under fog, and it is
 * loud only when `loud`, the loud thing, is its own burning entry. A fire under fog is last seen; one a lead works on is
 * handled whatever the fog, since a lead working is news from now.
 */
export function fireOf(house: House, now: number, loud: Head | null): FireForm {
  const { fire, fog } = glanceOf(house, now);
  if (fire === "none" || fire === "handled") return fire;
  if (fog) return "last-seen";
  return loud !== null && loud.kind === "pr" && loud.cwd === house.cwd ? "burning-loud" : "burning";
}

/** Whether a character `key` of the urgency list is the loud thing and stuck: it shows its dizzy stars, moving. */
export const loudStuck = (loud: Head | null, key: string): boolean => loud !== null && loud.kind === "character" && loud.tier === 2 && loud.key === key;

/** How a burning form looks: flame size, how many smoke puffs, how high and wide the smoke rises, its colour, the glow and whether it is frozen. */
export type FireLook = { flame: number; puffs: number; rise: number; width: number; smoke: string; glow: number; frozen: boolean };

/** The look of each form that shows a fire. */
export const LOOKS: Record<Exclude<FireForm, "none">, FireLook> = {
  "burning-loud": { flame: 1.6, puffs: 30, rise: 11, width: 1.9, smoke: "#3f3a3c", glow: 3.2, frozen: false },
  burning: { flame: 0.95, puffs: 12, rise: 3.6, width: 1.4, smoke: "#7a7476", glow: 1.8, frozen: false },
  handled: { flame: 0.38, puffs: 7, rise: 2, width: 1, smoke: "#f4f2ee", glow: 0.8, frozen: false },
  "last-seen": { flame: 0.95, puffs: 12, rise: 3.6, width: 1.4, smoke: "#7a7476", glow: 0, frozen: true },
};

/** A point in the world: x and z on the ground plane, y up. */
export type Point = { x: number; y: number; z: number };
type Lot = { at: Spot; facing: number; variant: Variant };

/** Where a house's fire sits: on the roof's ridge, a little forward of its middle. */
export const roofOf = (b: Lot): Point => {
  const p = planOf(b.variant);
  return houseToWorld(b, [0.1, p.top + p.rh - 0.15, 0.15]);
};

/** Where the water thrown at a house lands: the roof's left slope. */
export const splashOf = (b: Lot): Point => {
  const p = planOf(b.variant);
  return houseToWorld(b, [-0.5, p.top + p.rh * 0.6, 0.2]);
};

/** How far in front of a thrower, and how high above the ground, its bucket is held: where the water leaves from. */
const BUCKET = { forward: 0.45, up: 1.05 };

/** Where the water leaves a folk standing at `at` and turned `facing`: out of its bucket, in front of it. */
export const bucketOf = ({ at, facing }: { at: Spot; facing: number }): Point => ({
  x: at.x + Math.sin(facing) * BUCKET.forward,
  y: groundHeight(at.x, at.z) + BUCKET.up,
  z: at.z + Math.cos(facing) * BUCKET.forward,
});
