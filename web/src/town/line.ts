import type { Entry } from "../needs.tsx";
import { HEAD } from "./court.ts";
import { castleAt, CASTLE_TURN, HILL, TREAD } from "./hill.ts";
import type { Spot } from "./layout.ts";

/**
 * The line: the characters waiting with an ask, in urgency order. The head stands at the table with its slip laid before
 * you, the next at the stair head, the rest on every third tread down the left half of the grand stair (oldest highest),
 * and any more in short rows on the square at the stair's foot. Pure; places are worked out in the castle's frame (`hill.ts`).
 */

/** How a waiting character stands, from how long it has waited. */
export type Posture = "stand" | "tap" | "sit" | "asleep";
/** How a signal flag shows: waved by the loud thing, or held up and still. */
export type FlagMode = "wave" | "still";
/** A character's place in the line (0 is the head at the table), how it stands and how it holds its flag. */
export type InLine = { place: number; posture: Posture; flag: FlagMode };

/** From these waits a character taps its foot, sits down, and falls asleep. */
export const TAP_MS = 2 * 60_000;
export const SIT_MS = 10 * 60_000;
export const ASLEEP_MS = 30 * 60_000;

/** How a character waiting since `since` stands at `now`: standing under 2 minutes, tapping from 2, sitting from 10, asleep from 30. */
export function postureOf(since: number, now: number): Posture {
  const waited = now - since;
  return waited >= ASLEEP_MS ? "asleep" : waited >= SIT_MS ? "sit" : waited >= TAP_MS ? "tap" : "stand";
}

/** Where the line goes: the stair head's place, the tread places' `u` on the left half, and the foot rows on the square. */
const LINE = { headW: HILL.edge - 0.4, u: -0.58, every: 3, firstTread: 2, foot: { w: HILL.stair.foot + 0.75, across: 3, u: -0.55, gap: 0.65 } };
/** How many places the stair holds: every third tread from the third, down to the bottom one. */
const ON_STAIR = Math.floor((HILL.stair.steps - 1 - LINE.firstTread) / LINE.every) + 1;

/** A castle-frame place as a spot on the ground. */
const at = (u: number, w: number): Spot => {
  const [x, z] = castleAt(u, w);
  return { x, z };
};

/** The i-th place in the line: the table, the stair head, every third tread down the left half, then rows of three on the square below the stair's foot, stepping left. */
export function linePlace(i: number): Spot {
  if (i === 0) return at(HEAD.u, HEAD.w);
  if (i === 1) return at(LINE.u, LINE.headW);
  const k = i - 2;
  if (k < ON_STAIR) return at(LINE.u, HILL.edge + TREAD * (LINE.firstTread + 0.5 + LINE.every * k));
  const r = k - ON_STAIR;
  const { foot } = LINE;
  return at(foot.u - foot.gap * (r % foot.across), foot.w + foot.gap * Math.floor(r / foot.across));
}

/** Everyone in the line faces up the stair, toward the thrones. */
export const LINE_FACING = CASTLE_TURN + Math.PI;

/**
 * Lines up `members` (each keyed like the urgency list and waiting `since`) in the order of `waiting`, the urgency list; one
 * it doesn't know goes last, in the given order. Gives each its place and spot, its posture at `now`, and its flag: only the
 * head waves, and only while it is `loud`, the loud thing (`loudOf` in `fire.ts`); a head that waves always stands. A
 * session list that fails on its own keeps the urgency list, so a known ask stays loud.
 */
export function lineUp<M extends { key: string; since: number | undefined }>(members: M[], waiting: Pick<Entry, "key">[], loud: Pick<Entry, "key"> | null, now: number): (M & { line: InLine; at: Spot })[] {
  const order = new Map(waiting.map((w, i) => [w.key, i]));
  const rank = (key: string) => order.get(key) ?? waiting.length;
  return members
    .map((m, i) => ({ m, i }))
    .sort((a, b) => rank(a.m.key) - rank(b.m.key) || a.i - b.i)
    .map(({ m }, place) => {
      const flag: FlagMode = place === 0 && m.key === loud?.key ? "wave" : "still";
      const posture = flag === "wave" ? "stand" : postureOf(m.since ?? now, now);
      return { ...m, line: { place, posture, flag }, at: linePlace(place) };
    });
}
