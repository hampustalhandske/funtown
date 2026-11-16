import { Clay, TONES } from "./clay.tsx";
import type { HatKind } from "./palette.ts";

const HALF = Math.PI / 2;
const ring = (count: number, from: number, span: number) =>
  Array.from({ length: count }, (_, i) => from + (span * i) / (count - 1));

/** A brim: a flat disc of radius `r`. */
const Brim = ({ r, colour, y = 0 }: { r: number; colour: string; y?: number }) => (
  <Clay colour={colour} position={[0, y, 0]}>
    <cylinderGeometry args={[r, r, 0.03, 32]} />
  </Clay>
);

/** A dome: the top half of a sphere of radius `r`. */
const Dome = ({ r, colour, scaleY = 1 }: { r: number; colour: string; scaleY?: number }) => (
  <Clay colour={colour} scale={[1, scaleY, 1]}>
    <sphereGeometry args={[r, 32, 16, 0, Math.PI * 2, 0, HALF]} />
  </Clay>
);

/** Points standing at height `y` around a band of radius `r` at the given angles, each a small cone of height `h`. */
const Points = ({ r, y, h, angles, colour }: { r: number; y: number; h: number; angles: number[]; colour: string }) =>
  angles.map((a) => (
    <Clay key={a} colour={colour} position={[Math.sin(a) * r, y + h / 2, Math.cos(a) * r]}>
      <coneGeometry args={[0.05, h, 8]} />
    </Clay>
  ));

/** A hat whose base sits at y = 0 on top of a head; `colour` tints the cap. */
export function Hat({ kind, colour }: { kind: HatKind; colour: string }) {
  switch (kind) {
    case "hardhat":
      return (<group><Dome r={0.27} colour={TONES.gold} /><Brim r={0.34} colour={TONES.gold} /></group>);
    case "toque":
      return (
        <group>
          <Clay colour={TONES.white} position={[0, 0.12, 0]}><cylinderGeometry args={[0.22, 0.2, 0.24, 24]} /></Clay>
          <Clay colour={TONES.white} position={[0, 0.3, 0]} scale={[1, 0.7, 1]}><sphereGeometry args={[0.28, 24, 16]} /></Clay>
        </group>
      );
    case "pith":
      return (<group><Dome r={0.27} colour={TONES.paper} scaleY={0.9} /><Brim r={0.42} colour={TONES.paper} /></group>);
    case "wizard":
      return (
        <group>
          <Clay colour="#6b5b95" position={[0, 0.3, 0]} rotation={[0.15, 0, 0]}><coneGeometry args={[0.26, 0.65, 24]} /></Clay>
          <Clay colour={TONES.gold} position={[0, 0.04, 0]}><cylinderGeometry args={[0.26, 0.27, 0.08, 24]} /></Clay>
          <Brim r={0.4} colour="#6b5b95" />
        </group>
      );
    case "straw":
      return (
        <group>
          <Brim r={0.5} colour={TONES.paper} />
          <Clay colour={TONES.paper} position={[0, 0.09, 0]}><cylinderGeometry args={[0.2, 0.24, 0.18, 24]} /></Clay>
          <Clay colour={TONES.ribbon} position={[0, 0.04, 0]}><cylinderGeometry args={[0.245, 0.245, 0.06, 24]} /></Clay>
        </group>
      );
    case "beret":
      return (
        <group rotation={[0, 0, -0.25]}>
          <Clay colour={TONES.ribbon} position={[0, 0.06, 0]} scale={[1, 0.35, 1]}><sphereGeometry args={[0.32, 24, 16]} /></Clay>
          <Clay colour={TONES.ribbon} position={[0, 0.19, 0]}><cylinderGeometry args={[0.015, 0.02, 0.06, 8]} /></Clay>
        </group>
      );
    case "tophat":
      return (
        <group>
          <Brim r={0.36} colour={TONES.charcoal} />
          <Clay colour={TONES.charcoal} position={[0, 0.22, 0]}><cylinderGeometry args={[0.23, 0.22, 0.44, 24]} /></Clay>
          <Clay colour={TONES.ribbon} position={[0, 0.06, 0]}><cylinderGeometry args={[0.225, 0.225, 0.08, 24]} /></Clay>
        </group>
      );
    case "crown":
      return (
        <group>
          <Clay colour={TONES.gold} position={[0, 0.06, 0]}><cylinderGeometry args={[0.25, 0.24, 0.12, 24, 1, true]} /></Clay>
          <Points r={0.24} y={0.12} h={0.16} angles={ring(5, 0, (Math.PI * 8) / 5)} colour={TONES.gold} />
          {ring(3, -0.7, 1.4).map((a) => (
            <Clay key={a} colour={TONES.ribbon} position={[Math.sin(a) * 0.255, 0.06, Math.cos(a) * 0.255]}>
              <sphereGeometry args={[0.035, 12, 8]} />
            </Clay>
          ))}
        </group>
      );
    case "tiara":
      return (
        <group>
          <Clay colour={TONES.silver} position={[0, 0.02, 0]} rotation={[HALF, 0, 0]}><torusGeometry args={[0.25, 0.02, 8, 32]} /></Clay>
          <Points r={0.25} y={0.02} h={0.14} angles={ring(3, -0.5, 1)} colour={TONES.silver} />
        </group>
      );
    case "cap":
      return (
        <group>
          <Dome r={0.27} colour={colour} scaleY={0.75} />
          <Clay colour={colour} position={[0, 0.01, 0.22]} scale={[1, 1, 0.8]}><cylinderGeometry args={[0.2, 0.2, 0.03, 24]} /></Clay>
        </group>
      );
  }
}
