import { hatFor, type HatKind } from "./kit/palette.ts";
import { SQUARE } from "./island.ts";
import { keyOf, type Placed, type Spot } from "./layout.ts";

/** How long a character that left the town is still drawn, walking off down the lane. */
export const LEAVE_MS = 2500;
/** How far down the lane a leaver walks before it is gone. */
export const LANE = 3.5;

/** One of the town's folk as drawn: one that has left carries the time it left (`leftAt`). */
export type Drawn = Placed & { leftAt?: number };

/** The five animals of the town's folk; the role sets which (ADR 0008). */
export type Animal = "cat" | "beaver" | "hare" | "hedgehog" | "owl";
/** A folk's hat: its type's hat, or the lead's captain's cap. */
export type FolkHat = HatKind | "captain";
/** What a folk wears besides its hat; only the five named roles wear any. */
export type Clothing = "scarf" | "apron" | "toolbelt" | "pack" | "white-apron";
export type Costume = { animal: Animal; hat: FolkHat; clothes: Clothing[] };

/** The clothes of the named subagent types: the implementer, the explorer and the tester. The reviewer wears none. */
const CLOTHES: Record<string, Clothing[]> = { implementer: ["toolbelt"], explorer: ["pack"], "test-writer": ["white-apron"] };

/** The animal for a subagent type: a reviewer an owl, a tester a hedgehog, an explorer or planner a hare, any other a beaver. */
function animalOf(role: string | undefined): Animal {
  if (role === undefined) return "beaver";
  if (/review/i.test(role)) return "owl";
  if (/test/i.test(role)) return "hedgehog";
  return role === "explorer" || role === "Explore" || role === "Plan" ? "hare" : "beaver";
}

/** How a character is drawn: a lead is a cat in the captain's cap with scarf and apron; a subagent of type `role` its animal in its type's hat. */
export function costumeOf(role: string | undefined, lead: boolean): Costume {
  if (lead) return { animal: "cat", hat: "captain", clothes: ["scarf", "apron"] };
  return { animal: animalOf(role), hat: hatFor(role), clothes: (role !== undefined && Object.hasOwn(CLOTHES, role) ? CLOTHES[role] : []) };
}

/** `LANE` along the way from `from` to the village square, stopping at the square. */
function downTheLane(from: Spot): Spot {
  const [dx, dz] = [SQUARE.x - from.x, SQUARE.z - from.z];
  const d = Math.hypot(dx, dz);
  const k = d === 0 ? 0 : Math.min(LANE, d) / d;
  return { x: from.x + dx * k, z: from.z + dz * k };
}

/**
 * `placed` as drawn now, plus each character in `before` that is no longer in `placed` (a done subagent, an unlisted lead):
 * walking `LANE` down the lane toward the square with pose `leave` and `leftAt` (its earlier `leftAt`, else `now`), kept
 * while `now - leftAt < LEAVE_MS`. Houses and parcels are never kept. Pure.
 */
export function departed(before: Drawn[], placed: Placed[], now: number): Drawn[] {
  const here = new Set(placed.map(keyOf));
  const left = before.flatMap((p): Drawn[] => {
    if ((p.kind !== "lead" && p.kind !== "hat") || here.has(keyOf(p))) return [];
    const leftAt = p.leftAt ?? now;
    if (now - leftAt >= LEAVE_MS) return [];
    return [p.leftAt === undefined ? { ...p, pose: "leave", at: downTheLane(p.at), leftAt } : p];
  });
  return [...placed, ...left];
}
