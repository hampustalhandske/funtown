import type { ReactNode } from "react";
import { DataTexture, NearestFilter, RedFormat } from "three";
import type { ThreeElements } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";

/** The outline colour every part shares. */
export const INK = "#2b2230";

/** Fixed clay colours the parts use for materials that don't carry a project colour. */
export const TONES = {
  grass: "#9cc48a",
  soil: "#b08b62",
  wood: "#a0714f",
  stone: "#c9c2b6",
  roof: "#c4664e",
  skin: "#f1c9a5",
  paper: "#e8d3a9",
  string: "#e6e1d6",
  gold: "#e8b84a",
  silver: "#cfd6de",
  white: "#f7f4ee",
  charcoal: "#4a4652",
  ribbon: "#c94f4f",
};

// Three light steps: the toon material bands its shading into these, which gives the matte clay look.
const steps = new DataTexture(new Uint8Array([110, 190, 255]), 3, 1, RedFormat);
steps.minFilter = steps.magFilter = NearestFilter;
steps.needsUpdate = true;

type ClayProps = ThreeElements["mesh"] & { colour: string; children: ReactNode };

/** One clay mesh with an ink outline 2.5 px wide at any distance; `children` is its geometry. */
export function Clay({ colour, children, ...mesh }: ClayProps) {
  return (
    <mesh castShadow receiveShadow {...mesh}>
      {children}
      <meshToonMaterial color={colour} gradientMap={steps} />
      <Outlines thickness={2.5} color={INK} />
    </mesh>
  );
}
