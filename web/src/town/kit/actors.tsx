import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Group } from "three";
import { Clay, INK, TONES } from "./clay.tsx";
import { Hat } from "./hats.tsx";
import type { HatKind } from "./palette.ts";
import { Figure } from "./parts.tsx";
import type { Pose, Spot } from "../layout.ts";

const WALK_SPEED = 2.4;

// Plates go in their own element beside the React root: drei's default target changes once the canvas connects.
export const plates = { current: document.getElementById("plates")! };

/** The shortest signed turn from angle `from` to `to`. */
const turn = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** Walks its children to `to`, facing the way it goes, then turns to `facing`; it appears at its first spot. */
export function Mover({ to, facing, children }: { to: Spot; facing: number; children: ReactNode }) {
  const ref = useRef<Group>(null);
  const [start] = useState({ ...to, facing });
  useFrame(({ clock }, delta) => {
    const g = ref.current!;
    const dt = Math.min(delta, 0.1);
    const [dx, dz] = [to.x - g.position.x, to.z - g.position.z];
    const d = Math.hypot(dx, dz);
    const walking = d > 0.01;
    if (walking) {
      const step = Math.min(d, WALK_SPEED * dt);
      g.position.x += (dx / d) * step;
      g.position.z += (dz / d) * step;
    }
    g.position.y = walking ? Math.abs(Math.sin(clock.elapsedTime * 12)) * 0.08 : 0;
    g.rotation.y += turn(g.rotation.y, walking ? Math.atan2(dx, dz) : facing) * Math.min(1, dt * 8);
  });
  return <group ref={ref} position={[start.x, 0, start.z]} rotation-y={start.facing}>{children}</group>;
}

/** A gentle up-and-down at its own pace, so a crowd doesn't move in step. */
export function Bob({ speed = 2, height = 0.03, children }: { speed?: number; height?: number; children: ReactNode }) {
  const ref = useRef<Group>(null);
  const [phase] = useState(() => Math.random() * Math.PI * 2);
  useFrame(({ clock }) => {
    ref.current!.position.y = (Math.sin(clock.elapsedTime * speed + phase) + 1) * height;
  });
  return <group ref={ref}>{children}</group>;
}

/** A paper slip on a stick, held up and waved: someone asking for you. */
export function Slip() {
  const ref = useRef<Group>(null);
  const [phase] = useState(() => Math.random() * Math.PI * 2);
  useFrame(({ clock }) => {
    ref.current!.rotation.z = Math.sin(clock.elapsedTime * 3 + phase) * 0.18;
  });
  return (
    <group ref={ref} position={[0.32, 0.5, 0]}>
      <Clay colour={TONES.wood} position={[0, 0.6, 0]}><cylinderGeometry args={[0.025, 0.025, 1.2, 8]} /></Clay>
      <Clay colour={TONES.paper} position={[0, 1.3, 0]}><boxGeometry args={[0.44, 0.32, 0.03]} /></Clay>
      {[-0.025, 0.025].map((z) => (
        <Clay key={z} colour={TONES.ribbon} position={[0, 1.3, z]}><sphereGeometry args={[0.055, 12, 8]} /></Clay>
      ))}
    </group>
  );
}

/** Three little stars circling over a stuck head. */
export function Dizzy() {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    ref.current!.rotation.y = clock.elapsedTime * 1.8;
  });
  return (
    <group ref={ref} position={[0, 1.3, -0.1]}>
      {[0, 2.1, 4.2].map((a) => (
        <Clay key={a} colour={TONES.gold} position={[Math.sin(a) * 0.32, Math.sin(a * 2) * 0.04, Math.cos(a) * 0.32]}>
          <octahedronGeometry args={[0.06]} />
        </Clay>
      ))}
    </group>
  );
}

/** A character sitting on the ground, slumped, eyes shut and hat askew: stuck. */
export function Sitting({ colour, hat }: { colour: string; hat: HatKind }) {
  return (
    <group>
      <Clay colour={colour} position={[0, 0.3, -0.08]} rotation={[-0.35, 0, 0]}><capsuleGeometry args={[0.25, 0.15, 8, 16]} /></Clay>
      {[-0.45, 0.45].map((a) => (
        <group key={a} rotation-y={a}>
          <Clay colour={colour} position={[0, 0.09, 0.3]} rotation={[Math.PI / 2, 0, 0]}><capsuleGeometry args={[0.09, 0.28, 6, 12]} /></Clay>
        </group>
      ))}
      <group position={[0, 0.78, -0.18]} rotation={[-0.15, 0, 0.3]}>
        <Clay colour={TONES.skin}><sphereGeometry args={[0.28, 24, 16]} /></Clay>
        {[-0.1, 0.1].map((x) => (
          <mesh key={x} position={[x, 0.02, 0.265]}>
            <boxGeometry args={[0.09, 0.02, 0.02]} />
            <meshBasicMaterial color={INK} />
          </mesh>
        ))}
        <group position={[0.12, 0.15, 0]} rotation={[0.2, 0, -0.6]}><Hat kind={hat} colour={colour} /></group>
      </group>
      <Dizzy />
    </group>
  );
}

/** A character in `pose`: standing and busy, standing still, standing with a slip held up, or sitting stuck. */
export function Body({ pose, colour, hat }: { pose: Pose; colour: string; hat: HatKind }) {
  if (pose === "stuck") return <Sitting colour={colour} hat={hat} />;
  if (pose === "idle") return <Figure colour={colour} hat={hat} />;
  return (
    <group>
      <Bob speed={pose === "queue" ? 3 : 2}><Figure colour={colour} hat={hat} /></Bob>
      {pose === "queue" && <Slip />}
    </group>
  );
}

/** A little ribbon flag on a parcel whose review is ready. */
export function Pennant() {
  return (
    <group position={[0.15, 0.4, 0]}>
      <Clay colour={TONES.wood} position={[0, 0.25, 0]}><cylinderGeometry args={[0.02, 0.02, 0.5, 8]} /></Clay>
      <Clay colour={TONES.ribbon} position={[0.11, 0.42, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.09, 0.22, 3]} /></Clay>
    </group>
  );
}

type PickProps = { id: string; height: number; plate: string | null; onPick: () => void; onHover: (id: string | null) => void; children: ReactNode };

/** Makes its children hoverable and clickable as `id`; shows `plate`, when given, as a name plate `height` above them that moves with them. */
export function Pick({ id, height, plate, onPick, onHover, children }: PickProps) {
  const stop = (e: ThreeEvent<PointerEvent | MouseEvent>) => e.stopPropagation();
  return (
    <group
      onClick={(e) => {
        stop(e);
        onPick();
      }}
      onPointerOver={(e) => {
        stop(e);
        onHover(id);
      }}
      onPointerOut={() => onHover(null)}>
      {children}
      {plate !== null && (
        <Html center portal={plates} zIndexRange={[100, 1]} className="plate" position={[0, height, 0]}>
          {plate}
        </Html>
      )}
    </group>
  );
}

/**
 * The name of the thing under the pointer, among `keys` (the keys of the things that can be hovered). A hovered thing that
 * leaves `keys` takes its hover with it, so its plate can't come back on its own; the body cursor is a pointer while one is hovered.
 */
export function useHover(keys: string[]): [string | null, (key: string | null) => void] {
  const [hover, setHover] = useState<string | null>(null);
  const hovered = hover !== null && keys.includes(hover);
  useEffect(() => {
    if (hover !== null && !hovered) setHover(null);
    document.body.style.cursor = hovered ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hover, hovered]);
  return [hover, setHover];
}
