import type { House, Parcel } from "../../server/types.ts";

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
