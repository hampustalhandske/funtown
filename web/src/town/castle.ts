import { CASTLE, CASTLE_TURN, HILL, TREAD, castleAt, treadHeight } from "./hill.ts";
import { groundHeight, landHeight } from "./island.ts";
import { PartList } from "./parts.tsx";

const STONE = "#b9b0a2";
const WALL = "#c2b9a8";
const CAP = "#d6cebf";
const SLATE = "#5f7088";
const TREADS = ["#d8d0c1", "#d2c9b9", "#ddd6c8"];
const PAVING = ["#cfc6b6", "#c6bdab", "#d6cebf"];
/** The castle's front: its gate steps reach this far forward of its middle. */
const CASTLE_FRONT = 2.2;
/** How tall the castle stands above the plateau, to the tips of its front towers. */
export const CASTLE_HEIGHT = 5.9;

/** A street lamp at (x, z) on the ground: a post, a lantern and its cap. */
function lamp(list: PartList, x: number, z: number) {
  list.at(x, groundHeight(x, z), z);
  list.put("cyl", [0, 0.6, 0], { s: [0.11, 1.2, 0.11], c: "#6b5444" });
  list.put("pane", [0, 1.3, 0], { s: [0.22, 0.26, 0.22] });
  list.put("pyramid", [0, 1.43, 0], { s: [0.28, 0.14, 0.28], c: "#4f4038" });
}

/** The toy fort: a keep with merlons and a slate roof, four round towers (the front two taller), the gate with its steps, and your banners. */
function castle(list: PartList) {
  list.at(CASTLE.x, HILL.top, CASTLE.z, CASTLE_TURN);
  const s = "#ddd4c4";
  list.put("box", [0, -0.7, 0], { s: [4.8, 1.8, 4.0], c: "#a9a092" });
  list.put("box", [0, 0.12, 0], { s: [4.5, 0.26, 3.7], c: STONE });
  list.put("box", [0, 1.65, 0], { s: [3.0, 2.8, 2.4], c: s });
  list.put("box", [0, 1.55, 0], { s: [3.12, 0.14, 2.52], c: "#c9bfae" });
  for (let k = 0; k < 7; k++) for (const side of [-1, 1]) list.put("box", [-1.35 + k * 0.45, 3.2, side * 1.12], { s: [0.26, 0.32, 0.22], c: s });
  for (let k = 0; k < 5; k++) for (const side of [-1, 1]) list.put("box", [side * 1.42, 3.2, -0.9 + k * 0.45], { s: [0.22, 0.32, 0.26], c: s });
  list.put("pyramid", [0, 3.05, 0], { s: [2.2, 1.2, 1.7], c: SLATE });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [tall, x, z] = [sz > 0 ? 4.0 : 3.5, sx * 1.62, sz * 1.32];
      list.put("cyl", [x, 0.25 + tall / 2, z], { s: [1.15, tall, 1.15], c: "#d3c9b8" });
      list.put("cyl", [x, 0.25 + tall, z], { s: [1.35, 0.2, 1.35], c: "#c9bfae" });
      list.put("cone", [x, 0.35 + tall, z], { s: [1.4, 1.5, 1.4], c: SLATE });
      if (sz > 0) for (const y of [1.4, 2.6]) list.put("pane", [x, y, z + 0.56], { s: [0.14, 0.42, 0.06] });
    }
  }
  list.put("box", [0, 0.9, 1.22], { s: [1.1, 1.3, 0.1], c: "#8f8377" });
  list.put("cyl", [0, 1.55, 1.22], { r: [Math.PI / 2, 0, 0], s: [1.1, 0.1, 1.1], c: "#8f8377" });
  list.put("box", [0, 0.85, 1.27], { s: [0.86, 1.2, 0.08], c: "#8a5a3a" });
  list.put("cyl", [0, 1.45, 1.27], { r: [Math.PI / 2, 0, 0], s: [0.86, 0.08, 0.86], c: "#8a5a3a" });
  for (const y of [0.55, 0.95, 1.35]) for (const sx of [-1, 1]) list.put("sph", [sx * 0.26, y, 1.32], { s: 0.07, c: "#e8b84a" });
  for (let k = 0; k < 3; k++) list.put("box", [0, 0.2 - k * 0.14, 1.5 + k * 0.28], { s: [1.5, 0.14, 0.3], c: STONE });
  for (const sx of [-1, 1]) {
    list.put("box", [sx * 0.95, 2.25, 1.23], { s: [0.42, 1.0, 0.04], c: "#7b5aa6" });
    list.put("box", [sx * 0.95, 2.25, 1.255], { s: [0.12, 1.0, 0.02], c: "#e8b84a" });
    list.put("gable", [sx * 0.95, 1.65, 1.23], { r: [Math.PI, 0, 0], s: [0.42, 0.22, 0.04], c: "#7b5aa6" });
  }
  list.put("pane", [0, 2.45, 1.22], { s: [0.34, 0.5, 0.06] });
}

