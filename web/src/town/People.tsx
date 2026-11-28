import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { Clay, INK, TONES } from "./kit/clay.tsx";
import { Hat } from "./kit/hats.tsx";
import type { Avatar } from "./kit/avatars.ts";
import type { QueenState } from "./court.ts";

/** A person is drawn this many times the size the figure kit is drawn at (1.5 for the people, 0.95 for how the kit's body is built). */
const SCALE = 1.5 * 0.95;
const HAIR = "#5a3d2b";
const TEAL = "#3f7a76";
const DRESS = "#4f8f8a";

/** A hue a little darker than `colour`, for trousers, as a hex string. */
function darker(colour: string): string {
  const n = parseInt(colour.slice(1), 16);
  const k = 0.62;
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** One arm's pose: swung forward by `x` and out to the side by `z`, in radians. */
export type ArmPose = { x: number; z: number };
/** How a seated person sits: leaned forward from the hips, and both arms. */
export type Sitting = { lean: number; left: ArmPose; right: ArmPose };
/** Hands resting on the arms of the throne. */
export const AT_REST: Sitting = { lean: 0, left: { x: -0.45, z: 0.22 }, right: { x: -0.45, z: -0.22 } };

/** What the parts of a seated person move by: the rig that leans, and each arm. */
export type PersonRefs = { rig: RefObject<Group | null>; left: RefObject<Group | null>; right: RefObject<Group | null> };

/** Puts `pose` on a person's refs. */
export function sit(refs: PersonRefs, pose: Sitting): void {
  refs.rig.current!.rotation.x = pose.lean;
  refs.left.current!.rotation.set(pose.left.x, 0, pose.left.z);
  refs.right.current!.rotation.set(pose.right.x, 0, pose.right.z);
}

type PersonProps = {
  refs: PersonRefs;
  coat: string;
  skin: string;
  hat?: Parameters<typeof Hat>[0]["kind"];
  /** The Queen: a teal cape behind and a skirt over the lap. */
  queen?: boolean;
  /** What the left and right hands hold. */
  holdLeft?: ReactNode;
  holdRight?: ReactNode;
  children?: ReactNode;
};

/**
 * A clay person sitting, facing +z, the hips at the origin (the top of the seat) and the feet hanging down. Its parts are
 * clay with ink outlines like the rest of the town's figures. Arms and the lean are set through `refs`, not props, so a
 * moving person changes them each frame without React drawing it again.
 */
export function Person({ refs, coat, skin, hat, queen = false, holdLeft, holdRight, children }: PersonProps) {
  const trousers = darker(coat);
  return (
    <group scale={SCALE}>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.1, 0, 0]}>
          <Clay colour={queen ? DRESS : trousers} position={[0, 0, 0.2]} rotation={[Math.PI / 2, 0, 0]}><capsuleGeometry args={[0.085, 0.22, 6, 12]} /></Clay>
          <Clay colour={queen ? skin : trousers} position={[0, -0.2, 0.37]}><capsuleGeometry args={[0.075, 0.26, 6, 12]} /></Clay>
          <Clay colour="#5a4a42" position={[0, -0.42, 0.42]} scale={[1, 0.65, 1.4]}><sphereGeometry args={[0.1, 12, 8]} /></Clay>
        </group>
      ))}
      {queen && <Clay colour={DRESS} position={[0, 0.02, 0.1]}><coneGeometry args={[0.4, 0.32, 20]} /></Clay>}
      <group ref={refs.rig}>
        <Clay colour={coat} position={[0, 0.35, 0]}><capsuleGeometry args={[queen ? 0.2 : 0.23, 0.28, 8, 16]} /></Clay>
        {queen && <Clay colour={TEAL} position={[0, 0.38, -0.25]} rotation={[0.08, 0, 0]}><boxGeometry args={[0.56, 0.78, 0.06]} /></Clay>}
        <Clay colour="#f4efe6" position={[0, 0.72, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.17, 0.045, 8, 20]} /></Clay>
        {[-1, 1].map((side) => (
          <group key={side} ref={side < 0 ? refs.left : refs.right} position={[side * 0.28, 0.6, 0]}>
            <Clay colour={coat} position={[0, -0.12, 0]}><capsuleGeometry args={[0.065, 0.14, 6, 12]} /></Clay>
            <group position={[0, -0.27, 0.02]}>
              <Clay colour={skin}><sphereGeometry args={[0.085, 12, 8]} /></Clay>
              {side < 0 ? holdLeft : holdRight}
            </group>
          </group>
        ))}
        <group position={[0, 0.91, 0]}>
          <Clay colour={skin} scale={[1.06, 1, 1]}><sphereGeometry args={[0.29, 24, 16]} /></Clay>
          <Clay colour={HAIR} position={[0, 0.03, -0.05]} rotation={[-0.45, 0, 0]}><sphereGeometry args={[0.31, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.36]} /></Clay>
          {[-1, 1].map((side) => (
            <group key={side} position={[side * 0.11, 0.03, 0.25]}>
              <mesh><sphereGeometry args={[0.07, 12, 10]} /><meshBasicMaterial color="#ffffff" /></mesh>
              <mesh position={[0, 0, 0.055]}><sphereGeometry args={[0.04, 10, 8]} /><meshBasicMaterial color={INK} /></mesh>
            </group>
          ))}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.2, -0.1, 0.2]} scale={[1, 0.7, 0.5]}><sphereGeometry args={[0.055, 8, 6]} /><meshBasicMaterial color="#f0a99a" /></mesh>
          ))}
          <Clay colour={skin} position={[0, -0.05, 0.29]} scale={[1, 0.8, 0.9]}><sphereGeometry args={[0.05, 8, 6]} /></Clay>
          {hat && <group position={[0, 0.17, 0]}><Hat kind={hat} colour={coat} /></group>}
        </group>
        {children}
      </group>
    </group>
  );
}

