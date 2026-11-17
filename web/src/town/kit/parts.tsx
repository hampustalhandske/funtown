import { Clay, INK, TONES } from "./clay.tsx";
import { Hat } from "./hats.tsx";
import type { HatKind } from "./palette.ts";

/** A square of grass on soil, 2 wide, with its top at y = 0. */
export function GroundTile() {
  return (
    <group>
      <Clay colour={TONES.soil} position={[0, -0.15, 0]}><boxGeometry args={[2, 0.2, 2]} /></Clay>
      <Clay colour={TONES.grass} position={[0, -0.025, 0]}><boxGeometry args={[2, 0.05, 2]} /></Clay>
    </group>
  );
}

/** A project's house: a body in the project `colour`, a pyramid roof and a door facing +z. */
export function HouseModel({ colour }: { colour: string }) {
  return (
    <group>
      <Clay colour={colour} position={[0, 0.5, 0]}><boxGeometry args={[1.2, 1, 1.2]} /></Clay>
      <Clay colour={TONES.roof} position={[0, 1.4, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[0.95, 0.8, 4]} /></Clay>
      <Clay colour={TONES.wood} position={[0, 0.3, 0.6]}><boxGeometry args={[0.35, 0.6, 0.06]} /></Clay>
    </group>
  );
}

const TOWERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const;

/** The user's castle: stone walls, a tower with a roof at each corner and a gate facing +z. */
export function Castle() {
  return (
    <group>
      <Clay colour={TONES.stone} position={[0, 0.6, 0]}><boxGeometry args={[2, 1.2, 2]} /></Clay>
      {TOWERS.map(([x, z]) => (
        <group key={`${x},${z}`} position={[x, 0, z]}>
          <Clay colour={TONES.stone} position={[0, 0.9, 0]}><cylinderGeometry args={[0.35, 0.38, 1.8, 24]} /></Clay>
          <Clay colour={TONES.roof} position={[0, 2.1, 0]}><coneGeometry args={[0.45, 0.6, 24]} /></Clay>
        </group>
      ))}
      <Clay colour={TONES.wood} position={[0, 0.4, 1]}><boxGeometry args={[0.6, 0.8, 0.08]} /></Clay>
      <Clay colour={TONES.wood} position={[0, 0.8, 1]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.3, 0.3, 0.08, 24]} /></Clay>
    </group>
  );
}

/** A character facing +z: a body in `colour`, a head with ink eyes and the given `hat`. */
export function Figure({ colour, hat }: { colour: string; hat: HatKind }) {
  return (
    <group>
      <Clay colour={colour} position={[0, 0.4, 0]}><capsuleGeometry args={[0.25, 0.3, 8, 16]} /></Clay>
      <Clay colour={TONES.skin} position={[0, 0.98, 0]}><sphereGeometry args={[0.28, 24, 16]} /></Clay>
      {[-0.1, 0.1].map((x) => (
        <mesh key={x} position={[x, 1.0, 0.26]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshBasicMaterial color={INK} />
        </mesh>
      ))}
      <group position={[0, 1.16, 0]}><Hat kind={hat} colour={colour} /></group>
    </group>
  );
}

const LEGS = [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]] as const;

/** A wooden desk with its top at y = 0.6. */
export function Desk() {
  return (
    <group>
      <Clay colour={TONES.wood} position={[0, 0.57, 0]}><boxGeometry args={[1.2, 0.06, 0.65]} /></Clay>
      {LEGS.map(([x, z]) => (
        <Clay key={`${x},${z}`} colour={TONES.wood} position={[x, 0.27, z]}><boxGeometry args={[0.08, 0.54, 0.08]} /></Clay>
      ))}
    </group>
  );
}

/** A parcel (a pull request): a paper box tied with string both ways and a knot on top. */
export function Parcel() {
  return (
    <group>
      <Clay colour={TONES.paper} position={[0, 0.2, 0]}><boxGeometry args={[0.5, 0.4, 0.4]} /></Clay>
      <Clay colour={TONES.string} position={[0, 0.2, 0]}><boxGeometry args={[0.52, 0.42, 0.04]} /></Clay>
      <Clay colour={TONES.string} position={[0, 0.2, 0]}><boxGeometry args={[0.04, 0.42, 0.42]} /></Clay>
      <Clay colour={TONES.string} position={[0, 0.43, 0]}><sphereGeometry args={[0.05, 12, 8]} /></Clay>
    </group>
  );
}
