import type { Character, House, Town } from "../../../server/types.ts";
import type { Waiting } from "../needs.tsx";
import { colourFor, hatFor, type HatKind } from "./kit/palette.ts";

/** A point on the ground; +z faces the camera, the castle is at the back (-z). */
export type Spot = { x: number; z: number };
export type Pose = "work" | "queue" | "stuck";
export type Placed =
  | { kind: "building"; cwd: string; colour: string; at: Spot }
  | { kind: "lead"; id: string; lead: string; cwd: string; colour: string; pose: Pose; at: Spot }
  | { kind: "hat"; id: string; lead: string; cwd: string; hat: HatKind; pose: Pose; at: Spot }
  | { kind: "parcel"; cwd: string; number: number; at: Spot }
  | { kind: "steward"; id: string; at: Spot };

/** A key that names the same thing across state frames; a subagent keeps its key when it leaves the rack to queue. */
export const keyOf = (p: Placed): string =>
  p.kind === "building" ? `building:${p.cwd}` : p.kind === "parcel" ? `parcel:${p.cwd}#${p.number}` : `character:${p.id}`;

export const CASTLE: Spot = { x: 0, z: -9 };
export const DESK: Spot = { x: 0, z: -5.2 };
export const KING: Spot = { x: 0, z: -5.8 };
const QUEEN: Spot = { x: -1.2, z: -5.6 };
/** Where the steward's subagents keep their rack and sit: a yard left of the castle, laid out like a building's. */
const CASTLE_YARD: Spot = { x: -4.4, z: -6.4 };
/** The first place in the queue, just in front of the desk; the queue snakes back and forth behind it. */
export const QUEUE_HEAD: Spot = { x: 0, z: -4.4 };
const QUEUE_STEP = 0.75;
const QUEUE_ROW = 0.85;
const QUEUE_ROWS = 4;
/** Distance between two buildings' centres on the grid. */
const LOT = 4.4;
const FIRST_ROW = 1.6;

// The steward's folder when the server runs with its default `~/.funtown/steward`.
const STEWARD_DIR = /[/\\]\.funtown[/\\]steward$/;

/** A character's pose: needs you queues at the desk, stuck sits down, anything else works at its building. */
export const poseOf = (c: Character): Pose => (c.stage !== "needs_you" ? "work" : c.needs === "stuck" ? "stuck" : "queue");

/**
 * The listed steward's id: the one a parcel's review names, else the lead in the default
 * steward folder; undefined when neither is listed.
 */
export function stewardOf(town: Town): string | undefined {
  const leads = town.houses.flatMap((h) => h.leads);
  const named = town.houses.flatMap((h) => h.parcels ?? []).find((p) => p.review?.steward)?.review?.steward;
  if (named && leads.some((l) => l.id === named)) return named;
  return town.houses.find((h) => STEWARD_DIR.test(h.cwd))?.leads[0]?.id;
}

/** The k-th peg of the hat rack right of the door of a building at `at`: four pegs a rail, each further rail behind the last. */
function rack(at: Spot, k: number): Spot {
  const rail = Math.floor(k / 4);
  return { x: at.x + (rail === 0 ? 0.6 : 0.95) + 0.45 * (k % 4), z: at.z + 0.95 - 0.55 * rail };
}
/** The k-th place in front of a building at `at`: rows of six. */
const yard = (at: Spot, k: number): Spot => ({ x: at.x - 1.5 + 0.6 * (k % 6), z: at.z + 1.6 + 0.6 * Math.floor(k / 6) });
/** The k-th parcel at the door of a building at `at`: three in a row left of the door, the rest piled along its side. */
const doorstep = (at: Spot, k: number): Spot =>
  k < 3 ? { x: at.x - 0.55 - 0.55 * k, z: at.z + 0.95 } : { x: at.x - 1.15 - 0.55 * ((k - 3) % 2), z: at.z + 0.4 - 0.55 * Math.floor((k - 3) / 2) };