/** The poses the Queen takes. Leaning over the table and writing, reading a parcel in her lap, or sitting as she was. */
const QUEEN_POSES: Record<QueenState, Sitting> = {
  idle: AT_REST,
  ready: AT_REST,
  asked: { lean: 0.5, left: { x: -1.05, z: 0.12 }, right: { x: -1.0, z: -0.1 } },
  busy: { lean: 0.22, left: { x: -1.0, z: 0.3 }, right: { x: -1.0, z: -0.3 } },
};

/** Moves her refs while she writes (the writing arm and the head of the quill) or reads (the glass over the parcel); mounted only while she works. */
function Working({ state, refs }: { state: "asked" | "busy"; refs: PersonRefs }) {
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const pose = QUEEN_POSES[state];
    if (state === "asked") {
      refs.right.current!.rotation.set(pose.right.x + Math.sin(t * 7) * 0.08, 0, pose.right.z + Math.sin(t * 5) * 0.12);
      refs.rig.current!.rotation.x = pose.lean + Math.sin(t * 1.3) * 0.03;
    } else {
      refs.right.current!.rotation.set(pose.right.x, 0, pose.right.z + Math.sin(t * 1.6) * 0.35);
      refs.rig.current!.rotation.x = pose.lean + Math.sin(t * 0.9) * 0.04;
    }
  });
  return null;
}

/** A pen: a thin stick with a nib, held in the writing hand. */
function Quill() {
  return (
    <group position={[0, 0, 0.06]} rotation={[0.9, 0, 0]}>
      <Clay colour={TONES.white} position={[0, 0.12, 0]}><cylinderGeometry args={[0.012, 0.012, 0.3, 6]} /></Clay>
      <Clay colour={INK} position={[0, -0.04, 0]}><coneGeometry args={[0.02, 0.07, 6]} /></Clay>
    </group>
  );
}

/** A reading glass: a ring on a handle. */
function Glass() {
  return (
    <group position={[0, -0.02, 0.12]} rotation={[-0.4, 0, 0]}>
      <Clay colour={TONES.wood} position={[0, 0.0, 0]}><cylinderGeometry args={[0.014, 0.014, 0.2, 6]} /></Clay>
      <Clay colour={TONES.gold} position={[0, 0.18, 0]}><torusGeometry args={[0.09, 0.017, 8, 20]} /></Clay>
    </group>
  );
}

/** A parcel opened in her lap: the box, its lid tilted up behind and a letter inside. */
function OpenParcel() {
  return (
    <group position={[0, 0.2, 0.4]}>
      <Clay colour={TONES.paper} position={[0, 0.04, 0]}><boxGeometry args={[0.46, 0.1, 0.34]} /></Clay>
      <Clay colour={TONES.paper} position={[0, 0.2, -0.2]} rotation={[-0.9, 0, 0]}><boxGeometry args={[0.46, 0.03, 0.26]} /></Clay>
      <Clay colour={TONES.white} position={[0, 0.1, 0.02]} rotation={[0, 0.2, 0]}><boxGeometry args={[0.3, 0.02, 0.22]} /></Clay>
    </group>
  );
}

/** You on your throne, in `look`'s coat, skin and hat. Still. */
export function You({ look }: { look: Avatar }) {
  const refs: PersonRefs = { rig: useRef(null), left: useRef(null), right: useRef(null) };
  useLayoutEffect(() => sit(refs, AT_REST), []);
  return <Person refs={refs} coat={look.coat} skin={look.skin} hat={look.hat} />;
}

/**
 * The Queen on her seat in a tiara and teal cape. `idle` and `ready` she sits still; `asked` she leans over the table and
 * writes; `busy` she reads a parcel in her lap with a glass. Only a working Queen is moved each frame.
 */
export function Queen({ state }: { state: QueenState }) {
  const refs: PersonRefs = { rig: useRef(null), left: useRef(null), right: useRef(null) };
  useLayoutEffect(() => sit(refs, QUEEN_POSES[state]), [state]);
  return (
    <Person refs={refs} coat={DRESS} skin={TONES.skin} hat="tiara" queen holdRight={state === "asked" ? <Quill /> : state === "busy" ? <Glass /> : undefined}>
      {state === "busy" && <OpenParcel />}
      {(state === "asked" || state === "busy") && <Working state={state} refs={refs} />}
    </Person>
  );
}
