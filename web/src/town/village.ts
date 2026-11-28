import { Color, QuadraticBezierCurve3, Vector3 } from "three";
import { lamp } from "./castle.ts";
import { HILL, castleAt, onPlateau, onStair } from "./hill.ts";
import { groundHeight, landHeight, SQUARE } from "./island.ts";
import { rng } from "./noise.ts";
import { PartList } from "./parts.tsx";

/**
 * The harbour village's dressing, as parts and numbers: the seawall, quay, pier and clutter, the cobbled square, the lanes
 * and the stepping stones to each door, the lighthouse and the tree groves. Pure and seeded, so every load draws the same
 * village. Nothing here moves except the boats, which `BOATS` places and `Boats.tsx` bobs.
 */

type Point = { x: number; z: number };

/** `base` a little lighter or darker, as a hex colour. */
const shade = (base: string, by: number) => `#${new Color(base).offsetHSL(0, 0, by).getHexString()}`;

/** A bench at (x, z) turned `yaw`: a seat, a back and two legs. */
function bench(list: PartList, x: number, z: number, yaw: number) {
  list.at(x, groundHeight(x, z), z, yaw);
  list.put("box", [0, 0.36, 0], { s: [1.1, 0.08, 0.34], c: "#a5805e" });
  list.put("box", [0, 0.6, -0.15], { s: [1.1, 0.3, 0.06], c: "#a5805e" });
  for (const side of [-1, 1]) list.put("box", [side * 0.45, 0.18, 0], { s: [0.08, 0.36, 0.3], c: "#6b5444" });
}

/** A stone well with a little tiled roof on two posts. */
function well(list: PartList, x: number, z: number) {
  list.at(x, groundHeight(x, z), z);
  list.put("cyl", [0, 0.27, 0], { s: [1.08, 0.55, 1.08], c: "#b9b0a2" });
  list.put("cyl", [0, 0.5, 0], { s: [0.8, 0.04, 0.8], c: "#4f7f9c" });
  for (const side of [-1, 1]) list.put("box", [side * 0.45, 0.8, 0], { s: [0.08, 1.0, 0.08], c: "#8a6a50" });
  list.put("gable", [0, 1.06, 0], { r: [0, Math.PI / 2, 0], s: [1.3, 0.45, 0.9], c: "#c46a4e" });
}

/** A round cobbled square with a well in the middle, two benches and four lamps round its edge. */
function square(list: PartList) {
  const { x, z, radius } = SQUARE;
  const r = rng(7);
  list.at(0, 0, 0);
  for (let ring = 0; ring * 0.36 + 0.75 <= radius; ring++) {
    const rad = 0.75 + ring * 0.36;
    const n = Math.round((Math.PI * 2 * rad) / 0.36);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.2;
      const [px, pz] = [x + Math.cos(a) * rad, z + Math.sin(a) * rad];
      list.put("box", [px, groundHeight(px, pz) + 0.03, pz], { r: [0, -a, 0], s: [0.32, 0.08, 0.28], c: shade("#d9cfbd", (r() - 0.5) * 0.1) });
    }
  }
  well(list, x, z);
  bench(list, x - radius * 0.7, z + radius * 0.6, 0.8);
  bench(list, x + radius * 0.7, z + radius * 0.6, -0.8);
  for (const a of [0.9, 2.25, 3.9, 5.5]) lamp(list, x + Math.cos(a) * (radius + 0.5), z + Math.sin(a) * (radius + 0.5));
}

/**
 * Stones (or, when `cobbles`, paving a lane wide) along a gentle curve from `a` to `b`, set on the ground and skipping the
 * water. `bend` pushes the curve's middle sideways. Returns the curve's points.
 */