/** The i-th of `count` places in the queue, snaking in rows across the plaza. */
function queueSpot(i: number, count: number): Spot {
  const across = Math.max(6, Math.ceil(count / QUEUE_ROWS));
  const row = Math.floor(i / across);
  const k = i % across;
  return { x: QUEUE_HEAD.x + (row % 2 === 0 ? k : across - 1 - k) * QUEUE_STEP, z: QUEUE_HEAD.z + row * QUEUE_ROW };
}

/**
 * Where everything in `town` stands. Buildings follow house order on a grid in front of the
 * castle; working leads stand in front of their building and working subagents are hats on its
 * rack; stuck ones sit there too; everyone who needs you queues at the desk in `waiting` order;
 * open parcels sit at the door; the steward stands by the desk. Done subagents are not placed.
 * Pure: the same Town (and waiting order) always gives the same places.
 */
export function layout(town: Town, waiting: Waiting[]): Placed[] {
  const steward = stewardOf(town);
  // The steward's own house gets no building unless the user added it or another lead works there.
  const houses = town.houses.filter((h) => h.added || !h.leads.some((l) => l.id === steward) || h.leads.some((l) => l.id !== steward));
  const placed: Placed[] = [];
  const queue: { key: string; place: (at: Spot) => Placed }[] = [];

  /** Places `leads` (unless `asLeads` is false: the steward keeps its own spot) and their subagents around `at`, or in the queue. */
  const settle = (house: House, at: Spot, leads: House["leads"], colour: string, asLeads: boolean) => {
    let pegs = 0;
    let seats = 0;
    for (const lead of leads) {
      if (asLeads) {
        const pose = poseOf(lead);
        const make = (spot: Spot): Placed => ({ kind: "lead", id: lead.id, lead: lead.id, cwd: house.cwd, colour, pose, at: spot });
        if (pose === "queue") queue.push({ key: `${lead.id}/${lead.id}`, place: make });
        else placed.push(make(yard(at, seats++)));
      }
      for (const sub of lead.subagents) {
        if (sub.stage === "done") continue;
        const pose = poseOf(sub);
        const make = (spot: Spot): Placed => ({ kind: "hat", id: sub.id, lead: lead.id, cwd: house.cwd, hat: hatFor(sub.role), pose, at: spot });
        if (pose === "queue") queue.push({ key: `${lead.id}/${sub.id}`, place: make });
        else placed.push(make(pose === "work" ? rack(at, pegs++) : yard(at, seats++)));
      }
    }
  };

  const cols = Math.min(houses.length, Math.max(3, Math.ceil(Math.sqrt(houses.length * 3))));
  houses.forEach((house, i) => {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, houses.length - row * cols);
    const at = { x: ((i % cols) - (inRow - 1) / 2) * LOT, z: FIRST_ROW + row * LOT };
    const colour = colourFor(house.project);
    placed.push({ kind: "building", cwd: house.cwd, colour, at });
    settle(house, at, house.leads.filter((l) => l.id !== steward), colour, true);
    (house.parcels ?? []).forEach((parcel, k) => placed.push({ kind: "parcel", cwd: house.cwd, number: parcel.number, at: doorstep(at, k) }));
  });

  const stewardHouse = town.houses.find((h) => h.leads.some((l) => l.id === steward));
  if (steward && stewardHouse) {
    placed.push({ kind: "steward", id: steward, at: QUEEN });
    settle(stewardHouse, CASTLE_YARD, stewardHouse.leads.filter((l) => l.id === steward), colourFor(stewardHouse.project), false);
  }

  const order = new Map(waiting.map((w, i) => [w.key, i]));
  const rank = (key: string) => order.get(key) ?? waiting.length;
  queue
    .map((q, i) => ({ ...q, i }))
    .sort((a, b) => rank(a.key) - rank(b.key) || a.i - b.i)
    .forEach((q, i, all) => placed.push(q.place(queueSpot(i, all.length))));
  return placed;
}
