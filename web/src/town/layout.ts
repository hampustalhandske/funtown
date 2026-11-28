import type { Character, House, Town } from "../../../server/types.ts";
import type { Entry } from "../needs.tsx";
import { colourFor, hatFor, type HatKind } from "./kit/palette.ts";
import type { InPlaced } from "./interior.ts";
import { castleAt, HILL } from "./hill.ts";
import { lotOf } from "./island.ts";
import { queenOf, QUEEN_SEAT_AT, TABLE_AT, YARD_AT, yardSpot, YOUR_THRONE_AT, type QueenState } from "./court.ts";
import { avatarFor } from "./kit/avatars.ts";

/** A point on the ground; +z faces the camera, the castle is at the back (-z). */
export type Spot = { x: number; z: number };
export type Pose = "work" | "idle" | "queue" | "stuck";
export type Placed =
  | { kind: "building"; cwd: string; colour: string; at: Spot }
  | { kind: "lead"; id: string; lead: string; cwd: string; colour: string; pose: Pose; at: Spot }
  | { kind: "hat"; id: string; lead: string; cwd: string; colour: string; hat: HatKind; pose: Pose; at: Spot }
  | { kind: "parcel"; cwd: string; number: number; at: Spot }
  /** You, on your throne, in the avatar preset `avatar` (an id `avatarFor` knows). */
  | { kind: "you"; avatar: string; at: Spot }
  /** The Queen on her seat: the steward's lead `id` (null when none is listed), what she is doing, and when `ready` the id of the character whose slip carries her note. */
  | { kind: "queen"; id: string | null; state: QueenState; note: string | null; at: Spot };

/** A key that names the same thing across state frames; a subagent keeps its key when it leaves the rack to queue or sits at a desk. */
export const keyOf = (p: Placed | InPlaced): string =>
  p.kind === "building" ? `building:${p.cwd}` : p.kind === "parcel" ? `parcel:${p.cwd}#${p.number}` : p.kind === "observer" ? "observer" : p.kind === "you" ? "you" : p.kind === "queen" && p.id === null ? "queen" : `character:${p.id}`;

/** A place in the castle's frame (see `hill.ts`) as a spot on the ground. */
const court = (u: number, w: number): Spot => {
  const [x, z] = castleAt(u, w);
  return { x, z };
};
/** The stone table on the forecourt, in front of the thrones: the queue turns toward it. */
export const DESK = TABLE_AT;
/** The queue: rows across the forecourt in front of the desk, then rows on the square at the stair's foot. */
const QUEUE = { across: 9, step: 0.9, rows: [4.9, 5.75], below: 7, foot: HILL.stair.foot + 1 };
const SEAT = 0.6;

/**
 * A character's pose: needing you queues at the desk, stuck sits down, done stands idle, working
 * works at its building. A resting one (its turn ended) stands idle at its house, not in the queue.
 */
export const poseOf = (c: Character): Pose =>
  c.stage === "done" || c.needs === "turn ended" ? "idle" : c.stage === "working" ? "work" : c.needs === "stuck" ? "stuck" : "queue";

/** The k-th peg of the hat rack right of the door of a building at `at`: four pegs a rail, each further rail behind the last. */
function rack(at: Spot, k: number): Spot {
  const rail = Math.floor(k / 4);
  return { x: at.x + (rail === 0 ? 0.6 : 0.95) + 0.45 * (k % 4), z: at.z + 0.95 - 0.55 * rail };
}
/** The k-th place in front of a building at `at`: rows of six. */
const yard = (at: Spot, k: number): Spot => ({ x: at.x - 1.5 + SEAT * (k % 6), z: at.z + 1.6 + SEAT * Math.floor(k / 6) });
/** The k-th resting lead at the door of a building at `at`: in front of the door, between the parcels and the rack, the next ones further out. */
const porch = (at: Spot, k: number): Spot => ({ x: at.x, z: at.z + 1.1 + SEAT * k });
/** The k-th parcel at the door of a building at `at`: three in a row left of the door, the rest piled along its side. */
const doorstep = (at: Spot, k: number): Spot =>
  k < 3 ? { x: at.x - 0.55 - 0.55 * k, z: at.z + 0.95 } : { x: at.x - 1.15 - 0.55 * ((k - 3) % 2), z: at.z + 0.4 - 0.55 * Math.floor((k - 3) / 2) };
