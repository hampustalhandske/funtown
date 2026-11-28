import type { Town } from "../../../server/types.ts";
import { castleAt } from "./hill.ts";

/**
 * The forecourt's furniture and the two people who sit at it. Places are in the castle's own frame (see `hill.ts`): `u`
 * across, right as seen from the village, and `w` forward, toward the village; the castle is at w = 0 and the stair arrives at
 * `HILL.edge`. Every number is here so it can be tuned in one place.
 */

/** The stone table in front of the thrones: the middle of its top at `w`, its half-length across, its depth and its height. */
export const TABLE = { u: 0, w: 3.85, half: 1.75, depth: 1.0, top: 0.98 } as const;
/** The head of the line stands here, in front of your throne, with room between it and the table's near edge. */
export const HEAD = { u: -0.62, w: 4.95 } as const;
/** The platform both thrones stand on, and how high it is. */
export const DAIS = { u: 0.04, w: 2.8, across: 3.0, depth: 1.1, height: 0.12 } as const;
/** Your throne (the tall square one, on the left) and the Queen's (lower and round, on your right): where each stands and its turn from facing the village. */
export const YOUR_THRONE = { u: -0.62, w: 2.85, yaw: 0 } as const;
export const QUEEN_SEAT = { u: 0.7, w: 2.88, yaw: -0.05 } as const;
/** How high above the plateau a person's hips sit on a throne's cushion. */
export const SEAT_TOP = 0.79;
/** The pile of parcels on the flagstones beside the Queen's seat, on its right: where the first one lies and how far each next one is from it. */
export const PILE = { u: 2.35, w: 3.0, step: 0.5 } as const;
/** The steward's subagents work in a small yard beside the castle: on the plateau's left, in front of the castle's side and clear of the table. Its first place and the gap between places; rows of three step toward the village. */
export const YARD = { u: -4.2, w: 2.3, gap: 0.6 } as const;

/** A court place as a world point on the ground. */
const world = (u: number, w: number) => {
  const [x, z] = castleAt(u, w);
  return { x, z };
};
/** The table's middle, the head of the line's place and the pile's first place, on the ground. */
export const TABLE_AT = world(TABLE.u, TABLE.w);
export const HEAD_AT = world(HEAD.u, HEAD.w);
export const PILE_AT = world(PILE.u, PILE.w);
export const YOUR_THRONE_AT = world(YOUR_THRONE.u, YOUR_THRONE.w);
export const QUEEN_SEAT_AT = world(QUEEN_SEAT.u, QUEEN_SEAT.w);
export const YARD_AT = world(YARD.u, YARD.w);
/** The k-th place in the steward's yard: rows of three, each row nearer the village than the last. */
export const yardSpot = (k: number) => world(YARD.u + YARD.gap * (k % 3), YARD.w + YARD.gap * Math.floor(k / 3));

/** What the Queen is doing: sitting still, writing the user's word, reading a parcel, or done with a word that waits on a slip. */
export type QueenState = "idle" | "asked" | "busy" | "ready";

/**
 * The Queen's state and, when it is `ready`, whose slip carries her note. `steward` is the id of the steward's lead or
 * undefined when none is listed (then she sits `idle`). `asked` while any card's word is queued or writing; else `busy`
 * while the steward works; else `ready` while a card's word is ready, naming that card's character (the subagent that asked,
 * else its lead; the oldest card when several are ready); else `idle`.
 */
export function queenOf(town: Town, steward: string | undefined): { state: QueenState; note: string | null } {
  const idle = { state: "idle" as const, note: null };
  if (steward === undefined) return idle;
  const words = town.cards.map((c) => c.word?.state);
  if (words.some((w) => w === "queued" || w === "writing")) return { state: "asked", note: null };
  const stewardLead = town.houses.flatMap((h) => h.leads).find((l) => l.id === steward);
  if (stewardLead?.stage === "working") return { state: "busy", note: null };
  const ready = town.cards.find((c) => c.word?.state === "ready");
  return ready ? { state: "ready", note: ready.agent ?? ready.lead } : idle;
}