function path(list: PartList, a: Point, b: Point, { cobbles = false, step = 0.5, width = 1, bend = 0.15, seed = 0 } = {}): Point[] {
  const mid = new Vector3((a.x + b.x) / 2 + (b.z - a.z) * bend, 0, (a.z + b.z) / 2 - (b.x - a.x) * bend);
  const curve = new QuadraticBezierCurve3(new Vector3(a.x, 0, a.z), mid, new Vector3(b.x, 0, b.z));
  const n = Math.max(2, Math.round(curve.getLength() / step));
  const r = rng(Math.floor(a.x * 100 + b.z * 7) + seed);
  const points: Point[] = [];
  list.at(0, 0, 0);
  for (let i = 0; i <= n; i++) {
    const [p, t] = [curve.getPoint(i / n), curve.getTangent(i / n)];
    points.push({ x: p.x, z: p.z });
    for (let k = 0; k < width; k++) {
      const off = (k - (width - 1) / 2) * 0.36 + (r() - 0.5) * 0.08;
      const [x, z] = [p.x - t.z * off, p.z + t.x * off];
      const [yaw, sx, sz, c] = [Math.atan2(t.x, t.z) + (r() - 0.5) * 0.5, 0.85 + r() * 0.3, 0.85 + r() * 0.3, shade("#d8cdb8", (r() - 0.5) * 0.08)];
      if (landHeight(x, z) < 0.25 || onStair(x, z)) continue;
      const y = groundHeight(x, z) + 0.03;
      if (cobbles) list.put("box", [x, y, z], { r: [0, yaw, 0], s: [0.34 * sx, 0.08, 0.3 * sz], c: shade("#d9cfbd", (r() - 0.5) * 0.1) });
      else list.put("cyl", [x, y, z], { r: [0, yaw, 0], s: [0.48 * sx, 0.07, 0.48 * sz], c });
    }
  }
  return points;
}

/** The quay along the cove's north shore, from one end to the other. */
const QUAY = { from: { x: 1.5, z: 5.0 }, to: { x: 10.0, z: 5.6 } };
/** The way out to the water from the quay: almost straight toward the camera, as a unit vector. */
const OUT = { x: 0.05 / Math.hypot(0.05, 1), z: 1 / Math.hypot(0.05, 1) };

/** The lanes between the square and the rest of the island: west, east, south to the lighthouse, and the stair's foot. Their cobbles go in `list`. */
function lanes(list: PartList): Point[] {
  const foot = castleAt(0, HILL.stair.foot + 0.5);
  return [
    ...path(list, { x: 2.8, z: 1.0 }, { x: -13.4, z: 1.6 }, { cobbles: true, width: 2, step: 0.34, bend: -0.12 }),
    ...path(list, { x: -0.6, z: 2.6 }, { x: -4.8, z: 15.0 }, { bend: -0.1 }),
    ...path(list, { x: 6.4, z: 0.8 }, { x: 14.2, z: -1.0 }, { step: 0.55, bend: 0.2 }),
    ...path(list, { x: SQUARE.x, z: SQUARE.z - 1.6 }, { x: foot[0], z: foot[1] }, { cobbles: true, width: 2, step: 0.34, bend: 0 }),
  ];
}

/**
 * The stone seawall and paved quay between the quay's ends: at each step along, it walks out toward the water to the shore,
 * sets a wall block there and four rows of paving behind it. Returns the wall's blocks.
 */
function quay(list: PartList): Point[] {
  const r = rng(4);
  const wall: Point[] = [];
  const n = Math.round(Math.hypot(QUAY.to.x - QUAY.from.x, QUAY.to.z - QUAY.from.z) / 0.36);
  const yaw = Math.atan2(QUAY.to.x - QUAY.from.x, QUAY.to.z - QUAY.from.z) + Math.PI / 2;
  list.at(0, 0, 0);
  for (let i = 0; i <= n; i++) {
    const [px, pz] = [QUAY.from.x + ((QUAY.to.x - QUAY.from.x) * i) / n, QUAY.from.z + ((QUAY.to.z - QUAY.from.z) * i) / n];
    let k = 0;
    while (k < 14 && landHeight(px + OUT.x * k, pz + OUT.z * k) > 0.12) k += 0.05;
    if (k >= 14 || k === 0) continue;
    const q = { x: px + OUT.x * (k - 0.1), z: pz + OUT.z * (k - 0.1) };
    wall.push(q);
    list.put("box", [q.x, 0.05, q.z], { r: [0, yaw, 0], s: [0.46, 0.26, 0.36], c: shade("#b9b0a2", (r() - 0.5) * 0.08) });
    for (let j = 1; j <= 4; j++) {
      const [x, z] = [q.x - OUT.x * j * 0.32 + (j % 2) * 0.08, q.z - OUT.z * j * 0.32];
      list.put("box", [x, landHeight(x, z) + 0.03, z], { r: [0, yaw + r() * 0.3, 0], s: [0.34, 0.08, 0.3], c: shade("#d9cfbd", (r() - 0.5) * 0.1) });
    }
  }
  return wall;
}

