import { TONES } from "./clay.tsx";
import { PALETTE, type HatKind } from "./palette.ts";

/** A preset look for the user's character: a coat colour, a skin tone and a hat. */
export type Avatar = { id: string; label: string; coat: string; skin: string; hat: HatKind };

/** The presets to choose from; the first, the king, is the default. */
export const AVATARS: readonly Avatar[] = [
  { id: "king", label: "King", coat: TONES.ribbon, skin: TONES.skin, hat: "crown" },
  { id: "wizard", label: "Wizard", coat: PALETTE[3], skin: "#8d5a3b", hat: "wizard" },
  { id: "cook", label: "Cook", coat: TONES.white, skin: "#c68a5e", hat: "toque" },
  { id: "explorer", label: "Explorer", coat: PALETTE[2], skin: "#e0ac82", hat: "pith" },
  { id: "farmer", label: "Farmer", coat: PALETTE[9], skin: "#f1c9a5", hat: "straw" },
  { id: "painter", label: "Painter", coat: PALETTE[5], skin: "#6b4630", hat: "beret" },
  { id: "gentleman", label: "Gentleman", coat: TONES.silver, skin: "#e0ac82", hat: "tophat" },
  { id: "builder", label: "Builder", coat: PALETTE[0], skin: "#c68a5e", hat: "hardhat" },
];

/** The preset with the given id; the king for an absent or unknown id. */
export function avatarFor(id?: string): Avatar {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}
