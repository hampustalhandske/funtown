import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { DoubleSide, Euler, MeshToonMaterial, Quaternion } from "three";
import { FLAG_ARM } from "./acts.ts";
import { clothGeometry, poleGeometry, shapeCloth } from "./flag.ts";
import type { FlagMode } from "./line.ts";
import { STEPS } from "./parts.tsx";

const POLE = poleGeometry();
/** Every still flag's cloth: one shape, shared. */
const STILL = clothGeometry();
shapeCloth(STILL, false);
const CLOTH = new MeshToonMaterial({ vertexColors: true, gradientMap: STEPS, side: DoubleSide });
const WOODEN = new MeshToonMaterial({ vertexColors: true, gradientMap: STEPS });

/**
 * How the flag sits in the right hand's frame, whose -y runs from the shoulder out through the paw. A still flag undoes the arm's
 * turn, so its pole stands upright at the folk's side; a waved one carries on along the raised arm, so it sweeps as the arm swings.
 */
const TURN: Record<FlagMode, Quaternion> = {
  still: new Quaternion().setFromEuler(new Euler(FLAG_ARM.up, 0, FLAG_ARM.out, "XYZ")).invert(),
  wave: new Quaternion().setFromEuler(new Euler(Math.PI, 0, 0)),
};

/** The ask flag held in a folk's right hand (see `Animal`'s `held`): waved, its cloth rippling, or held up and still. */
export function HandFlag({ mode }: { mode: FlagMode }) {
  const waved = useMemo(() => (mode === "wave" ? clothGeometry() : null), [mode]);
  useEffect(() => () => waved?.dispose(), [waved]);
  useFrame(({ clock }) => {
    if (waved) shapeCloth(waved, true, clock.elapsedTime);
  });
  return (
    <group quaternion={TURN[mode]}>
      <mesh geometry={POLE} material={WOODEN} castShadow />
      <mesh geometry={waved ?? STILL} material={CLOTH} castShadow />
    </group>
  );
}
