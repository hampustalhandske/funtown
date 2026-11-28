import type { Character, House, Town } from "../../../server/types.ts";
import { colourFor } from "./kit/palette.ts";
import { costumeOf, type Costume } from "./folk.ts";
import type { InPlaced } from "./interior.ts";
import { CASTLE_TURN } from "./hill.ts";
import { lotOf } from "./island.ts";
import { DOOR, facingOf, houseToWorld, isBusy, variantOf, type Variant } from "./houses.ts";
import { queenOf, QUEEN_SEAT_AT, YARD_AT, yardSpot, YOUR_THRONE_AT, type QueenState } from "./court.ts";
import { LINE_FACING, lineUp, type InLine } from "./line.ts";
import { avatarFor } from "./kit/avatars.ts";
import { fireOf, loudOf, loudStuck, type FireForm, type Head } from "./fire.ts";

/** A point on the ground; +z faces the camera, the castle is at the back (-z). */
export type Spot = { x: number; z: number };
/** A classroom figure's pose. */
export type Pose = "work" | "idle" | "queue" | "stuck";
/**
 * How one of the town's folk stands: working at its house, standing (a done lead), sitting stuck on its doorstep, resting by
 * its door (its turn ended), waiting for you, or leaving down the lane (a done subagent, drawn only: see `departed`). A working
 * lead of a house whose fire is handled throws water from a bucket (`bucket`), turned toward its roof.
 */
export type FolkPose = "work" | "bucket" | "stand" | "stuck" | "rest" | "wait" | "leave";
/** One of the town's folk: its costume, its lead (itself for a lead), its house's folder and colour, its pose and spot, and while it waits its place in the line. */
type Folk = Costume & { id: string; lead: string; cwd: string; colour: string; pose: FolkPose; at: Spot; facing: number; stars: boolean; line?: InLine };
export type Placed =
  /** A house; `flag` while one of its characters is in the line. */
  | { kind: "building"; cwd: string; colour: string; at: Spot; facing: number; variant: Variant; busy: boolean; fire: FireForm; marked: boolean; flag: boolean }
  | ({ kind: "lead" } & Folk)
  | ({ kind: "hat" } & Folk)
  | { kind: "parcel"; cwd: string; number: number; at: Spot }
  /** You, on your throne, in the avatar preset `avatar` (an id `avatarFor` knows). */
  | { kind: "you"; avatar: string; at: Spot }
  /** The Queen on her seat: the steward's lead `id` (null when none is listed), what she is doing, and when `ready` the id of the character whose slip carries her note. */
  | { kind: "queen"; id: string | null; state: QueenState; note: string | null; at: Spot };

/** A key that names the same thing across state frames; a subagent keeps its key when it leaves the rack to queue or sits at a desk. */
export const keyOf = (p: Placed | InPlaced): string =>
  p.kind === "building" ? `building:${p.cwd}` : p.kind === "parcel" ? `parcel:${p.cwd}#${p.number}` : p.kind === "observer" ? "observer" : p.kind === "you" ? "you" : p.kind === "queen" && p.id === null ? "queen" : `character:${p.id}`;

/** The gap between two folk standing side by side. */
const GAP = 0.9;

/**
 * A classroom figure's pose: needing you queues at the desk, stuck sits down, done stands idle, working
 * works at its building. A resting one (its turn ended) stands idle at its house, not in the queue.
 */
export const poseOf = (c: Character): Pose =>
  c.stage === "done" || c.needs === "turn ended" ? "idle" : c.stage === "working" ? "work" : c.needs === "stuck" ? "stuck" : "queue";

/** A character's pose in the town: working works, done stands, a turn ended rests, stuck sits stuck, any other ask waits. */
const folkPose = (c: Character): FolkPose =>
  c.stage === "working" ? "work" : c.stage === "done" ? "stand" : c.needs === "turn ended" ? "rest" : c.needs === "stuck" ? "stuck" : "wait";

/** A house's lot and the way it faces. */
type Lot = { at: Spot; facing: number };
/** The spot `across` and `forward` of a house's middle in its own frame (see `houseToWorld`). */
const inFront = (lot: Lot, across: number, forward: number): Spot => {
  const { x, z } = houseToWorld(lot, [across, 0, forward]);
  return { x, z };
};
/** The k-th work spot of a house: rows of four out in front of it, clear of its door. */
const workSpot = (lot: Lot, k: number) => inFront(lot, GAP * ((k % 4) - 1.5), DOOR.forward + 1.4 + GAP * Math.floor(k / 4));
/** The k-th resting lead by a house's door: beside it toward the front's middle, the next ones further along. */
const porch = (lot: Lot, k: number) => inFront(lot, DOOR.across + 0.65 * (k + 1), DOOR.forward - 0.1);
/** The k-th stuck character on a house's doorstep: on the step before the door, the next ones in front of it. */
const step = (lot: Lot, k: number) => inFront(lot, DOOR.across, DOOR.forward + 0.15 + 0.5 * k);
/** The k-th parcel at a house's door: three in a row on the other side of the door, the rest in rows in front of them. */
const doorstep = (lot: Lot, k: number) =>
  k < 3 ? inFront(lot, DOOR.across - 0.6 - 0.55 * k, DOOR.forward - 0.1) : inFront(lot, DOOR.across - 0.6 - 0.55 * ((k - 3) % 3), DOOR.forward + 0.45 + 0.55 * Math.floor((k - 3) / 3));

