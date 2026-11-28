import { CASTLE_TURN, HILL, castleAt } from "./hill.ts";
import { DAIS, QUEEN_SEAT, TABLE, YOUR_THRONE } from "./court.ts";
import { PartList } from "./parts.tsx";

const STONE = "#d6cebf";
const PLINTH = "#c2b9a8";
const PURPLE = "#7b5aa6";
const TEAL = "#3f7a76";
const GOLD = "#e8b84a";

/** Your throne: tall and square, with a purple back and cushion in a wooden frame and gold finials. Its parts, in the frame of a throne at its seat (origin on the dais, +z toward the village). */
function yours(list: PartList) {
  const wood = "#8a5a3a";
  list.put("box", [0, 0.07, 0], { s: [1.3, 0.14, 1.2], c: "#bdb3a2" });
  list.put("box", [0, 0.34, 0], { s: [1.0, 0.42, 0.9], c: wood });
  list.put("box", [0, 0.6, 0.03], { s: [0.86, 0.14, 0.78], c: PURPLE });
  for (const side of [-1, 1]) {
    list.put("box", [side * 0.5, 0.78, 0.02], { s: [0.13, 0.26, 0.82], c: wood });
    list.put("sph", [side * 0.5, 0.93, 0.4], { s: 0.15, c: GOLD });
  }
  list.put("box", [0, 1.32, -0.38], { s: [1.0, 1.8, 0.16], c: wood });
  list.put("box", [0, 1.28, -0.29], { s: [0.74, 1.42, 0.04], c: PURPLE });
  for (const side of [-1, 1]) list.put("sph", [side * 0.47, 2.27, -0.38], { s: 0.18, c: GOLD });
  list.put("cone", [0, 2.2, -0.38], { s: [0.3, 0.34, 0.12], c: GOLD });
}

/** The Queen's throne: lower than yours and round-backed, teal, in a lighter wood. */
function hers(list: PartList) {
  const [wood, k] = ["#b08660", 0.86];
  list.put("box", [0, 0.07, 0], { s: [1.3 * k, 0.14, 1.2 * k], c: "#bdb3a2" });
  list.put("box", [0, 0.34, 0], { s: [1.0 * k, 0.42, 0.9 * k], c: wood });
  list.put("box", [0, 0.6, 0.03], { s: [0.86 * k, 0.14, 0.78 * k], c: TEAL });
  for (const side of [-1, 1]) {
    list.put("box", [side * 0.5 * k, 0.78, 0.02], { s: [0.13, 0.26, 0.82 * k], c: wood });
    list.put("sph", [side * 0.5 * k, 0.93, 0.4 * k], { s: 0.15, c: GOLD });
  }
  list.put("cyl", [0, 1.18, -0.33], { r: [Math.PI / 2, 0, 0], s: [1.06, 0.14, 1.06], c: wood });
  list.put("cyl", [0, 1.18, -0.255], { r: [Math.PI / 2, 0, 0], s: [0.84, 0.03, 0.84], c: TEAL });
  list.put("box", [0, 0.72, -0.33], { s: [0.5, 0.3, 0.14], c: wood });
  list.put("sph", [0, 1.76, -0.33], { s: 0.15, c: GOLD });
}

/**
 * The forecourt's furniture: the low dais under both thrones, the thrones, and the stone table in front of them, a thick top
 * on two plinths with a purple runner along it. Built once; none of it moves.
 */
export function courtFurniture(): PartList {
  const list = new PartList();
  const [dx, dz] = castleAt(DAIS.u, DAIS.w);
  list.at(dx, HILL.top, dz, CASTLE_TURN);
  list.put("box", [0, DAIS.height / 2, 0], { s: [DAIS.across, DAIS.height, DAIS.depth], c: STONE });

  for (const [seat, build] of [[YOUR_THRONE, yours], [QUEEN_SEAT, hers]] as const) {
    const [x, z] = castleAt(seat.u, seat.w);
    list.at(x, HILL.top + DAIS.height, z, CASTLE_TURN + seat.yaw);
    build(list);
  }

  const [tx, tz] = castleAt(TABLE.u, TABLE.w);
  list.at(tx, HILL.top, tz, CASTLE_TURN);
  list.put("box", [0, TABLE.top - 0.08, 0], { s: [TABLE.half * 2, 0.16, TABLE.depth], c: STONE });
  for (const side of [-1, 1]) list.put("box", [side * (TABLE.half - 0.45), (TABLE.top - 0.16) / 2, 0], { s: [0.5, TABLE.top - 0.16, 0.8], c: PLINTH });
  list.put("box", [0, TABLE.top + 0.005, 0], { s: [TABLE.half * 2 - 0.3, 0.02, 0.42], c: PURPLE });
  return list;
}
