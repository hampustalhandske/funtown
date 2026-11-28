import { useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { Html, OrbitControls } from "@react-three/drei";
import { TONES } from "./kit/clay.tsx";
import { Hat } from "./kit/hats.tsx";
import { PALETTE, ROLE_HATS, type HatKind } from "./kit/palette.ts";
import { Door, Floor, SeatedFigure, StudentDesk, Table, TeacherDesk, Wall, Whiteboard } from "./kit/classroom.tsx";
import { Castle, Desk, Figure, GroundTile, HouseModel, Parcel } from "./kit/parts.tsx";
import { actOf, type Act } from "./acts.ts";
import { costumeOf } from "./folk.ts";
import { Animal, FolkLayer, HatModel } from "./Folk.tsx";
import { HandFlag } from "./Flag.tsx";
import type { FlagMode } from "./line.ts";

/** Every folk costume: the lead, each named role and the types that borrow an animal, as (label, role, whether a lead). */
const FOLK: [string, string | undefined, boolean][] = [
  ["lead", undefined, true], ["implementer", "implementer", false], ["general-purpose", "general-purpose", false], ["any other type", "other", false],
  ["explorer", "explorer", false], ["Explore", "Explore", false], ["Plan", "Plan", false], ["test-writer", "test-writer", false],
  ["*review*", "code-reviewer", false], ["ui-reviewer", "ui-reviewer", false],
];
/** The lead in each pose that isn't work, and each animal at its work. */
const ACTS: [string, string | undefined, boolean, Act][] = [
  ["stuck", undefined, true, "stuck"], ["resting", undefined, true, "rest"], ["waiting", undefined, true, "wait"],
  ...["implementer", "explorer", "test-writer", "reviewer"].map((role): [string, string, boolean, Act] => [`${role} at work`, role, false, actOf({ pose: "work", animal: costumeOf(role, false).animal })]),
  ["lead at work", undefined, true, "plane"],
];

/** The ask flag in each of its modes, held by a lead in the pose that goes with it: waved at the table, held up and still in the line, furled on the way home. */
const FLAGS: [string, Act, FlagMode][] = [["flag, waving", "wave", "wave"], ["flag, still", "wait", "still"], ["flag, furled", "home", "furled"]];

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

const FOV = 45;
const TARGET = new Vector3(0, 0.5, 0.5);
// Half the layout's width plus room for the front rows, which perspective draws wider.
const REACH = 19;

/** Pulls the camera back far enough that the layout fits the window's width. */
function FitWidth() {
  const { camera, size } = useThree();
  useEffect(() => {
    const fit = REACH / (Math.tan(((FOV / 2) * Math.PI) / 180) * (size.width / size.height));
    camera.position.sub(TARGET).setLength(fit).add(TARGET);
  }, [camera, size]);
  return null;
}

/** The kit preview: every part laid out in rows, tallest at the back, the camera slowly circling them. */
function Preview() {
  return (
    <Canvas shadows="percentage" camera={{ position: [0, 15, 15], fov: FOV }}>
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
      <Row z={-1} gap={3.5} items={[
        ["student desk", <><StudentDesk /><SeatedFigure colour={PALETTE[3]} hat="hardhat" /></>, 1.9], ["teacher's desk", <TeacherDesk width={2} />, 0.6],
        ["table", <Table width={2} depth={0.8} />, 0.6], ["door", <Door />, 1.2], ["floor", <Floor width={2} depth={2} />, 0],
      ]} />
      <Row z={-11.5} gap={7} items={[["whiteboard", <group position={[0, 1.4, 0]}><Whiteboard /></group>, 2.7], ["wall", <Wall length={2} height={1.6} />, 1.6]]} />
      <Row z={1} gap={2.6} items={HATS.map(([hat, role], i) => [role, <Figure colour={PALETTE[i]} hat={hat} />, 1.8])} />
      <Row z={4} gap={2.6} items={HATS.map(([hat]) => [hat, <group scale={1.5}><Hat kind={hat} colour={TONES.ribbon} /></group>, 0.8])} />
      <FolkLayer>
        <Row z={6.5} gap={2.4} items={[
          ...FOLK.map(([label, role, lead], i): [string, ReactNode, number] => {
            const costume = costumeOf(role, lead);
            return [`${label}, ${costume.animal}`, <Animal costume={costume} colour={PALETTE[i]} act="stand" seed={i} />, 1.9];
          }),
          ["captain's cap", <group scale={2}><HatModel hat="captain" colour={TONES.ribbon} /></group>, 0.7],
        ]} />
        <Row z={9} gap={2.4} items={ACTS.map(([label, role, lead, act], i) => [label, <Animal costume={costumeOf(role, lead)} colour={PALETTE[i]} act={act} seed={i} />, 1.9])} />
        <group position={[-12, 0, -3]}>
          <Row z={0} gap={2.8} items={FLAGS.map(([label, act, mode], i) => [label, <Animal costume={costumeOf(undefined, true)} colour={PALETTE[i]} act={act} seed={i} held={<HandFlag mode={mode} />} />, 3.2])} />
        </group>
      </FolkLayer>
      <OrbitControls autoRotate autoRotateSpeed={0.6} target={TARGET} />
      <FitWidth />
    </Canvas>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