/** The grand stair: a stone block under each tread down to the ground, low cheek walls either side, and a lamp each side at its foot and top. */
function stair(list: PartList) {
  const { width, foot, steps } = HILL.stair;
  for (let i = 0; i < steps; i++) {
    const w = foot - (i + 0.5) * TREAD;
    const top = treadHeight(i);
    const [x, z] = castleAt(0, w);
    const ground = Math.min(...[-0.5, 0, 0.5].map((k) => landHeight(...castleAt(k * width, w))));
    const depth = Math.max(0.3, top - ground + 0.3);
    list.at(x, 0, z, CASTLE_TURN);
    list.put("box", [0, top - depth / 2 - 0.02, 0], { s: [width, depth, TREAD + 0.04], c: "#c4baa9" });
    list.put("box", [0, top - 0.02, 0], { s: [width + 0.04, 0.06, TREAD - 0.03], c: TREADS[i % 3] });
    for (const side of [-1, 1]) {
      const [cx, cz] = castleAt(side * (width / 2 + 0.16), w);
      const high = Math.max(0.5, top + 0.62 - landHeight(cx, cz));
      list.at(cx, 0, cz, CASTLE_TURN);
      list.put("box", [0, top + 0.32 - high / 2, 0], { s: [0.3, high, TREAD + 0.05], c: "#bdb3a2" });
      list.put("box", [0, top + 0.34, 0], { s: [0.36, 0.06, TREAD + 0.07], c: CAP });
    }
  }
  for (const side of [-1, 1]) {
    lamp(list, ...castleAt(side * (width / 2 + 0.55), foot + 0.3));
    lamp(list, ...castleAt(side * (width / 2 + 0.45), HILL.edge - 0.85));
  }
}

/** The forecourt: stone paving from the castle's front to the stair head, and a low wall round its front, open where the stair arrives. */
function forecourt(list: PartList) {
  const [across, deep] = [HILL.across - 0.45, HILL.deep - 0.45];
  const inside = (u: number, w: number) => Math.abs(u / across) ** 3 + Math.abs((w - HILL.setBack) / deep) ** 3 < 1;
  list.at(CASTLE.x, HILL.top, CASTLE.z, CASTLE_TURN);
  for (let u = -4.2; u <= 4.21; u += 0.55) {
    for (let w = CASTLE_FRONT; w <= HILL.edge; w += 0.55) {
      if (inside(u, w)) list.put("box", [u, 0.03, w], { s: [0.5, 0.08, 0.5], c: PAVING[(((Math.round(u * 7 + w * 3) % 3) + 3) % 3)] });
    }
  }
  // The wall follows the plateau's rounded edge, a little inside it, round its front half.
  const edge = (t: number): [number, number] => [
    Math.sign(Math.cos(t)) * Math.abs(Math.cos(t)) ** (2 / 3) * (across + 0.05),
    HILL.setBack + Math.sign(Math.sin(t)) * Math.abs(Math.sin(t)) ** (2 / 3) * (deep + 0.05),
  ];
  const pieces = 40;
  for (let i = 0; i < pieces; i++) {
    const [[u0, w0], [u1, w1]] = [edge((i / pieces) * Math.PI), edge(((i + 1) / pieces) * Math.PI)];
    if ((w0 < CASTLE_FRONT - 0.3 && w1 < CASTLE_FRONT - 0.3) || Math.abs((u0 + u1) / 2) < HILL.stair.width / 2 + 0.25) continue;
    const [length, yaw] = [Math.hypot(u1 - u0, w1 - w0), Math.atan2(u1 - u0, w1 - w0)];
    list.put("box", [(u0 + u1) / 2, 0.24, (w0 + w1) / 2], { r: [0, yaw, 0], s: [0.3, 0.48, length + 0.04], c: WALL });
    list.put("box", [(u0 + u1) / 2, 0.51, (w0 + w1) / 2], { r: [0, yaw, 0], s: [0.38, 0.08, length + 0.1], c: CAP });
  }
  for (const side of [-1, 1]) {
    const u = side * (HILL.stair.width / 2 + 0.45);
    list.put("box", [u, 0.4, HILL.edge - 0.25], { s: [0.44, 0.8, 0.44], c: WALL });
    list.put("cyl", [u, 0.92, HILL.edge - 0.25], { s: [0.42, 0.26, 0.42], c: "#c46a4e" });
  }
}

/** Every part of the castle hill's stonework: the castle, the grand stair and the forecourt. Built once; none of it moves. */
export function castleHill(): PartList {
  const list = new PartList();
  castle(list);
  stair(list);
  forecourt(list);
  return list;
}
