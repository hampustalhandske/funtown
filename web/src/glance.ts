import type { House, Parcel, Town } from "../../server/types.ts";

/** A house's fire: `none` (no failed PR), `handled` (a failed PR while a lead works) or `burning` (a failed PR and no lead works). */
export type Fire = "none" | "handled" | "burning";

/** What a house says at a glance. */
export type Glance = {
  fire: Fire;
  /** Its failed PRs, the one whose check failed first at the front; an unknown time goes last. */
  red: Parcel[];
  /** The PRs waiting for the user, in the house's own order: nothing failed or running, and no lead works. Empty under fog. */
  waiting: Parcel[];
  /** Whether Funtown could not look at the house's PRs lately: its PR list never worked or last worked over `FOG_AFTER_MS` ago. A fire here may be out of date. */
  fog: boolean;
};

/** How old a house's `parcelsAt` may be, in ms, before the page counts its PR list as unread. */
export const FOG_AFTER_MS = 3 * 60_000;

/** Whether any lead of `house` is working; a lead waiting on its subagents still is. Subagents alone don't count. */
const worked = (house: House): boolean => house.leads.some((lead) => lead.stage === "working");

/** Whether `house` is the steward's own, which is never polled for PRs and has no `parcelsAt`. */
const stewards = (house: House): boolean => house.leads.some((lead) => lead.steward === true);

/**
 * Works out what `house` says at a glance from its leads, its PRs' checks and when its PR list last worked.
 * `now` is the page's clock; pure, so the same house and clock always give the same answer.
 */
export function glanceOf(house: House, now: number): Glance {
  const parcels = house.parcels ?? [];
  const working = worked(house);
  const fog = !stewards(house) && (house.parcelsAt === undefined || now - house.parcelsAt > FOG_AFTER_MS);
  // Two unknown times subtract to NaN, which `|| 0` makes a tie; the stable sort then keeps the house's PR order.
  const red = parcels.filter((p) => p.checks === "red").sort((a, b) => (a.redAt ?? Infinity) - (b.redAt ?? Infinity) || 0);
  const waiting = working || fog ? [] : parcels.filter((p) => p.checks === "green" || p.checks === "none");
  return { fire: red.length === 0 ? "none" : working ? "handled" : "burning", red, waiting, fog };
}

/** What a house under fog says: "PRs last read 14:02" (the local time) or "PRs not read yet". */
export function fogWords(house: House): string {
  if (house.parcelsAt === undefined) return "PRs not read yet";
  const at = new Date(house.parcelsAt);
  const two = (n: number) => String(n).padStart(2, "0");
  return `PRs last read ${two(at.getHours())}:${two(at.getMinutes())}`;
}

/** How long the page has lost the server before the town is under fog: the stream has errored and not reopened for this long. */
export const LOST_MS = 3_000;
/** How old the session list may be before the town is under fog. */
export const LIST_FAILING_MS = 10_000;

/** Why the whole town is under fog: the page lost the server at `at`, or the session list has not worked since `since`. */
export type Fog = { why: "lost"; at: number } | { why: "list"; since: number };

/**
 * Whether the whole town is under fog, and why. `lostAt` is when the page's stream errored once it has been out for
 * `LOST_MS` (null while it has the stream); `now` is the page's clock. A lost server comes first. Otherwise the
 * list is failing when `listedAt` is more than `LIST_FAILING_MS` old, or absent (then it has not worked since
 * the server started). Missing hooks and an old Claude Code are not fog. Pure.
 */
export function townFog(town: Town | null, lostAt: number | null, now: number): Fog | null {
  if (lostAt !== null) return { why: "lost", at: lostAt };
  if (town && (town.listedAt === undefined || now - town.listedAt > LIST_FAILING_MS)) return { why: "list", since: town.listedAt ?? town.started };
  return null;
}

/** `at` as the local clock time, "14:02". */
const clock = (at: number): string => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** The plain list's top line while the town is under fog. */
export const fogLine = (fog: Fog): string =>
  fog.why === "lost" ? `Lost the server at ${clock(fog.at)}: this is the town as it was then.` : `Could not list sessions since ${clock(fog.since)}.`;

/** The town page's "can't see" icon label (and tooltip): the reason in a few words. */
export const fogLabel = (fog: Fog): string =>
  fog.why === "lost" ? `Can't see: lost the server at ${clock(fog.at)}` : `Can't see: could not list sessions since ${clock(fog.since)}`;