/** Crates, barrels and planters behind some of the wall's blocks. */
function clutter(list: PartList, wall: Point[]) {
  const r = rng(4);
  const crate = (x: number, y: number, z: number, c: string) => list.put("box", [x, y + 0.18, z], { r: [0, r(), 0], s: [0.42, 0.36, 0.42], c });
  const barrel = (x: number, y: number, z: number, c: string) => list.put("cyl", [x, y + 0.23, z], { s: [0.38, 0.46, 0.38], c });
  list.at(0, 0, 0);
  wall.forEach((q, i) => {
    const [bx, bz] = [q.x - 0.0375, q.z - 0.75];
    const y = landHeight(bx, bz);
    if (i % 6 === 3) barrel(q.x, landHeight(q.x, q.z - 0.3) - 0.05, q.z - 0.3, "#6b6460");
    if (i % 11 === 5) {
      crate(bx, y, bz, "#c9a27a");
      crate(bx + 0.45, y, bz + 0.05, "#bf966c");
      crate(bx + 0.22, y + 0.36, bz, "#c9a27a");
      barrel(bx - 0.5, y, bz + 0.1, "#a07c5a");
    }
    if (i % 11 === 9) list.put("sph", [bx, y + 0.16, bz], { s: [0.64, 0.32, 0.56], c: "#8f8a6e" });
    if (i % 9 === 1) {
      const [cx, cz] = [q.x - 0.07, q.z - 1.35];
      const cy = landHeight(cx, cz);
      list.put("cyl", [cx, cy + 0.1, cz], { s: [0.4, 0.2, 0.4], c: "#c46a4e" });
      for (let k = 0; k < 4; k++) list.put("sph", [cx + (k - 1.5) * 0.08, cy + 0.26, cz + (k % 2) * 0.06], { s: 0.12, c: ["#f2b8c6", "#ffffff", "#f6e3a1", "#c9b6e4"][k] });
    }
  });
}

/** The pier: planks on posts running out over the water from the wall's block nearest x = 5.6. Returns its far end. */
function pier(list: PartList, wall: Point[]): Point {
  const mid = wall.reduce((a, b) => (Math.abs(b.x - 5.6) < Math.abs(a.x - 5.6) ? b : a));
  const start = { x: mid.x - OUT.x * 0.4, z: mid.z - OUT.z * 0.4 };
  const [len, yaw] = [3.6, Math.atan2(OUT.x, OUT.z)];
  list.at(0, 0, 0);
  for (let i = 0; i < Math.round(len / 0.3); i++) {
    const [x, z] = [start.x + OUT.x * (0.1 + i * 0.3), start.z + OUT.z * (0.1 + i * 0.3)];
    list.put("box", [x, 0.42, z], { r: [0, yaw, 0], s: [1.3, 0.06, 0.26], c: i % 2 ? "#a5805e" : "#9a7655" });
    if (i % 3 === 0) for (const side of [-1, 1]) list.put("box", [x + OUT.z * side * 0.6, -0.125, z - OUT.x * side * 0.6], { s: [0.1, 1.35, 0.1], c: "#6b5444" });
  }
  return { x: start.x + OUT.x * len, z: start.z + OUT.z * len };
}

/** A rowing boat: where it floats, which way it points, and its hull colour. They bob in `Boats.tsx`. */
export type Boat = { x: number; z: number; yaw: number; colour: string };

/** The lighthouse stands here. */
const LIGHTHOUSE = { x: -3.0, z: 16.4 };

/** A lighthouse on the south point: a stone base, four stripes, a lamp room, a deck and a cap. */
function lighthouse(list: PartList, x: number, z: number) {
  list.at(x, groundHeight(x, z), z);
  list.put("cyl", [0, -0.4, 0], { s: [1.55, 1.0, 1.55], c: "#a9a092" });
  for (let i = 0; i < 4; i++) list.put("cyl", [0, 0.35 + i * 0.7, 0], { s: [1.1 - i * 0.12, 0.7, 1.1 - i * 0.12], c: i % 2 ? "#6f8fa8" : "#f4efe6" });
  list.put("cyl", [0, 2.82, 0], { s: [1.1, 0.08, 1.1], c: "#7a5a42" });
  list.put("pane", [0, 3.05, 0], { s: [0.72, 0.45, 0.72] });
  list.put("cone", [0, 3.28, 0], { s: [1.0, 0.5, 1.0], c: "#5f7088" });
}

/** The village's parts that stay put (the square, the lanes, the seawall, quay and clutter, the pier and the lighthouse) and its boats. Built once. */
export function village(): { parts: PartList; boats: Boat[]; lane: Point[] } {
  const list = new PartList();
  square(list);
  const lane = lanes(list);
  const wall = quay(list);
  clutter(list, wall);
  const end = pier(list, wall);
  lighthouse(list, LIGHTHOUSE.x, LIGHTHOUSE.z);
  const boats: Boat[] = [
    { x: end.x + 1.3, z: end.z - 1.2, yaw: 0.15, colour: "#6d9db0" },
    { x: end.x - 1.3, z: end.z - 1.8, yaw: -0.3, colour: "#e0c08a" },
    { x: end.x - 2.4, z: end.z + 1.4, yaw: 0.9, colour: "#c46a4e" },
    { x: end.x + 2.6, z: end.z + 2.2, yaw: -0.5, colour: "#81b29a" },
  ];
  return { parts: list, boats, lane };
}

