import { TONES } from "./clay.tsx";
import { PALETTE, type HatKind } from "./palette.ts";

/** A preset look for the user's character: a coat colour, a skin tone and, for the king only, a hat (no preset wears a hat an agent wears). */
export type Avatar = { id: string; label: string; coat: string; skin: string; hat?: HatKind };

/** The presets to choose from; the first, the king, is the default. */
export const AVATARS: readonly Avatar[] = [
  { id: "king", label: "King", coat: TONES.ribbon, skin: TONES.skin, hat: "crown" },
  { id: "cornflower", label: "Cornflower", coat: PALETTE[3], skin: "#8d5a3b" },
  { id: "snow", label: "Snow", coat: TONES.white, skin: "#c68a5e" },
  { id: "sage", label: "Sage", coat: PALETTE[2], skin: "#e0ac82" },
  { id: "pear", label: "Pear", coat: PALETTE[9], skin: "#f1c9a5" },
  { id: "blush", label: "Blush", coat: PALETTE[5], skin: "#6b4630" },
  { id: "silver", label: "Silver", coat: TONES.silver, skin: "#e0ac82" },
  { id: "terracotta", label: "Terracotta", coat: PALETTE[0], skin: "#c68a5e" },
];

/** The preset with the given id; the king for an absent or unknown id. */
export function avatarFor(id?: string): Avatar {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}
