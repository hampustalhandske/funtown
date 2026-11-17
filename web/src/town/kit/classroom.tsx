import type { ReactNode } from "react";
import { Clay, TONES } from "./clay.tsx";
import { Figure } from "./parts.tsx";
import type { HatKind } from "./palette.ts";

/** How tall the front wall behind the whiteboard is, and the side walls, which stay low so the room can be seen into. */
export const WALL_HEIGHT = 3.8;
export const SIDE_WALL_HEIGHT = 1.6;
/** The whiteboard's face, in world units. */
export const BOARD_SIZE = { width: 5.6, height: 2 };
/** How high the whiteboard's middle is above the floor. */
export const BOARD_HEIGHT = 2.4;

/** A floor slab `width` by `depth`, its top at y = 0, centred on the origin. */
export function Floor({ width, depth }: { width: number; depth: number }) {
  return (
    <group>
      <Clay colour={TONES.soil} castShadow={false} position={[0, -0.15, 0]}><boxGeometry args={[width, 0.2, depth]} /></Clay>
      <Clay colour={TONES.paper} castShadow={false} position={[0, -0.025, 0]}><boxGeometry args={[width, 0.05, depth]} /></Clay>
    </group>
  );
}

/** A wall `length` long (along x) and `height` tall, 0.3 thick, its bottom at y = 0, centred on the origin. */
export function Wall({ length, height }: { length: number; height: number }) {
  return <Clay colour={TONES.stone} castShadow={false} position={[0, height / 2, 0]}><boxGeometry args={[length, height, 0.3]} /></Clay>;
}

/** A door in the wall at +x: a wooden slab with a round knob on the side facing the room (-x), 0.9 wide, standing on the floor. */
export function Door() {
  return (
    <group rotation-y={-Math.PI / 2}>
      <Clay colour={TONES.wood} position={[0, 0.6, 0]}><boxGeometry args={[0.9, 1.2, 0.06]} /></Clay>
      <Clay colour={TONES.gold} position={[0.3, 0.6, 0.06]}><sphereGeometry args={[0.05, 12, 8]} /></Clay>
    </group>
  );
}

/** The whiteboard: a wooden frame round a white face with a tray at its foot, facing +z, centred on the origin. */
export function Whiteboard() {
  const { width, height } = BOARD_SIZE;
  return (
    <group>
      <Clay colour={TONES.wood} position={[0, 0, 0]}><boxGeometry args={[width + 0.24, height + 0.24, 0.1]} /></Clay>
      <Clay colour={TONES.white} position={[0, 0, 0.04]}><boxGeometry args={[width, height, 0.04]} /></Clay>
      <Clay colour={TONES.wood} position={[0, -height / 2 - 0.1, 0.1]}><boxGeometry args={[width * 0.6, 0.06, 0.16]} /></Clay>
    </group>
  );
}

/** The teacher's desk, `width` wide with its top at y = 0.6: a desk with a paper on it, the front facing +z. */
export function TeacherDesk({ width }: { width: number }) {
  return (
    <group>
      <Clay colour={TONES.wood} position={[0, 0.57, 0]}><boxGeometry args={[width, 0.06, 0.65]} /></Clay>
      {[-1, 1].map((side) => (
        <Clay key={side} colour={TONES.wood} position={[(side * (width - 0.16)) / 2, 0.27, 0]}><boxGeometry args={[0.08, 0.54, 0.55]} /></Clay>
      ))}
      <Clay colour={TONES.paper} position={[0.3, 0.64, 0]} rotation-y={0.2}><boxGeometry args={[0.32, 0.06, 0.24]} /></Clay>
    </group>
  );
}

/** A table for parcels, `width` by `depth`, its top at y = 0.6, centred on the origin. */
export function Table({ width, depth }: { width: number; depth: number }) {
  return (
    <group>
      <Clay colour={TONES.wood} position={[0, 0.57, 0]}><boxGeometry args={[width, 0.06, depth]} /></Clay>
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => (
        <Clay key={`${x},${z}`} colour={TONES.wood} position={[(x * (width - 0.16)) / 2, 0.27, (z * (depth - 0.16)) / 2]}><boxGeometry args={[0.08, 0.54, 0.08]} /></Clay>
      )))}
    </group>
  );
}

/** A student's seat at the origin and its desk in front of it (+z): a chair with a back behind the seat, a small desk with its top at y = 0.6. */
export function StudentDesk() {
  return (
    <group>
      <Clay colour={TONES.silver} position={[0, 0.32, 0]}><boxGeometry args={[0.55, 0.06, 0.55]} /></Clay>
      <Clay colour={TONES.silver} position={[0, 0.62, -0.3]}><boxGeometry args={[0.55, 0.45, 0.05]} /></Clay>
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => (
        <Clay key={`${x},${z}`} colour={TONES.charcoal} position={[x * 0.22, 0.15, z * 0.22]}><boxGeometry args={[0.05, 0.3, 0.05]} /></Clay>
      )))}
      <Clay colour={TONES.wood} position={[0, 0.57, 0.55]}><boxGeometry args={[0.9, 0.06, 0.42]} /></Clay>
      {[-1, 1].map((x) => (
        <Clay key={x} colour={TONES.wood} position={[x * 0.4, 0.27, 0.55]}><boxGeometry args={[0.06, 0.54, 0.34]} /></Clay>
      ))}
    </group>
  );
}

/** A character sitting on `StudentDesk`'s chair, facing +z: the same figure, raised, with thighs along the seat; `children` sit with it. */
export function SeatedFigure({ colour, hat, children }: { colour: string; hat: HatKind; children?: ReactNode }) {
  return (
    <group position={[0, 0.22, 0]}>
      <Figure colour={colour} hat={hat} />
      {[-0.12, 0.12].map((x) => (
        <Clay key={x} colour={colour} position={[x, 0.2, 0.2]} rotation={[Math.PI / 2, 0, 0]}><capsuleGeometry args={[0.09, 0.28, 6, 12]} /></Clay>
      ))}
      {children}
    </group>
  );
}
