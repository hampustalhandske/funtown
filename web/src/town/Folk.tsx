import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, Color, DynamicDrawUsage, Euler, InstancedMesh, Matrix4, MeshBasicMaterial, Vector3, type Group, type Object3D } from "three";
import { pose, PROPS, restPosture, walkLegs, type Act } from "./acts.ts";
import { departed, LEAVE_MS, type Costume, type Drawn } from "./folk.ts";
import { FOLK_SCALE, geometryOf, inked, KINDS, materialOf, type FolkKind, type Joint, type Rig } from "./folk-parts.ts";
import { INK } from "./kit/clay.tsx";
import type { Placed } from "./layout.ts";
import { hatRig, rigOf } from "./rig.ts";
import { hullOf, inkMaterial } from "./shaders.ts";

/**
 * One folk the layer draws: the group that places it, its parts and act, its own phase in time, where it stood last frame,
 * and the group that follows its right hand (inside `group`) when it holds something drawn apart.
 */
type Entry = { group: Object3D; rig: Rig; act: Act; phase: number; last: Vector3 | null; hand: Object3D | null };
/** A part kind's instanced mesh and, for an inked kind, its outline sharing the same instance matrices. */
type Mesh = { clay: InstancedMesh; ink: InstancedMesh | null; capacity: number };

const Layer = createContext<Set<Entry> | null>(null);
/** The outline's width in world units. */
const INK_WIDTH = 0.02;
/** Faster than this (units a second) a folk is walking, and its legs swing. */
const WALKING = 0.3;
const WHITE = new Color("#ffffff");

/** A mesh for `kind` with room for `capacity` parts, and its outline. */
function meshOf(kind: FolkKind, capacity: number): Mesh {
  const clay = new InstancedMesh(geometryOf(kind), materialOf(kind), capacity);
  clay.instanceMatrix.setUsage(DynamicDrawUsage);
  clay.setColorAt(0, WHITE);
  clay.instanceColor!.setUsage(DynamicDrawUsage);
  clay.castShadow = kind !== "dot";
  clay.receiveShadow = true;
  clay.frustumCulled = false;
  if (!inked(kind)) return { clay, ink: null, capacity };
  const ink = new InstancedMesh(hullOf(geometryOf(kind)), inkMaterial(INK, INK_WIDTH), capacity);
  ink.instanceMatrix = clay.instanceMatrix;
  ink.frustumCulled = false;
  return { clay, ink, capacity };
}

const scratch = { posture: restPosture(), root: new Matrix4(), turn: new Matrix4(), part: new Matrix4(), inverse: new Matrix4(), at: new Vector3(), euler: new Euler(0, 0, 0, "YXZ") };
const joints = Object.fromEntries((["root", "head", "armL", "armR", "legL", "legR"] as Joint[]).map((j) => [j, new Matrix4()])) as Record<Joint, Matrix4>;

/** Sets `out` to `root` turned by `euler` about the point `o`. */
function about(out: Matrix4, root: Matrix4, o: Vector3, x: number, z: number) {
  scratch.turn.makeRotationFromEuler(scratch.euler.set(x, 0, z, "XYZ")).setPosition(o);
  out.multiplyMatrices(root, scratch.turn).multiply(scratch.part.makeTranslation(-o.x, -o.y, -o.z));
}

/**
 * Draws every folk inside it (each an `Animal` or a `HatModel`) with one instanced mesh per part kind, and the ink outline
 * as one more per inked kind, moving their parts each frame by the act they show.
 */
export function FolkLayer({ children }: { children: ReactNode }) {
  const entries = useMemo(() => new Set<Entry>(), []);
  const holder = useRef<Group>(null);
  const meshes = useRef(new Map<FolkKind, Mesh>());
  useEffect(() => {
    const all = meshes.current;
    return () => {
      for (const m of all.values()) {
        m.clay.dispose();
        m.ink?.dispose();
      }
      all.clear();
    };
  }, []);

  useFrame(({ clock }, delta) => {
    const counts = new Map<FolkKind, number>(KINDS.map((k) => [k, 0]));
    for (const e of entries) for (const p of e.rig.parts) counts.set(p.kind, counts.get(p.kind)! + 1);
    for (const [kind, n] of counts) {
      const had = meshes.current.get(kind);
      if (had && had.capacity >= n) continue;
      if (had) {
        holder.current!.remove(had.clay, ...(had.ink ? [had.ink] : []));
        had.clay.dispose();
        had.ink?.dispose();
      }
      const made = meshOf(kind, Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, n)))));
      holder.current!.add(made.clay, ...(made.ink ? [made.ink] : []));
      meshes.current.set(kind, made);
    }

    const next = new Map<FolkKind, number>(KINDS.map((k) => [k, 0]));
    const { posture, root, at } = scratch;
    for (const e of entries) {
      e.group.updateWorldMatrix(true, false);
      at.setFromMatrixPosition(e.group.matrixWorld);
      const walking = e.last !== null && delta > 0 && e.last.distanceTo(at) / delta > WALKING;
      (e.last ??= new Vector3()).copy(at);
      const t = clock.elapsedTime + e.phase;
      pose(posture, e.act, t, e.rig.sitDrop);
      if (walking && e.act !== "walk" && e.act !== "track") walkLegs(posture, t);

      root.copy(e.group.matrixWorld).scale(scratch.at.set(FOLK_SCALE, FOLK_SCALE, FOLK_SCALE));
      root.multiply(scratch.turn.makeRotationFromEuler(scratch.euler.set(posture.lean, posture.yaw, 0, "YXZ")).setPosition(posture.x, posture.y, posture.z));
      const o = e.rig.joints;
      joints.root.copy(root);
      about(joints.head, root, o.head, posture.nod, 0);
      about(joints.armL, root, o.armL, posture.armL.up, -posture.armL.out);
      about(joints.armR, root, o.armR, posture.armR.up, posture.armR.out);
      about(joints.legL, root, o.legL, posture.legL, 0);
      about(joints.legR, root, o.legR, posture.legR, 0);
      for (const p of e.rig.parts) {
        const m = meshes.current.get(p.kind)!;
        const i = next.get(p.kind)!;
        next.set(p.kind, i + 1);
        m.clay.setMatrixAt(i, scratch.part.multiplyMatrices(joints[p.joint], p.local));
        m.clay.setColorAt(i, p.colour);
      }
      if (e.hand) {
        e.hand.matrix.copy(scratch.inverse.copy(e.group.matrixWorld).invert()).multiply(joints.armR).multiply(scratch.part.makeTranslation(e.rig.hands.R));
        e.hand.matrixWorldNeedsUpdate = true;
      }
    }
    for (const [kind, m] of meshes.current) {
      const n = next.get(kind)!;
      m.clay.count = n;
      m.clay.instanceMatrix.needsUpdate = true;
      m.clay.instanceColor!.needsUpdate = true;
      if (m.ink) m.ink.count = n;
    }
  });

  return (
    <Layer.Provider value={entries}>
      <group ref={holder} />
      {children}
    </Layer.Provider>
  );
}

