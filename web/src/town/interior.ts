import type { House } from "../../../server/types.ts";
import { poseOf, type Pose, type Spot } from "./layout.ts";
import { colourFor, hatFor, type HatKind } from "./kit/palette.ts";

/** A place in a classroom; +z faces the camera, the front of the room (leads, whiteboard) is at -z. */
export type InPlaced =
  | { kind: "lead"; id: string; colour: string; pose: Pose; at: Spot }
  | { kind: "hat"; id: string; lead: string; colour: string; hat: HatKind; pose: Pose; at: Spot }
  | { kind: "parcel"; cwd: string; number: number; at: Spot }
  | { kind: "observer"; at: Spot };
export type BoardStep = { label: string; state: "done" | "now" | "next" | "later" };
export type Board = { project: string; phase: string | null; note: string | null; steps: BoardStep[] };

/** The middle of the row of leads across the front of the room. */
export const FRONT: Spot = { x: 0, z: -3 };
/** The whiteboard's middle, on the front wall behind the leads. */
export const BOARD: Spot = { x: 0, z: -4.6 };
/** The middle of the table by the door, back right. */
export const TABLE: Spot = { x: 3.6, z: 3.4 };
/** Where the user, the king, stands: the back centre, in the aisle between the desk columns. */
export const OBSERVER: Spot = { x: 0, z: 6 };

const LEAD_GAP = 1.2;
const DESKS_PER_ROW = 4;
const DESK_GAP = 1.2;
const ROW_GAP = 1.3;
const FIRST_ROW = -1.5;
const PARCEL_GAP = 0.5;
const PARCELS_PER_ROW = 3;

/** The i-th of `count` leads, side by side across the front and centred on FRONT. */
const leadSpot = (i: number, count: number): Spot => ({ x: FRONT.x + (i - (count - 1) / 2) * LEAD_GAP, z: FRONT.z });
/** The k-th student desk: rows of four facing the front, the first row nearest it, the columns centred (never on the aisle at x = 0). */
const deskSpot = (k: number): Spot => ({
  x: (k % DESKS_PER_ROW - (DESKS_PER_ROW - 1) / 2) * DESK_GAP,
  z: FIRST_ROW + ROW_GAP * Math.floor(k / DESKS_PER_ROW),
});
/** The k-th parcel on the table: rows of three centred on it, each further row nearer the front. */
const tableSpot = (k: number): Spot => ({
  x: TABLE.x + ((k % PARCELS_PER_ROW) - (PARCELS_PER_ROW - 1) / 2) * PARCEL_GAP,
  z: TABLE.z - PARCEL_GAP * Math.floor(k / PARCELS_PER_ROW),
});

/**
 * Where everyone in `house` stands: its leads side by side across the front in its colour, their
 * subagents at desks in rows of four facing the front (each lead's consecutive, in house order),
 * its open parcels on the table by the door, and the observer at the back. Done subagents are
 * not placed; a needs-you or stuck subagent keeps its desk with its pose.
 * Pure: the same House always gives the same places.
 */
export function interior(house: House): InPlaced[] {
  const colour = colourFor(house.project);
  const placed: InPlaced[] = [];
  house.leads.forEach((lead, i) => placed.push({ kind: "lead", id: lead.id, colour, pose: poseOf(lead), at: leadSpot(i, house.leads.length) }));
  let desk = 0;
  for (const lead of house.leads) {
    for (const sub of lead.subagents) {
      if (sub.stage === "done") continue;
      placed.push({ kind: "hat", id: sub.id, lead: lead.id, colour, hat: hatFor(sub.role), pose: poseOf(sub), at: deskSpot(desk++) });
    }
  }
  (house.parcels ?? []).forEach((parcel, k) => placed.push({ kind: "parcel", cwd: house.cwd, number: parcel.number, at: tableSpot(k) }));
  placed.push({ kind: "observer", at: OBSERVER });
  return placed;
}

/**
 * What the whiteboard says: the project, the phase file's phase and note, and its steps marked
 * done before the phase, now at it, next after it and later beyond; a phase outside the steps
 * leaves every step later; no steps gives none; no phase file gives a null phase.
 */
export function boardOf(house: House): Board {
  const file = house.phase;
  const labels = file?.steps ?? [];
  const at = file ? labels.indexOf(file.phase) : -1;
  const steps = labels.map((label, i): BoardStep => ({
    label,
    state: at < 0 ? "later" : i < at ? "done" : i === at ? "now" : i === at + 1 ? "next" : "later",
  }));
  return { project: house.project, phase: file?.phase ?? null, note: file?.note ?? null, steps };
}
