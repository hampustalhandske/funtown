import type { House, Parcel, Town } from "../../server/types.ts";

/** What a PR says when it is ready to look at: nothing failed or runs, no lead of its house works, and its house is not under fog. */
export const WAITS = "waits for you";

/** What a fire under fog says: Funtown can't be sure it still burns. */
export const FIRE_UNDER_FOG = "failed when last read";

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

/**
 * Works out what `house` says at a glance from its leads, its PRs' checks and when its PR list last worked.
 * `now` is the page's clock; pure, so the same house and clock always give the same answer.
 */
export function glanceOf(house: House, now: number): Glance {
  const parcels = house.parcels ?? [];
  // A lead waiting on its subagents still works; subagents alone don't hold the bucket.
  const leadWorks = house.leads.some((lead) => lead.stage === "working");
  // The steward's own house is never polled for PRs, so it has no `parcelsAt` and is never under fog.
  const stewardsHouse = house.leads.some((lead) => lead.steward === true);
  const fog = !stewardsHouse && (house.parcelsAt === undefined || now - house.parcelsAt > FOG_AFTER_MS);
  // Two unknown times subtract to NaN, which `|| 0` makes a tie; the stable sort then keeps the house's PR order.
  const red = parcels.filter((p) => p.checks === "red").sort((a, b) => (a.redAt ?? Infinity) - (b.redAt ?? Infinity) || 0);
  const waiting = leadWorks || fog ? [] : parcels.filter((p) => p.checks === "green" || p.checks === "none");
  return { fire: red.length === 0 ? "none" : leadWorks ? "handled" : "burning", red, waiting, fog };
}

/** `at` as the local clock time, "14:02". */
const clock = (at: number): string => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** What a house under fog says: "PRs last read 14:02" (the local time) or "PRs not read yet". */
export function fogWords(house: House): string {
  return house.parcelsAt === undefined ? "PRs not read yet" : `PRs last read ${clock(house.parcelsAt)}`;
}

/** How long the page has lost the server before the town is under fog: the stream has errored and not reopened for this long. */
export const LOST_MS = 3_000;
/** How old the session list may be before the town is under fog. */
export const LIST_FAILING_MS = 10_000;

/** Why the whole town is under fog: the page lost the server at `at`, or the session list has not worked since `since`. */
export type Fog = { why: "lost"; at: number } | { why: "list"; since: number };

/** Whether the whole town is under fog, and why: the page lost the server (`lostAt`, once it has been out `LOST_MS`), or `listedAt` is absent or over `LIST_FAILING_MS` old at `now`. Pure. */
export function townFog(town: Town | null, lostAt: number | null, now: number): Fog | null {
  if (lostAt !== null) return { why: "lost", at: lostAt };
  if (town && (town.listedAt === undefined || now - town.listedAt > LIST_FAILING_MS)) return { why: "list", since: town.listedAt ?? town.started };
  return null;
}

/** Why the town is under fog, in a few words: "lost the server at 14:02" or "could not list sessions since 14:02". */
const reasonOf = (fog: Fog): string => (fog.why === "lost" ? `lost the server at ${clock(fog.at)}` : `could not list sessions since ${clock(fog.since)}`);

/** The plain list's top line while the town is under fog: the reason as a sentence. */
export const fogLine = (fog: Fog): string => `${reasonOf(fog).replace(/^./, (c) => c.toUpperCase())}${fog.why === "lost" ? ": this is the town as it was then." : "."}`;

/** The town page's "can't see" icon label (and tooltip). */
export const fogLabel = (fog: Fog): string => `Can't see: ${reasonOf(fog)}`;
