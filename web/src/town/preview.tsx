import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { TONES } from "./kit/clay.tsx";
import { Hat } from "./kit/hats.tsx";
import { PALETTE, ROLE_HATS, type HatKind } from "./kit/palette.ts";
import { Castle, Desk, Figure, GroundTile, HouseModel, Parcel } from "./kit/parts.tsx";

const roles = new Map<HatKind, string[]>();
for (const [role, hat] of Object.entries(ROLE_HATS)) roles.set(hat, [...(roles.get(hat) ?? []), role]);

/** Every hat with who wears it. */
const HATS: [HatKind, string][] = [
  ["crown", "king (you)"], ["tiara", "queen (steward)"],
  ...[...roles].map(([hat, names]): [HatKind, string] => [hat, names.join(", ")]),
  ["tophat", "*review*"], ["cap", "any other role"],
];

// Labels go in their own element beside the React root: drei's default target changes once the canvas connects,
// which leaves the first label empty.
const labels = { current: document.getElementById("labels")! };

/** Lays `items` (name, part, height of its top) along x, centred, at depth `z`, each named just above its top. */
function Row({ z, gap, items }: { z: number; gap: number; items: [string, ReactNode, number][] }) {
  return items.map(([name, part, top], i) => (
    <group key={name} position={[(i - (items.length - 1) / 2) * gap, 0, z]}>
      {part}
      <Html center portal={labels} zIndexRange={[100, 1]} position={[0, top + 0.35, 0]} className="label">{name}</Html>
    </group>
  ));
}

/** The kit preview: every part laid out in rows, tallest at the back, the camera slowly circling them. */
function Preview() {
  return (
    <Canvas shadows="percentage" camera={{ position: [0, 15, 15], fov: 45 }}>
      <hemisphereLight args={["#fff8ec", "#b9a98f", 1.6]} />
      <directionalLight position={[6, 12, 8]} intensity={1.8} castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={16} shadow-camera-bottom={-16} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.26, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshLambertMaterial color="#efe6d6" />
      </mesh>
      <Row z={-8} gap={2.6} items={PALETTE.map((c) => [`house ${c}`, <HouseModel colour={c} />, 1.8])} />
      <Row z={-3.5} gap={3.5} items={[
        ["ground tile", <GroundTile />, 0], ["castle", <Castle />, 2.4], ["desk", <Desk />, 0.6], ["parcel", <Parcel />, 0.5],
      ]} />
      <Row z={1} gap={2.2} items={HATS.map(([hat, role], i) => [role, <Figure colour={PALETTE[i]} hat={hat} />, 1.8])} />
      <Row z={4} gap={2.2} items={HATS.map(([hat]) => [hat, <group scale={1.5}><Hat kind={hat} colour={TONES.ribbon} /></group>, 0.8])} />
      <OrbitControls autoRotate autoRotateSpeed={0.6} target={[0, 0.5, -1.5]} />
    </Canvas>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
