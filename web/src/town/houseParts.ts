import { Color } from "three";
import { planOf, paintOf, type Variant } from "./houses.ts";
import { groundHeight } from "./island.ts";
import type { PartList } from "./parts.tsx";
import type { Spot } from "./layout.ts";

const TRIM = "#7a5a42";
const STONE = "#b9b0a2";
const CREAM = "#f4efe6";
const BLOOM = ["#f2b8c6", "#ffffff", "#f6e3a1", "#c9b6e4"];
const shade = (base: string, by: number) => `#${new Color(base).offsetHSL(0, 0, by).getHexString()}`;

/** What a house is drawn from: where it stands and which way it faces, its project colour (door, awning, pennant) and its feature. */
export type HouseLook = { cwd: string; colour: string; at: Spot; facing: number; variant: Variant };

type Vec = [number, number, number];
type Opts = Parameters<PartList["put"]>[2];

/** A row of `n` small flowers in a window box or a pot, centred on `x` and `w` wide, at height `y` and depth `z`. */
function flowers(list: PartList, [x, y, z]: Vec, w: number, n: number, put: (kind: "sph", pos: Vec, o: Opts) => void) {
  for (let i = 0; i < n; i++) {
    const px = x - w / 2 + ((i + 0.5) / n) * w;
    put("sph", [px, y + 0.02, z], { s: [0.18, 0.13, 0.13], c: "#7fb35c" });
    put("sph", [px, y + 0.1, z + 0.02], { s: 0.13, c: BLOOM[i % 4] });
  }
}

/**
 * A framed window with a cross and shutters, and a flowered box under it when `box`, on a wall of the house: the front, or
 * the left side (`side` -1) looking out from it. `at` is across, up and out from the wall.
 */
function window(list: PartList, side: 0 | -1, house: Vec, [x, y, z]: Vec, { box = true } = {}, w = 0.4, h = 0.42) {
  const put = (kind: Parameters<PartList["put"]>[0], [px, py, pz]: Vec, o: Opts = {}) => {
    const r = o.r ?? [0, 0, 0];
    if (side === 0) return list.put(kind, [house[0] + px, house[1] + py, house[2] + pz], o);
    return list.put(kind, [house[0] + side * pz, house[1] + py, house[2] - side * px], { ...o, r: [r[0], r[1] + (side * Math.PI) / 2, r[2]] });
  };
  put("box", [x, y, z], { s: [w + 0.12, h + 0.12, 0.06], c: CREAM });
  put("pane", [x, y, z + 0.025], { s: [w, h, 0.04] });
  put("box", [x, y, z + 0.05], { s: [0.04, h, 0.03], c: CREAM });
  put("box", [x, y, z + 0.05], { s: [w, 0.04, 0.03], c: CREAM });
  for (const s of [-1, 1]) put("box", [x + s * (w / 2 + 0.13), y, z + 0.02], { s: [0.15, h + 0.08, 0.05], c: TRIM });
  if (box) {
    put("box", [x, y - h / 2 - 0.1, z + 0.08], { s: [w + 0.16, 0.12, 0.16], c: TRIM });
    flowers(list, [x, y - h / 2 - 0.02, z + 0.1], w + 0.1, 4, put);
  }
}

/** A thick gable roof on the house's top: the gable end in wall colour, two tiled slabs with courses and a ridge roll. */
function roof(list: PartList, y: number, z: number, w: number, d: number, rh: number, tiles: string, wall: string) {
  const [over, th, rows] = [0.34, 0.17, 5];
  list.put("gable", [0, y, z], { s: [w, rh, d], c: wall });
  const a = Math.atan2(rh, w / 2);
  const len = Math.hypot(w / 2, rh) + over;
  const [dark, light] = [shade(tiles, -0.035), shade(tiles, 0.015)];
  for (const side of [-1, 1]) {
    const [dx, dy, nx, ny] = [side * Math.cos(a), -Math.sin(a), side * Math.sin(a), Math.cos(a)];
    const at = (s: number, off: number): [number, number] => [dx * s + nx * off, y + rh + dy * s + ny * off];
    const [cx, cy] = at(len / 2, th / 2);
    list.put("box", [cx, cy, z], { r: [0, 0, -side * a], s: [len, th, d + 0.55], c: tiles });
    for (let k = 0; k < rows; k++) {
      const [px, py] = at(((k + 0.5) / rows) * len, th + 0.02 + k * 0.012);
      list.put("box", [px, py, z], { r: [0, 0, -side * a + side * 0.04], s: [(len / rows) * 1.06, 0.07, d + 0.6], c: k % 2 ? dark : light });
    }
  }
  list.put("cyl", [0, y + rh + th * 0.9, z], { r: [Math.PI / 2, 0, 0], s: [0.2, d + 0.66, 0.2], c: dark });
}

