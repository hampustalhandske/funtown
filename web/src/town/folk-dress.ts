import { Matrix4, type Vector3 } from "three";
import { TONES } from "./kit/clay.tsx";
import type { FolkHat } from "./folk.ts";
import type { Rig, RigBuilder, Vec } from "./folk-parts.ts";

/** The folk's hats and the things they hold or work at, as parts. The hats are today's role hats, plus the lead's captain's cap. */

const HALF = Math.PI / 2;
const spread = (count: number, from: number, span: number) => Array.from({ length: count }, (_, i) => from + (span * i) / (count - 1));

/**
 * Puts `hat` on the head joint with its base at `at` (in the folk's frame); `colour` tints the plain cap. The shapes follow
 * the classroom's hats (`kit/hats.tsx`), so a role reads the same in both.
 */
export function hatParts(b: RigBuilder, hat: FolkHat, colour: string, at: Vector3) {
  b.at("head", at);
  const brim = (r: number, c: string, y = 0) => b.put("cyl", [0, y, 0], { s: [r, 0.03, r], c });
  const dome = (r: number, c: string, sy = 1) => b.put("dome", [0, 0, 0], { s: [r, r * sy, r], c });
  switch (hat) {
    case "captain":
      // A crown wider at the top than its band, so it reads flat and white from far off; a navy band with a gold cord, a black peak and a gold badge.
      b.put("cyl", [0, 0.05, 0], { s: [0.235, 0.1, 0.235], c: "#2c3550" });
      b.put("flare", [0, 0.16, 0], { s: [0.33, 0.12, 0.33], c: "#f7f4ee" });
      b.put("ring", [0, 0.09, 0], { s: [0.237, 0.07, 0.237], c: TONES.gold });
      b.put("cyl", [0, 0.015, 0.13], { r: [0.18, 0, 0], s: [0.24, 0.03, 0.17], c: "#1f1d24" });
      b.put("sph", [0, 0.13, 0.27], { s: [0.05, 0.05, 0.025], c: TONES.gold });
      return;
    case "hardhat":
      dome(0.27, TONES.gold);
      brim(0.34, TONES.gold);
      return;
    case "toque":
      b.put("cyl", [0, 0.12, 0], { s: [0.21, 0.24, 0.21], c: TONES.white });
      b.put("sph", [0, 0.3, 0], { s: [0.28, 0.2, 0.28], c: TONES.white });
      return;
    case "pith":
      dome(0.27, TONES.paper, 0.9);
      brim(0.42, TONES.paper);
      return;
    case "wizard":
      b.put("cone", [0, 0.3, 0], { r: [0.15, 0, 0], s: [0.26, 0.65, 0.26], c: "#6b5b95" });
      b.put("cyl", [0, 0.04, 0], { s: [0.265, 0.08, 0.265], c: TONES.gold });
      brim(0.4, "#6b5b95");
      return;
    case "straw":
      brim(0.5, TONES.paper);
      b.put("cyl", [0, 0.09, 0], { s: [0.22, 0.18, 0.22], c: TONES.paper });
      b.put("cyl", [0, 0.04, 0], { s: [0.245, 0.06, 0.245], c: TONES.ribbon });
      return;
    case "beret":
      b.put("sph", [0.015, 0.06, 0], { r: [0, 0, -0.25], s: [0.32, 0.11, 0.32], c: TONES.ribbon });
      b.put("cyl", [0.05, 0.19, 0], { r: [0, 0, -0.25], s: [0.018, 0.06, 0.018], c: TONES.ribbon });
      return;
    case "tophat":
      brim(0.36, TONES.charcoal);
      b.put("cyl", [0, 0.22, 0], { s: [0.225, 0.44, 0.225], c: TONES.charcoal });
      b.put("cyl", [0, 0.06, 0], { s: [0.228, 0.08, 0.228], c: TONES.ribbon });
      return;
    case "crown":
      b.put("cyl", [0, 0.06, 0], { s: [0.245, 0.12, 0.245], c: TONES.gold });
      for (const a of spread(5, 0, (Math.PI * 8) / 5)) b.put("cone", [Math.sin(a) * 0.24, 0.2, Math.cos(a) * 0.24], { s: [0.05, 0.16, 0.05], c: TONES.gold });
      return;
    case "tiara":
      b.put("ring", [0, 0.02, 0], { s: [0.25, 0.1, 0.25], c: TONES.silver });
      for (const a of spread(3, -0.5, 1)) b.put("cone", [Math.sin(a) * 0.25, 0.09, Math.cos(a) * 0.25], { s: [0.05, 0.14, 0.05], c: TONES.silver });
      return;
    case "cap":
      dome(0.27, colour, 0.75);
      b.put("cyl", [0, 0.01, 0.22], { s: [0.2, 0.03, 0.16], c: colour });
      return;
  }
}