/** Stepping stones from each door to the nearest of the square's edge and the lane's points, which `lane` lists. */
export function doorPaths(list: PartList, doors: Point[], lane: Point[]): void {
  for (const door of doors) {
    const edge = Math.hypot(door.x - SQUARE.x, door.z - SQUARE.z);
    const toSquare = { x: SQUARE.x + ((door.x - SQUARE.x) / edge) * (SQUARE.radius + 0.3), z: SQUARE.z + ((door.z - SQUARE.z) / edge) * (SQUARE.radius + 0.3) };
    const near = (p: Point) => Math.hypot(p.x - door.x, p.z - door.z);
    const goal = [toSquare, ...lane].reduce((a, b) => (near(b) < near(a) ? b : a));
    if (near(goal) > 1) path(list, door, goal, { step: 0.5, bend: 0.1 });
  }
}

/** A tree: where it stands, its size and its leaves' colour. */
export type Tree = { x: number; z: number; scale: number; colour: string };

/** Each grove: [x, z, half-width, half-depth, trees], all on hills. */
const GROVES: [number, number, number, number, number][] = [
  [-8, -9, 3.2, 2.4, 14], [-16.5, 4, 1.4, 1.4, 4], [14, -6.5, 2, 1.6, 6], [15.5, -7.5, 1.6, 1.4, 4],
  [-2, -16.5, 1.6, 1.4, 4], [14, -15.5, 1.4, 1.2, 3], [0, -9, 1.4, 1.8, 4],
];
const LEAVES = ["#6fae5c", "#82bd62", "#5e9e57", "#8cc06a"];
/** Trees stand no lower than this: low meadow and the shore stay open. */
const HILL_FROM = 0.8;

/** Whether a tree may stand at (x, z) whatever the houses: high enough, and off the castle's forecourt and its stair, with room round both. */
function hilly(x: number, z: number): boolean {
  if (groundHeight(x, z) < HILL_FROM || onPlateau(x, z) || onStair(x, z)) return false;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) if (onPlateau(x + 1.4 * Math.cos(a), z + 1.4 * Math.sin(a))) return false;
  for (let w = HILL.edge - 3; w <= HILL.stair.foot + 4; w++) {
    const [sx, sz] = castleAt(0, w);
    if (Math.hypot(sx - x, sz - z) < 3.2) return false;
  }
  return true;
}

let groves: Tree[] | null = null;
/** The groves' trees before any house is thought of: seeded, on hills only. Made once. */
function baseTrees(): Tree[] {
  if (groves) return groves;
  const r = rng(59);
  groves = [];
  for (const [gx, gz, sx, sz, n] of GROVES) {
    for (let i = 0, k = 0; i < n * 6 && k < n; i++) {
      const [x, z] = [gx + (r() - 0.5) * sx * 2, gz + (r() - 0.5) * sz * 2];
      const [scale, colour] = [0.8 + r() * 0.5, LEAVES[k % 4]];
      if (!hilly(x, z)) continue;
      groves.push({ x, z, scale, colour });
      k++;
    }
  }
  return groves;
}

/**
 * The trees of the groves that stand clear of every house (`lots`) and door by 3 units and of the square by 3 units beyond its
 * edge. A house only takes the trees near it: the rest stay where they were.
 */
export function treesFor(lots: Point[], doors: Point[]): Tree[] {
  const near = (t: Point, to: Point, reach: number) => Math.hypot(t.x - to.x, t.z - to.z) < reach;
  return baseTrees().filter((t) => !near(t, SQUARE, SQUARE.radius + 3.2) && !lots.some((l) => near(t, l, 3.4)) && !doors.some((d) => near(t, d, 3.2)));
}

/** The parts of `trees`: a trunk and a crown each. */
export function treeParts(list: PartList, trees: Tree[]): void {
  list.at(0, 0, 0);
  for (const { x, z, scale: s, colour } of trees) {
    const y = groundHeight(x, z);
    list.put("cyl", [x, y + 0.3 * s, z], { s: [0.23 * s, 0.7 * s, 0.23 * s], c: "#8a6a50" });
    list.put("sph", [x, y + 0.95 * s, z], { s: [1.24 * s, 1.36 * s, 1.24 * s], c: colour });
  }
}