/**
 * Where everything in `town` stands. Buildings stand on the island's lots in house order (house i on `lotOf(i)`); working and done leads stand in front of their building, resting ones by its door, and working
 * subagents work beside it; stuck ones sit on its doorstep; everyone who asks you waits in the line (`lineUp`) in `waiting`
 * (urgency) order, where only a character's key finds a place; open parcels sit at the door; the lead marked `steward` is the Queen. Done
 * subagents are not placed.
 * A building also says which way its lot faces, its feature, whether anyone of the house works (`busy`: its chimney puffs),
 * whether `marked`, the marked house's folder, is its own, its fire (see `fire.ts`), and whether it flies its flag (one of
 * its characters is in the line).
 * `now` is the page's clock in ms, which sets the fires and the line's postures, and `lost` whether the page has lost the
 * server (`townFog(...)?.why === "lost"`), which leaves nothing loud: no flag waves.
 * Pure: the same Town, waiting order, clock, `lost` and mark always give the same places.
 */
export function layout(town: Town, waiting: Head[], now: number, lost: boolean, marked: string | null = null): Placed[] {
  const steward = town.houses.flatMap((h) => h.leads).find((l) => l.steward)?.id;
  // The steward's own house gets no building unless the user added it or another lead works there.
  const houses = town.houses.filter((h) => h.added || !h.leads.some((l) => l.id === steward) || h.leads.some((l) => l.id !== steward));
  const loud = loudOf(waiting, lost);
  const placed: Placed[] = [];
  const queue: { key: string; since: number | undefined; place: (at: Spot, line: InLine) => Extract<Placed, { kind: "lead" | "hat" }> }[] = [];

  /**
   * Places `leads` (unless `asLeads` is false: the steward keeps its own spot) and their subagents about `lot`, facing the way
   * it faces, or in the queue; `inYard` puts them all in the castle's yard.
   */
  const settle = (house: House, lot: Lot, leads: House["leads"], colour: string, asLeads: boolean, inYard = false) => {
    const count = { work: 0, rest: 0, stuck: 0 };
    const handled = fireOf(house, now, loud) === "handled";
    const spotOf = (pose: FolkPose): Spot =>
      inYard ? yardSpot(count.work++) : pose === "rest" ? porch(lot, count.rest++) : pose === "stuck" ? step(lot, count.stuck++) : workSpot(lot, count.work++);
    const put = (kind: "lead" | "hat", c: Character, lead: string) => {
      const worked = folkPose(c);
      const pose = worked === "work" && kind === "lead" && handled && !inYard ? "bucket" : worked;
      // The bucket's thrower faces the house; everyone else faces away from it, and the line faces up the stair. A loud stuck one shows its stars.
      const facing = pose === "bucket" ? lot.facing + Math.PI : lot.facing;
      const stars = pose === "stuck" && loudStuck(loud, `${lead}/${c.id}`);
      const make = (spot: Spot, facing: number): Extract<Placed, { kind: "lead" | "hat" }> => ({ kind, id: c.id, lead, cwd: house.cwd, colour, ...costumeOf(c.role, kind === "lead"), pose, at: spot, facing, stars });
      if (pose === "wait") queue.push({ key: `${lead}/${c.id}`, since: c.since, place: (spot, line) => ({ ...make(spot, LINE_FACING), line }) });
      else placed.push(make(spotOf(pose), facing));
    };
    for (const lead of leads) {
      if (asLeads) put("lead", lead, lead.id);
      for (const sub of lead.subagents) if (sub.stage !== "done") put("hat", sub, lead.id);
    }
  };

  houses.forEach((house, i) => {
    const lot = { at: lotOf(i), facing: facingOf(i) };
    const colour = colourFor(house.project);
    placed.push({ kind: "building", cwd: house.cwd, colour, ...lot, variant: variantOf(house.cwd), busy: isBusy(house, steward), fire: fireOf(house, now, loud), marked: house.cwd === marked, flag: false });
    settle(house, lot, house.leads.filter((l) => l.id !== steward), colour, true);
    (house.parcels ?? []).forEach((parcel, k) => placed.push({ kind: "parcel", cwd: house.cwd, number: parcel.number, at: doorstep(lot, k) }));
  });

  const stewardHouse = town.houses.find((h) => h.leads.some((l) => l.id === steward));
  placed.push({ kind: "you", avatar: avatarFor(town.avatar).id, at: YOUR_THRONE_AT });
  placed.push({ kind: "queen", id: steward ?? null, ...queenOf(town, steward), at: QUEEN_SEAT_AT });
  if (steward && stewardHouse) {
    settle(stewardHouse, { at: YARD_AT, facing: CASTLE_TURN }, stewardHouse.leads.filter((l) => l.id === steward), colourFor(stewardHouse.project), false, true);
  }

  const line = lineUp(queue, waiting, loud, now).map((q) => q.place(q.at, q.line));
  const flying = new Set(line.map((f) => f.cwd));
  for (const p of placed) if (p.kind === "building") p.flag = flying.has(p.cwd);
  return [...placed, ...line];
}