/** The feature that sets this house apart, in the house's frame. */
function feature(list: PartList, variant: Variant, wall: string, tiles: string, dx: number) {
  const p = planOf(variant);
  const fz = p.d / 2;
  switch (variant) {
    case "porch":
      for (const s of [-1, 1]) list.put("cyl", [dx + s * 0.5, 0.25 + 0.55, fz + 0.8], { s: [0.1, 1.1, 0.1], c: TRIM });
      list.put("gable", [dx, 1.3, fz + 0.45], { s: [1.4, 0.4, 0.95], c: tiles });
      return;
    case "dormer":
      list.put("box", [-0.25, p.top + p.rh * 0.32, p.rd * 0.22], { s: [0.7, 0.55, 0.7], c: wall });
      list.put("gable", [-0.25, p.top + p.rh * 0.32 + 0.27, p.rd * 0.26], { s: [0.95, 0.4, 0.8], c: tiles });
      list.put("pane", [-0.25, p.top + p.rh * 0.32, p.rd * 0.22 + 0.36], { s: [0.32, 0.3, 0.04] });
      return;
    case "lean-to":
      list.put("box", [p.w / 2 + 0.55, 0.25 + 0.45, -0.1], { s: [1.1, 0.9, 1.5], c: wall });
      list.put("box", [p.w / 2 + 0.6, 0.25 + 0.93, -0.1], { r: [0, 0, -0.2], s: [1.45, 0.1, 1.75], c: tiles });
      return;
    case "storey":
    case "balcony": {
      const [uw, ud] = [p.rw, p.d + p.jetty];
      const front = p.rz + ud / 2;
      const y = 0.25 + p.h1;
      list.put("box", [0, y + 0.05, p.rz], { s: [uw + 0.12, 0.12, ud + 0.1], c: TRIM });
      list.put("box", [0, y + 0.1 + p.h2 / 2, p.rz], { s: [uw, p.h2, ud], c: wall });
      if (variant === "storey") {
        // Half-timbering: two rails, corner posts, an X brace.
        for (const ry of [0.14, 0.07 + p.h2]) list.put("box", [0, y + ry, front + 0.01], { s: [uw + 0.04, 0.09, 0.05], c: TRIM });
        for (const x of [-uw / 2 + 0.05, uw / 2 - 0.05]) list.put("box", [x, y + 0.1 + p.h2 / 2, front + 0.01], { s: [0.08, p.h2, 0.05], c: TRIM });
        for (const s of [-1, 1]) list.put("box", [0, y + 0.1 + p.h2 / 2, front + 0.02], { r: [0, 0, s * 0.62], s: [0.07, p.h2 * 1.05, 0.04], c: TRIM });
      }
      return;
    }
  }
}

/**
 * The parts of one toy-harbour house: a stone footing, timber corners, plastered walls, a framed door in the project colour with
 * a step and a lamp, shuttered windows with flower boxes, a tiled gable roof, a chimney, a pennant in the project colour, and the
 * one feature its folder was given (a porch, dormer, lean-to, second storey or balcony). Each part is one instance of a shared kind.
 */
