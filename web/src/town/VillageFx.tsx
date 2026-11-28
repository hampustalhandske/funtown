import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CatmullRomCurve3, Color, DynamicDrawUsage, Euler, InstancedMesh, Matrix4, MeshBasicMaterial, Object3D, Quaternion, SphereGeometry, TubeGeometry, Vector3 } from "three";
import { groundHeight } from "./island.ts";
import { CLAY, GEOMETRIES } from "./parts.tsx";
import type { Boat } from "./village.ts";

/** The three boxes a boat is made of in its own frame: where each is, how big, and its colour (null: the boat's hull colour). */
const BOAT_PARTS: [Vector3, Vector3, string | null][] = [
  [new Vector3(0, 0.1, 0), new Vector3(0.8, 0.3, 1.8), null],
  [new Vector3(0, 0.26, 0), new Vector3(0.62, 0.06, 1.5), "#b08a64"],
  [new Vector3(0, 0.3, 0), new Vector3(0.7, 0.05, 0.2), "#a5805e"],
];

const scratch = { frame: new Matrix4(), part: new Matrix4(), turn: new Quaternion(), tilt: new Euler() };

/** The rowing boats: each a hull, a floor and a seat, bobbing and rocking on the water at its own pace. One draw call for all. */
export function Boats({ boats }: { boats: Boat[] }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const colour = new Color();
    boats.forEach((boat, b) => BOAT_PARTS.forEach(([, , c], k) => ref.current!.setColorAt(b * 3 + k, colour.set(c ?? boat.colour))));
    ref.current!.instanceColor!.needsUpdate = true;
  }, [boats]);
  useFrame(({ clock }) => {
    const mesh = ref.current!;
    const { frame, part, turn, tilt } = scratch;
    boats.forEach((boat, b) => {
      const t = clock.elapsedTime;
      turn.setFromEuler(tilt.set(0, boat.yaw, Math.sin(t * 1.1 + b * 2) * 0.05, "YXZ"));
      frame.compose(new Vector3(boat.x, 0.02 + Math.sin(t * 1.3 + b) * 0.04, boat.z), turn, new Vector3(1, 1, 1));
      BOAT_PARTS.forEach(([at, size], k) => mesh.setMatrixAt(b * 3 + k, part.compose(at, new Quaternion(), size).premultiply(frame)));
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[GEOMETRIES.box, CLAY, boats.length * BOAT_PARTS.length]} castShadow receiveShadow frustumCulled={false} />;
}

const PUFF = { each: 4, rise: 1.4, seconds: 2.8 };
const PUFF_GEOMETRY = new SphereGeometry(0.5, 10, 8);
const PUFF_MATERIAL = new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.88 });

/** White puffs rising from each chimney in `mouths`, a few to a chimney, each swelling as it climbs and then shrinking away. One draw call. */
export function Puffs({ mouths }: { mouths: { x: number; y: number; z: number }[] }) {
  const ref = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  useLayoutEffect(() => {
    ref.current?.instanceMatrix.setUsage(DynamicDrawUsage);
  }, [mouths.length]);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    mouths.forEach((mouth, h) => {
      for (let k = 0; k < PUFF.each; k++) {
        const t = (clock.elapsedTime / PUFF.seconds + k / PUFF.each + h * 0.37) % 1;
        dummy.position.set(mouth.x + t * 0.5 + Math.sin(t * 6 + h) * 0.06, mouth.y + t * PUFF.rise, mouth.z);
        dummy.scale.setScalar(0.1 + 0.3 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.6 * (1 - t * 0.4));
        dummy.updateMatrix();
        mesh.setMatrixAt(h * PUFF.each + k, dummy.matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  if (mouths.length === 0) return null;
  return <instancedMesh key={mouths.length} ref={ref} args={[PUFF_GEOMETRY, PUFF_MATERIAL, mouths.length * PUFF.each]} frustumCulled={false} />;
}

const RING_MATERIAL = new MeshBasicMaterial({ color: "#ffffff" });

/** The marked house's ring: a thin, still white tube round its footing, riding the ground's height so no slope hides it. */
export function MarkRing({ at }: { at: { x: number; z: number } }) {
  const geometry = useMemo(() => {
    const around = Array.from({ length: 48 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2;
      const [x, z] = [at.x + Math.cos(a) * 2.05, at.z + Math.sin(a) * 1.85];
      return new Vector3(x, groundHeight(x, z) + 0.07, z);
    });
    return new TubeGeometry(new CatmullRomCurve3(around, true), 96, 0.035, 6, true);
  }, [at.x, at.z]);
  return <mesh geometry={geometry} material={RING_MATERIAL} />;
}
