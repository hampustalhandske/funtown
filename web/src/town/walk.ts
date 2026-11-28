import { LANE, LEAVE_MS, WALK_SPEED, type Drawn } from "./folk.ts";
import { doorOf } from "./houses.ts";
import { keyOf, type FolkPose } from "./layout.ts";
import type { FlagMode, InLine } from "./line.ts";
import { PILE_DROP } from "./court.ts";
import { castleAt, castleLocal, HILL, onPlateau, onStair } from "./hill.ts";
import { groundHeight, landHeight, SQUARE } from "./island.ts";
import type { Spot } from "./layout.ts";

/**
 * The walks: how a folk gets from one place to another when its place changes between two layouts. A route is a short list
 * of stops from a start to an end: from the house's door across the square to the stair's foot, up the right half of the grand
 * stair and onto the forecourt (and the same way back). Pure; the scene draws it, the page and the frame pace read it.
 */

/** A point on a walk, on the ground at its height there, with the way the walker faces. */
export type Step = { x: number; y: number; z: number; yaw: number };

/** Where on the stair the walkers climb and come down: across from its middle, toward the right as seen from the village. */
const GATE_U = 0.6;
/** How far from its door a folk still counts as at its house, so its walk starts at the door. */
const DOORYARD = 3;

/** The village's three lanes, from their far ends in toward the square (see `lanes` in `village.ts`). */
const LANES: Spot[][] = [
  [{ x: -13.4, z: 1.6 }, { x: -6, z: 1.3 }, { x: 2.8, z: 1.0 }],
  [{ x: -4.8, z: 15 }, { x: -2.7, z: 8.8 }, { x: -0.6, z: 2.6 }],
  [{ x: 14.2, z: -1 }, { x: 10.3, z: -0.1 }, { x: 6.4, z: 0.8 }],
];
/** Ground at least this high is dry enough to walk on. */
const DRY = 0.1;

/** Whether `s` is up at the castle: on its stair or its forecourt. */
const castleSide = (s: Spot) => onStair(s.x, s.z) || onPlateau(s.x, s.z);
const near = (a: Spot, b: Spot, d: number) => Math.hypot(a.x - b.x, a.z - b.z) < d;
const spot = (u: number, w: number): Spot => {
  const [x, z] = castleAt(u, w);
  return { x, z };
};

/** The edge of the square on the way to `p` from its middle, or nothing when `p` is already inside it. */
function squareEdge(p: Spot): Spot[] {
  const d = Math.hypot(p.x - SQUARE.x, p.z - SQUARE.z);
  const r = SQUARE.radius + 0.3;
  return d <= r ? [] : [{ x: SQUARE.x + ((p.x - SQUARE.x) / d) * r, z: SQUARE.z + ((p.z - SQUARE.z) / d) * r }];
}

/** The lowest ground along the legs from `start` through `stops`, sampled every quarter unit. */
function lowest(start: Spot, stops: Spot[]): number {
  const route = [start, ...stops];
  let low = Infinity;
  for (let d = 0; d <= routeLength(route); d += 0.25) {
    const s = along(route, d);
    low = Math.min(low, landHeight(s.x, s.z));
  }
  return low;
}

/**
 * The stops from `door` to the square's edge: straight when that stays dry, else the shortest of the lanes that does (in from
 * its far end), else whichever stays highest.
 */
function wayToSquare(door: Spot): Spot[] {
  const ways = [[], ...LANES].map((lane) => [...lane, ...squareEdge(lane[lane.length - 1] ?? door)]);
  const scored = ways.map((stops) => ({ stops, low: lowest(door, stops), length: routeLength([door, ...stops]) }));
  const dry = scored.filter((w) => w.low >= DRY).sort((a, b) => a.length - b.length);
  return (dry[0] ?? scored.sort((a, b) => b.low - a.low)[0]).stops;
}

/**
 * The stops of a walk from `from` to `to`. Between the village and the castle: `door` first (when `from` stands by it), the
 * edge of the square toward it, the stair's foot, the stair's right half up to the tread of `to` (or the forecourt's edge), and
 * `to`; coming down is that backwards. Anywhere else it is straight. `door` is the walker's house door, null for none.
 */
export function routeOf(from: Spot, to: Spot, door: Spot | null): Spot[] {
  const [up, high] = [castleSide(to), castleSide(from)];
  if (up === high) return [from, to];
  if (high) return [...routeOf(to, from, door)].reverse();
  const stops = [from];
  if (door !== null && near(from, door, DOORYARD)) {
    if (!near(from, door, 1e-6)) stops.push(door);
    stops.push(...wayToSquare(door));
  }
  stops.push(spot(GATE_U, HILL.stair.foot + 0.8));
  stops.push(spot(GATE_U, onStair(to.x, to.z) ? castleLocal(to.x, to.z)[1] : HILL.edge - 0.1));
  stops.push(to);
  return stops;
}