/** Something a folk holds or works at. */
export type Prop = "hammer" | "crate" | "plane" | "bench" | "clipboard" | "glass" | "stick" | "letter" | "slip" | "note" | "bucket" | "parcel" | "parcel-note";

/** A parcel carried up in both arms, as the pile's parcels look (see `parcels.ts`) but at the folk's own scale, 1.26 times smaller. */
const CARRIED = { w: 0.44, h: 0.32, d: 0.36, y: 0.116, z: 0.32 } as const;

/** The Queen's teal, which seals her note. */
export const QUEEN_TEAL = "#3f7a76";

/** Starts parts held in the `side` hand of `rig`, at `pos` turned by `r` in the hand's frame. */
const hold = (b: RigBuilder, rig: Pick<Rig, "hands">, side: "L" | "R", pos: Vec, r: Vec) =>
  b.at(`arm${side}`, pos, r, new Matrix4().makeTranslation(rig.hands[side]));

/** Puts `prop` in a hand of `rig`, or on the ground before it; `colour` seals a slip. A note lies on the held slip, so it goes with one. */
export function propParts(b: RigBuilder, prop: Prop, rig: Pick<Rig, "hands">, colour: string) {
  switch (prop) {
    case "hammer":
      hold(b, rig, "R", [0, -0.02, 0.05], [HALF, 0, 0]);
      b.put("box", [0, 0.1, 0], { s: [0.05, 0.34, 0.05], c: "#8a6a50" });
      b.put("box", [0, 0.27, 0], { s: [0.18, 0.09, 0.09], c: "#6f6a66" });
      return;
    case "crate":
      b.at("root", [0.12, 0, 0.46]);
      b.put("box", [0, 0.14, 0], { s: [0.34, 0.28, 0.3], c: "#c9a27a" });
      b.put("box", [0, 0.29, 0], { s: [0.42, 0.04, 0.2], c: "#d9b98a" });
      return;
    case "plane":
      hold(b, rig, "R", [0, -0.02, 0.04], [HALF, 0, 0]);
      b.put("box", [0, 0.04, 0], { s: [0.12, 0.2, 0.08], c: "#c9a27a" });
      b.put("sph", [0, 0.04, 0.06], { s: 0.035, c: "#6b5444" });
      return;
    case "bench":
      b.at("root", [0, 0, 0.5]);
      b.put("box", [0, 0.3, 0], { s: [0.8, 0.07, 0.34], c: "#a5805e" });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.put("box", [sx * 0.33, 0.14, sz * 0.12], { s: [0.06, 0.28, 0.06], c: "#6b5444" });
      b.put("box", [0.05, 0.36, 0], { s: [0.6, 0.05, 0.14], c: "#d9b98a" });
      return;
    case "clipboard":
      hold(b, rig, "L", [0.06, 0, 0.1], [-0.5, 0, 0]);
      b.put("box", [0, 0, 0], { s: [0.26, 0.34, 0.03], c: "#a5805e" });
      b.put("box", [0, -0.02, 0.02], { s: [0.21, 0.26, 0.012], c: "#f7f3ea" });
      return;
    case "glass":
      hold(b, rig, "R", [0, 0.02, 0.05], [HALF + 0.6, 0, 0]);
      b.put("cyl", [0, -0.1, 0], { s: [0.02, 0.16, 0.02], c: "#6b5444" });
      b.put("ring", [0, 0.04, 0], { r: [HALF, 0, 0], s: [0.07, 0.08, 0.07], c: "#c9a24a" });
      return;
    case "stick":
      hold(b, rig, "R", [0, 0.15, 0.04], [0.2, 0, 0]);
      b.put("cyl", [0, 0, 0], { s: [0.03, 0.9, 0.03], c: "#8a6a50" });
      return;
    case "letter":
      hold(b, rig, "L", [0.1, 0.02, 0.1], [-0.6, 0, 0]);
      b.put("box", [0, 0, 0], { s: [0.32, 0.22, 0.025], c: "#fbf6ea" });
      b.put("cone", [0, 0.06, 0.015], { r: [0, Math.PI / 6, Math.PI], s: [0.16, 0.1, 0.024], c: "#ece4d2" });
      return;
    case "bucket":
      // A pail in the right hand, tapering to its foot, water on top and a hoop for the handle.
      hold(b, rig, "R", [0, -0.05, 0.08], [0, 0, 0]);
      b.put("flare", [0, 0, 0], { s: [0.15, 0.22, 0.15], c: "#8f9aa6" });
      b.put("cyl", [0, 0.1, 0], { s: [0.13, 0.02, 0.13], c: "#7cc4e0" });
      b.put("ring", [0, 0.12, 0], { r: [0, 0, HALF], s: [0.15, 0.15, 0.15], c: "#5f6872" });
      return;
    case "slip":
      hold(b, rig, "L", [0, 0.02, 0.1], [1.4, 0, 0]);
      b.put("box", [0, 0, 0], { s: [0.36, 0.46, 0.025], c: "#fbf6ea" });
      b.put("cyl", [0, -0.12, 0.018], { r: [HALF, 0, 0], s: [0.07, 0.02, 0.07], c: colour });
      return;
    case "parcel": {
      // The box before the chest, held at its sides by both paws, its ties in the project's colour.
      const { w, h, d } = CARRIED;
      b.at("root", [0, rig.hands.L.y + CARRIED.y, CARRIED.z]);
      b.put("box", [0, 0, 0], { s: [w, h, d], c: "#c9a27a" });
      b.put("box", [0, 0, 0], { s: [w + 0.03, h + 0.03, 0.05], c: colour });
      b.put("box", [0, 0, 0], { s: [0.05, h + 0.03, d + 0.03], c: colour });
      b.put("sph", [0, h / 2 + 0.01, 0], { s: 0.09, c: colour });
      return;
    }
    case "parcel-note":
      // The Queen's note on the carried parcel's lid, sealed in her teal.
      b.at("root", [0, rig.hands.L.y + CARRIED.y + CARRIED.h / 2 + 0.02, CARRIED.z + 0.02], [0, 0.4, 0]);
      b.put("box", [0, 0, 0], { s: [0.22, 0.02, 0.17], c: "#fffdf6" });
      b.put("cyl", [0.04, 0.012, 0.03], { s: [0.09, 0.02, 0.09], c: QUEEN_TEAL });
      return;
    case "note":
      // The Queen's ready note on the slip's face, sealed in her teal.
      hold(b, rig, "L", [0.03, 0.02, 0.14], [1.4, 0, 0.15]);
      b.put("box", [0, 0.06, 0], { s: [0.26, 0.22, 0.02], c: "#fffdf6" });
      b.put("cyl", [0, 0.03, 0.014], { r: [HALF, 0, 0], s: [0.055, 0.02, 0.055], c: QUEEN_TEAL });
      return;
  }
}
