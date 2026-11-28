import { QUEEN_TEAL } from "./folk-dress.ts";
import { groundHeight } from "./island.ts";
import type { Placed } from "./layout.ts";
import type { PartList } from "./parts.tsx";

/**
 * A parcel as the island draws it: a kraft-paper box tied both ways in its project's colour with a knot on top, and, while the
 * Queen's review of it is ready, her cream note sealed in teal lying on the lid. Drawn as parts on the pile and on a house's
 * doorstep; a lead carrying one has it in its arms (`propParts`, with the same look).
 */

/** The box's size: across, high and deep. The pile's `rise` is its height. */
export const PARCEL = { w: 0.56, h: 0.4, d: 0.46 } as const;
/** The paper, and the cream of the Queen's note. */
const KRAFT = "#c9a27a";
const NOTE = "#fffdf6";
/** How far a tie stands proud of the box's face, and how wide it is. */
const TIE = { out: 0.03, width: 0.1 } as const;

/**
 * The parts of one parcel in a frame of its own whose origin is the middle of the box's foot: the paper, the two ties, the
 * knot and, with `note`, the Queen's note on the lid with her teal seal. Added to `list` in whatever frame it is at.
 */
export function boxParts(list: PartList, colour: string, note: boolean) {
  const { w, h, d } = PARCEL;
  list.put("box", [0, h / 2, 0], { s: [w, h, d], c: KRAFT });
  list.put("box", [0, h / 2, 0], { s: [w + TIE.out * 2, h + TIE.out * 2, TIE.width], c: colour });
  list.put("box", [0, h / 2, 0], { s: [TIE.width, h + TIE.out * 2, d + TIE.out * 2], c: colour });
  list.put("sph", [0, h + 0.02, 0], { s: 0.15, c: colour });
  if (!note) return;
  list.put("box", [0.06, h + 0.02, 0.06], { r: [0, 0.4, 0], s: [0.28, 0.025, 0.22], c: NOTE });
  list.put("cyl", [0.1, h + 0.04, 0.09], { s: [0.12, 0.025, 0.12], c: QUEEN_TEAL });
}

/** How far off square a parcel lies, from its number: a few degrees either way, so a pile looks piled by hand. */
export const tiltOf = (number: number) => ((number % 5) - 2) * 0.12;

/** Adds `p` to `list`: on the ground at its spot, lifted by its place on the pile, turned `tiltOf` off the way it faces. */
export function parcelParts(list: PartList, p: Extract<Placed, { kind: "parcel" }>) {
  list.at(p.at.x, groundHeight(p.at.x, p.at.z) + p.lift, p.at.z, p.facing + tiltOf(p.number));
  boxParts(list, p.colour, p.note);
}