export function houseParts(list: PartList, { cwd, colour, at, facing, variant }: HouseLook): void {
  const { wall, roof: tiles } = paintOf(cwd);
  const p = planOf(variant);
  const { w, d, h1, h2, rw, rd, rz, top, rh } = p;
  const fz = d / 2;
  list.at(at.x, groundHeight(at.x, at.z), at.z, facing);
  const put = (kind: Parameters<PartList["put"]>[0], pos: Vec, o?: Opts) => list.put(kind, pos, o);

  // The footing reaches down into the slope; a plinth and the plastered walls with timber corners stand on it.
  put("box", [0, -0.62, 0], { s: [w + 0.55, 1.5, d + 0.55], c: "#a9a092" });
  put("box", [0, 0.12, 0], { s: [w + 0.36, 0.26, d + 0.36], c: STONE });
  put("box", [0, 0.25 + h1 / 2, 0], { s: [w, h1, d], c: wall });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put("box", [sx * (w / 2), 0.25 + h1 / 2, sz * (d / 2)], { s: [0.14, h1 + 0.02, 0.14], c: TRIM });

  // The door: a round-topped frame, a panel in the project colour, a knob, two steps and a lamp.
  const dx = -w * 0.24;
  put("box", [dx, 0.25 + 0.42, fz + 0.02], { s: [0.62, 0.84, 0.08], c: TRIM });
  put("cyl", [dx, 0.25 + 0.84, fz + 0.02], { r: [Math.PI / 2, 0, 0], s: [0.62, 0.08, 0.62], c: TRIM });
  put("box", [dx, 0.25 + 0.38, fz + 0.06], { s: [0.46, 0.76, 0.08], c: colour });
  put("cyl", [dx, 0.25 + 0.76, fz + 0.06], { r: [Math.PI / 2, 0, 0], s: [0.46, 0.08, 0.46], c: colour });
  put("sph", [dx + 0.14, 0.25 + 0.4, fz + 0.12], { s: 0.07, c: "#e8b84a" });
  put("box", [dx, 0.2, fz + 0.32], { s: [0.8, 0.1, 0.36], c: "#c9c0b2" });
  put("box", [dx, 0.08, fz + 0.5], { s: [0.86, 0.1, 0.3], c: "#bdb3a4" });
  put("box", [dx + 0.44, 0.25 + 0.9, fz + 0.06], { s: [0.06, 0.06, 0.14], c: "#4f4038" });
  put("pane", [dx + 0.44, 0.25 + 0.8, fz + 0.14], { s: [0.13, 0.17, 0.13] });
  for (const px of [dx - 0.5, dx + 0.62]) {
    put("cyl", [px, 0.36, fz + 0.12], { s: [0.2, 0.2, 0.2], c: "#c46a4e" });
    flowers(list, [px, 0.44, fz + 0.12], 0.16, 2, put);
  }

  // A bay window under an awning in the project colour, and a window on the left side.
  const bx = w * 0.22;
  put("box", [bx, 0.25 + 0.52, fz + 0.15], { s: [0.95, 0.66, 0.34], c: wall });
  put("box", [bx, 0.25 + 0.17, fz + 0.18], { s: [1.05, 0.08, 0.44], c: TRIM });
  put("pane", [bx, 0.25 + 0.55, fz + 0.33], { s: [0.78, 0.44, 0.04] });
  for (const mx of [-0.2, 0.2]) put("box", [bx + mx, 0.25 + 0.55, fz + 0.355], { s: [0.04, 0.44, 0.03], c: CREAM });
  for (let k = 0; k < 5; k++) put("box", [bx - 0.44 + k * 0.22, 0.25 + 0.96, fz + 0.36], { r: [0.5, 0, 0], s: [0.22, 0.04, 0.55], c: k % 2 ? CREAM : colour });
  window(list, -1, [-w / 2, 0, 0], [0, 0.25 + 0.6, 0.01], { box: false });

  // The feature, then the upper floor's windows (the walls came with it), the roof, the chimney and the pennant.
  feature(list, variant, wall, tiles, dx);
  if (p.upper) {
    const [y, front] = [0.25 + h1, rz + (d + p.jetty) / 2];
    window(list, 0, [0, 0, 0], [-rw * 0.3, y + 0.1 + h2 * 0.55, front + 0.01]);
    if (variant === "balcony") {
      const ex = rw * 0.3;
      put("box", [ex, y + 0.1 + 0.38, front + 0.01], { s: [0.5, 0.74, 0.06], c: CREAM });
      put("pane", [ex, y + 0.1 + 0.4, front + 0.04], { s: [0.38, 0.62, 0.04] });
      put("box", [ex, y + 0.1, front + 0.24], { s: [0.95, 0.08, 0.46], c: "#a5805e" });
      put("box", [ex, y + 0.42, front + 0.45], { s: [0.95, 0.06, 0.06], c: TRIM });
      for (let k = 0; k < 6; k++) put("box", [ex - 0.42 + k * 0.168, y + 0.26, front + 0.45], { s: [0.05, 0.3, 0.05], c: TRIM });
      for (const sx of [-1, 1]) put("box", [ex + sx * 0.4, y - 0.1, front + 0.14], { r: [-0.7, 0, 0], s: [0.06, 0.36, 0.06], c: TRIM });
    } else {
      window(list, 0, [0, 0, 0], [rw * 0.3, y + 0.1 + h2 * 0.55, front + 0.01]);
    }
  }
  roof(list, top, rz, rw + 0.1, rd + 0.1, rh, tiles, wall);
  const chimney: Vec = [rw * 0.27, top + rh * 0.45, rz - rd * 0.2];
  put("box", [chimney[0], chimney[1] + 0.3, chimney[2]], { s: [0.44, 1.5, 0.44], c: "#b5a796" });
  put("box", [chimney[0], chimney[1] + 1.08, chimney[2]], { s: [0.54, 0.12, 0.54], c: "#8f8377" });
  for (const ox of [-0.1, 0.11]) put("cyl", [chimney[0] + ox, chimney[1] + 1.22, chimney[2]], { s: [0.13, 0.2, 0.13], c: "#c46a4e" });

  // The pennant: a pole on the roof's front left corner and a triangle in the project colour, still.
  const foot: Vec = [-rw / 2 + 0.05, top + rh * 0.15, rz + rd / 2 + 0.2];
  put("cyl", [foot[0], foot[1] + 0.5, foot[2]], { s: [0.06, 1.0, 0.06], c: TRIM });
  put("gable", [foot[0], foot[1] + 0.84, foot[2]], { r: [0, 0, -Math.PI / 2], s: [0.32, 0.55, 0.03], c: colour });
}