/**
 * Adds the folk `rig` showing `act` to the layer for as long as it is mounted; gives the group that places it and the group
 * that follows its right hand, which the layer moves when `holds` says it is drawn.
 */
function useEntry(rig: Rig, act: Act, phase: number, holds = false) {
  const layer = useContext(Layer);
  if (!layer) throw new Error("a folk must be drawn inside a FolkLayer");
  const group = useRef<Group>(null);
  const hand = useRef<Group>(null);
  useLayoutEffect(() => {
    const entry: Entry = { group: group.current!, rig, act, phase, last: null, hand: hand.current };
    layer.add(entry);
    return () => {
      layer.delete(entry);
    };
  }, [layer, rig, act, phase, holds]);
  return [group, hand] as const;
}

/** The pointer's target for a folk: an unseen box about its size, as tall as one standing in its hat. */
const HIT = new BoxGeometry(0.8, 1.5, 0.8).translate(0, 0.75, 0);
const UNSEEN = new MeshBasicMaterial();

/** A seed from a character's id, the same on every load: it picks a cat's fur, a hedgehog's spikes and its phase. */
export function seedOf(id: string): number {
  let hash = 0x811c9dc5;
  for (const ch of id) hash = Math.imul(hash ^ ch.codePointAt(0)!, 0x01000193);
  return hash >>> 0;
}

type AnimalProps = {
  costume: Costume; colour: string; act: Act; seed: number;
  /** The Queen's note lies on the slip it holds. */
  note?: boolean;
  /** Drawn in its right hand, moving with the arm: a flag. */
  held?: ReactNode;
};

/** One of the animal folk in `costume` (the lead's clothes in `colour`) acting `act`, at its parent's place; drawn by the layer. */
export function Animal({ costume, colour, act, seed, note = false, held }: AnimalProps) {
  const { animal, hat, clothes } = costume;
  // The clothes come as a fresh list with each layout, so the rig is rebuilt only when what they name changes.
  const wear = clothes.join();
  const rig = useMemo(
    () => rigOf({ animal, hat, clothes: wear === "" ? [] : (wear.split(",") as Costume["clothes"]) }, colour, seed, note && PROPS[act].includes("slip") ? [...PROPS[act], "note"] : PROPS[act]),
    [animal, hat, wear, colour, seed, act, note],
  );
  const [group, hand] = useEntry(rig, act, (seed % 1000) / 100, held !== undefined);
  return (
    <group ref={group}>
      <mesh visible={false} geometry={HIT} material={UNSEEN} />
      {held !== undefined && <group ref={hand} matrixAutoUpdate={false}>{held}</group>}
    </group>
  );
}

/** A hat on its own, its base at its parent's place, scaled as the folk wear it; for the kit page. */
export function HatModel({ hat, colour }: { hat: Costume["hat"]; colour: string }) {
  const rig = useMemo(() => hatRig(hat, colour), [hat, colour]);
  const [group] = useEntry(rig, "stand", 0);
  return <group ref={group} />;
}

/** `placed` as drawn: with each character that left still walking off down the lane until `LEAVE_MS` after it went. */
export function useDeparted(placed: Placed[]): Drawn[] {
  const before = useRef<Drawn[]>([]);
  const shown = departed(before.current, placed, Date.now());
  before.current = shown;
  const [tick, redraw] = useState(0);
  const first = Math.min(...shown.flatMap((p) => (p.leftAt === undefined ? [] : [p.leftAt])));
  useEffect(() => {
    if (first === Infinity) return;
    const timer = setTimeout(() => redraw((n) => n + 1), Math.max(0, first + LEAVE_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [first, tick]);
  return shown;
}