/** How long `route` is, along its stops. */
export const routeLength = (route: Spot[]): number => route.slice(1).reduce((n, s, i) => n + Math.hypot(s.x - route[i].x, s.z - route[i].z), 0);

/** The step `distance` along `route` (clamped to its ends), on the ground there, facing the way the leg goes. */
export function along(route: Spot[], distance: number): Step {
  let left = Math.max(0, distance);
  for (let i = 1; i < route.length; i++) {
    const [a, b] = [route[i - 1], route[i]];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= d || i === route.length - 1) {
      const k = d === 0 ? 1 : Math.min(1, left / d);
      const [x, z] = [a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k];
      return { x, y: groundHeight(x, z), z, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    left -= d;
  }
  const only = route[0];
  return { x: only.x, y: groundHeight(only.x, only.z), z: only.z, yaw: 0 };
}

/**
 * How a folk goes: `up` to the castle from the village (its slip and flag held up, still), `step` along the line at the
 * castle (it keeps whatever it did), `home` from the castle down to its house (its flag furled, its hands empty), `about`
 * anywhere else (a short walk by its house), `carry` up to the castle with a parcel in its arms, `back` down from laying it
 * (nothing in its hands, no flag).
 */
export type Gait = "up" | "step" | "home" | "about" | "carry" | "back";

/**
 * One folk's walk: its route from where it stood, when it set out, how fast it goes and how. A carry walk goes to the pile and
 * back by one route: it holds `parcel` (the parcel's key) until `drop`, how far along the route the pile is, lays it there and
 * goes home.
 */
export type Walk = { route: Spot[]; startedAt: number; speed: number; gait: Gait; carry?: { parcel: string; drop: number } };
/** The walks going on, by the key of the folk that walks them (see `keyOf`). */
export type Walks = ReadonlyMap<string, Walk>;

/** When `walk` is over, in ms. */
export const walkEnd = (walk: Walk): number => walk.startedAt + (routeLength(walk.route) / walk.speed) * 1000;
/** The walk of `key` if it is still going at `now`. */
const going = (walks: Walks, key: string, now: number): Walk | undefined => {
  const walk = walks.get(key);
  return walk !== undefined && now < walkEnd(walk) ? walk : undefined;
};
/** Where `walk`'s walker is at `now`. */
export const stepOf = (walk: Walk, now: number): Step => along(walk.route, ((now - walk.startedAt) / 1000) * walk.speed);
/** When `walk` reaches the pile and lays its parcel, in ms; undefined for a walk that carries none. */
const dropEnd = (walk: Walk): number | undefined => (walk.carry === undefined ? undefined : walk.startedAt + (walk.carry.drop / walk.speed) * 1000);
/** How the folk `key` is going at `now`, or undefined when it is not walking. A carrier goes `back` once it has laid its parcel. */
export const gaitOf = (walks: Walks, key: string, now: number): Gait | undefined => {
  const walk = going(walks, key, now);
  return walk === undefined ? undefined : walk.carry !== undefined && now >= dropEnd(walk)! ? "back" : walk.gait;
};
/** The parcels in someone's arms at `now`, by the parcel's key, each with the key of the folk that carries it: not yet laid on the pile. */
export function carrying(walks: Walks, now: number): Map<string, string> {
  const held = new Map<string, string>();
  for (const [key, walk] of walks) if (going(walks, key, now) !== undefined && walk.carry !== undefined && now < dropEnd(walk)!) held.set(walk.carry.parcel, key);
  return held;
}
/** Whether any walk is going at `now`: the signal the frame pace reads. */
export const anyWalking = (walks: Walks, now: number): boolean => [...walks.keys()].some((key) => going(walks, key, now) !== undefined);
/** The next moment after `now` when what a walk shows changes (a parcel laid, a walk over), in ms; Infinity when none will. The page draws again then. */
export const nextChange = (walks: Walks, now: number): number =>
  Math.min(...[...walks.values()].flatMap((walk) => [dropEnd(walk) ?? 0, walkEnd(walk)].filter((t) => t > now)), Infinity);

/** Whether a drawn thing stands in the line or up at the castle, where its folk are not at their houses. */
const atCastle = (p: Drawn): boolean => ("line" in p && p.line !== undefined) || castleSide(p.at);

/**
 * Who brings which parcel up: each parcel newly on the pile (it was not on it in `was`, in a house that was drawn then) goes
 * with its `carrier`, if that folk was drawn then too. A carrier brings one at a time, the first parcel in order. Keys are the
 * carrier's, to the parcel's. A first view (nothing drawn) and a house just added carry nothing.
 */
function carriesOf(was: Map<string, Drawn>, after: Drawn[]): Map<string, string> {
  const carries = new Map<string, string>();
  for (const p of after) {
    if (p.kind !== "parcel" || p.place !== "pile" || p.carrier === null || carries.has(p.carrier)) continue;
    const prev = was.get(keyOf(p));
    if (was.has(`building:${p.cwd}`) && was.has(p.carrier) && (prev === undefined || (prev.kind === "parcel" && prev.place !== "pile"))) carries.set(p.carrier, keyOf(p));
  }
  return carries;
}

/** The route of a lead that goes from `from` to lay a parcel at the pile and comes home to `home`, and how far along it the pile is. */
function carryRoute(from: Spot, home: Spot, door: Spot | null): { route: Spot[]; drop: number } {
  const up = routeOf(from, PILE_DROP, door);
  return { route: [...up, ...routeOf(PILE_DROP, home, door).slice(1)], drop: routeLength(up) };
}

/**
 * The walks going at `now` once `after` replaces `before` (what was drawn last): each folk whose place changed walks from
 * where it is now (on its walk, else where it stood) to its new place, by its house's door. A walk already on its way to
 * that place is kept. A folk that was not drawn before stands where it is, with no walk. The lead that carries a parcel newly
 * on the pile (see `carriesOf`) goes up with it from where it stands, lays it and walks home, unless it is already walking.
 * Pure.
 */
export function walksAfter(walks: Walks, before: Drawn[], after: Drawn[], now: number): Walks {
  const was = new Map(before.map((p) => [keyOf(p), p]));
  const doors = new Map(after.flatMap((p) => (p.kind === "building" ? [[p.cwd, doorOf(p)] as const] : [])));
  const carries = carriesOf(was, after);
  const piled = new Set(after.flatMap((p) => (p.kind === "parcel" && p.place === "pile" ? [keyOf(p)] : [])));
  const next = new Map<string, Walk>();
  for (const p of after) {
    if (p.kind !== "lead" && p.kind !== "hat") continue;
    const [key, prev] = [keyOf(p), was.get(keyOf(p))];
    if (prev === undefined) continue;
    const cur = going(walks, key, now);
    const goal = cur === undefined ? prev.at : cur.route[cur.route.length - 1];
    // A carrier whose parcel is gone from the pile (merged, or checking again) before it lays it turns for home from where it is.
    const lost = cur?.carry !== undefined && !piled.has(cur.carry.parcel) && now < dropEnd(cur)!;
    if (!lost && Math.hypot(goal.x - p.at.x, goal.z - p.at.z) < 1e-6) {
      const parcel = carries.get(key);
      if (cur !== undefined) next.set(key, cur);
      else if (parcel !== undefined) {
        const { route, drop } = carryRoute(prev.at, p.at, doors.get(p.cwd) ?? null);
        next.set(key, { route, startedAt: now, speed: WALK_SPEED, gait: "carry", carry: { parcel, drop } });
      }
      continue;
    }
    const from = cur === undefined ? prev.at : stepOf(cur, now);
    const [there, fromThere] = [atCastle(p), cur === undefined ? atCastle(prev) : cur.gait === "step"];
    const carried = cur?.gait === "carry" || cur?.gait === "back";
    const gait: Gait = there ? (fromThere ? "step" : "up") : carried ? "back" : fromThere || cur?.gait === "up" || cur?.gait === "home" ? "home" : "about";
    const speed = p.pose === "leave" ? LANE / (LEAVE_MS / 1000) : WALK_SPEED;
    next.set(key, { route: routeOf({ x: from.x, z: from.z }, p.at, doors.get(p.cwd) ?? null), startedAt: now, speed, gait });
  }
  return next;
}

/**
 * The flag a folk holds as it goes (`gait`, undefined when it stands): still while it climbs, however loud its place, so the
 * loud thing waves only once it is at the table; furled on the way home; else the line's own, none outside it.
 */
export function drawnFlag(p: { pose: FolkPose; line?: InLine }, gait: Gait | undefined): FlagMode | null {
  return gait === "up" ? "still" : gait === "home" ? "furled" : (p.line?.flag ?? null);
}

/** What the hidden list says of a folk that goes `gait`: whether it climbs or heads home; null for any other. */
export const walkWords = (gait: Gait | undefined): string | null => (gait === "up" ? "walking up" : gait === "home" ? "walking home" : gait === "carry" ? "carrying a parcel" : gait === "back" ? "walking home" : null);