/** The i-th place in the queue: across the forecourt's rows from the left, then in rows on the square below the stair. */
function queueSpot(i: number): Spot {
  const upper = QUEUE.across * QUEUE.rows.length;
  if (i < upper) return court((-(QUEUE.across - 1) / 2 + (i % QUEUE.across)) * QUEUE.step, QUEUE.rows[Math.floor(i / QUEUE.across)]);
  const k = i - upper;
  return court((-(QUEUE.below - 1) / 2 + (k % QUEUE.below)) * QUEUE.step, QUEUE.foot + QUEUE.step * Math.floor(k / QUEUE.below));
}

/**
 * Where everything in `town` stands. Buildings stand on the island's lots in house order (house i on `lotOf(i)`); working and done leads stand in front of their building, resting ones by its door, and working
 * subagents are hats on its rack; stuck ones sit there too; everyone who asks you queues on the castle's forecourt in `waiting`
 * (urgency) order, where only a character's key finds a place; open parcels sit at the door; the lead marked `steward` stands by the desk. Done
 * subagents are not placed.
 * `now` is the page's clock in ms and `lost` whether the page has lost the server (`townFog(...)?.why === "lost"`);
 * the places don't depend on either yet.
 * Pure: the same Town, waiting order, clock and `lost` always give the same places.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function layout(town: Town, waiting: Pick<Entry, "key">[], now: number, lost: boolean): Placed[] {
  const steward = town.houses.flatMap((h) => h.leads).find((l) => l.steward)?.id;
  // The steward's own house gets no building unless the user added it or another lead works there.
  const houses = town.houses.filter((h) => h.added || !h.leads.some((l) => l.id === steward) || h.leads.some((l) => l.id !== steward));
  const placed: Placed[] = [];
  const queue: { key: string; place: (at: Spot) => Placed }[] = [];

  /** Places `leads` (unless `asLeads` is false: the steward keeps its own spot) and their subagents around `at`, or in the queue. */
  const settle = (house: House, at: Spot, leads: House["leads"], colour: string, asLeads: boolean, inYard = false) => {
    let pegs = 0;
    let seats = 0;
    let resting = 0;
    for (const lead of leads) {
      if (asLeads) {
        const pose = poseOf(lead);
        const make = (spot: Spot): Placed => ({ kind: "lead", id: lead.id, lead: lead.id, cwd: house.cwd, colour, pose, at: spot });
        if (pose === "queue") queue.push({ key: `${lead.id}/${lead.id}`, place: make });
        else placed.push(make(lead.needs === "turn ended" ? porch(at, resting++) : yard(at, seats++)));
      }
      for (const sub of lead.subagents) {
        if (sub.stage === "done") continue;
        const pose = poseOf(sub);
        const make = (spot: Spot): Placed => ({ kind: "hat", id: sub.id, lead: lead.id, cwd: house.cwd, colour, hat: hatFor(sub.role), pose, at: spot });
        if (pose === "queue") queue.push({ key: `${lead.id}/${sub.id}`, place: make });
        else placed.push(make(inYard ? yardSpot(seats++) : pose === "work" ? rack(at, pegs++) : yard(at, seats++)));
      }
    }
  };

  houses.forEach((house, i) => {
    const at = lotOf(i);
    const colour = colourFor(house.project);
    placed.push({ kind: "building", cwd: house.cwd, colour, at });
    settle(house, at, house.leads.filter((l) => l.id !== steward), colour, true);
    (house.parcels ?? []).forEach((parcel, k) => placed.push({ kind: "parcel", cwd: house.cwd, number: parcel.number, at: doorstep(at, k) }));
  });

  const stewardHouse = town.houses.find((h) => h.leads.some((l) => l.id === steward));
  placed.push({ kind: "you", avatar: avatarFor(town.avatar).id, at: YOUR_THRONE_AT });
  placed.push({ kind: "queen", id: steward ?? null, ...queenOf(town, steward), at: QUEEN_SEAT_AT });
  if (steward && stewardHouse) {
    settle(stewardHouse, YARD_AT, stewardHouse.leads.filter((l) => l.id === steward), colourFor(stewardHouse.project), false, true);
  }

  const order = new Map(waiting.map((w, i) => [w.key, i]));
  const rank = (key: string) => order.get(key) ?? waiting.length;
  queue
    .map((q, i) => ({ ...q, i }))
    .sort((a, b) => rank(a.key) - rank(b.key) || a.i - b.i)
    .forEach((q, i) => placed.push(q.place(queueSpot(i))));
  return placed;
}
