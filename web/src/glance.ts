import type { House, Parcel } from "../../server/types.ts";

/** A house's fire: `none` (no failed PR), `handled` (a failed PR while a lead works) or `burning` (a failed PR and no lead works). */
export type Fire = "none" | "handled" | "burning";

/** What a house says at a glance. */
export type Glance = {
  fire: Fire;
  /** Its failed PRs, the one whose check failed first at the front; an unknown time goes last. */
  red: Parcel[];
  /** The PRs waiting for the user, in the house's own order: nothing failed or running, and no lead works. */
  waiting: Parcel[];
};

/** Whether any lead of `house` is working; a lead waiting on its subagents still is. Subagents alone don't count. */
const worked = (house: House): boolean => house.leads.some((lead) => lead.stage === "working");

/**
 * Works out what `house` says at a glance from its leads and its PRs' checks. `now` is the page's clock;
 * pure, so the same house and clock always give the same answer.
 */
export function glanceOf(house: House, now: number): Glance {
  void now;
  const parcels = house.parcels ?? [];
  const working = worked(house);
  // Two unknown times subtract to NaN, which `|| 0` makes a tie; the stable sort then keeps the house's PR order.
  const red = parcels.filter((p) => p.checks === "red").sort((a, b) => (a.redAt ?? Infinity) - (b.redAt ?? Infinity) || 0);
  const waiting = working ? [] : parcels.filter((p) => p.checks === "green" || p.checks === "none");
  return { fire: red.length === 0 ? "none" : working ? "handled" : "burning", red, waiting };
}
