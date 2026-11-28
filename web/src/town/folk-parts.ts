import { BufferGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, Euler, Matrix4, MeshBasicMaterial, MeshToonMaterial, Quaternion, SphereGeometry, TorusGeometry, Vector3, type Material } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { STEPS } from "./parts.tsx";

/**
 * The part kinds the animal folk are made of, and the builder that collects a folk's parts. A folk is built once into a list
 * of unit parts, each fixed to a joint (`Joint`) at its rest place in the folk's own frame (feet at the origin, facing +z,
 * before `FOLK_SCALE`); `Folk.tsx` draws them, one instanced mesh per kind, and an act (`acts.ts`) turns the joints.
 */

/** The folk's size: 1.2 times the old town figures, on the sketch's 1.05. */
export const FOLK_SCALE = 1.26;

/** Every part kind, unit-sized: spheres and rings of radius 1, cylinders and cones of radius 1 and height 1, all centred. */
const GEOMETRIES = {
  sph: new SphereGeometry(1, 16, 12),
  dome: new SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  cyl: new CylinderGeometry(1, 1, 1, 20),
  /** Wider at the top than at its foot: the captain's cap's crown. */
  flare: new CylinderGeometry(1, 0.76, 1, 20),
  cone: new ConeGeometry(1, 1, 10),
  box: new RoundedBoxGeometry(1, 1, 1, 2, 0.15),
  ring: new TorusGeometry(1, 0.2, 6, 24).rotateX(Math.PI / 2),
  /** An apron: the front of a slightly flared tube, open at the back. */
  shell: new CylinderGeometry(1, 1.12, 1, 16, 1, true, -0.9, 1.8),
  spike: new ConeGeometry(1, 1, 5),
  /** Pupils, noses, cheeks, whiskers and teeth: flat colour, no shading. */
  dot: new SphereGeometry(1, 10, 8),
};
export type FolkKind = keyof typeof GEOMETRIES;
export const KINDS = Object.keys(GEOMETRIES) as FolkKind[];
export const geometryOf = (kind: FolkKind): BufferGeometry => GEOMETRIES[kind];

const toon = new MeshToonMaterial({ color: "#ffffff", gradientMap: STEPS });
const MATERIALS: Partial<Record<FolkKind, Material>> = {
  shell: new MeshToonMaterial({ color: "#ffffff", gradientMap: STEPS, side: DoubleSide }),
  dot: new MeshBasicMaterial({ color: "#ffffff" }),
};
/** The clay every part is made of, white and tinted by its instance colour. */
export const materialOf = (kind: FolkKind): Material => MATERIALS[kind] ?? toon;
/** Whether `kind` gets the ink outline: not the open apron, the spikes or the flat dots. */
export const inked = (kind: FolkKind) => kind !== "shell" && kind !== "spike" && kind !== "dot";

/** The joints an act can turn: the whole folk (`root`), the head, each arm with what its hand holds, each leg. */
export type Joint = "root" | "head" | "armL" | "armR" | "legL" | "legR";
export type RigPart = { kind: FolkKind; joint: Joint; local: Matrix4; colour: Color };
/**
 * A built folk: its parts (in its own frame), the point each joint turns about, where each hand and the hat are, and how far
 * its body drops to sit.
 */
export type Rig = { parts: RigPart[]; joints: Record<Joint, Vector3>; hands: { L: Vector3; R: Vector3 }; hat: Vector3; sitDrop: number };

export type Vec = [number, number, number];
type Put = { r?: Vec; s?: number | Vec; c: string };
const euler = new Euler();
const turn = new Quaternion();
const ONE = new Vector3(1, 1, 1);

/** Collects parts on joints; `at` sets the joint and frame the next parts are placed in. */
export class RigBuilder {
  readonly parts: RigPart[] = [];
  private frame = new Matrix4();
  private joint: Joint = "root";

  /** Places the next parts on `joint`, in a frame at `pos` turned by `r`, within `parent` (the folk's own frame by default). */
  at(joint: Joint, pos: Vec | Vector3, r: Vec = [0, 0, 0], parent?: Matrix4): this {
    this.joint = joint;
    const place = new Matrix4().compose(Array.isArray(pos) ? new Vector3(...pos) : pos, turn.setFromEuler(euler.set(...r)), ONE);
    this.frame = parent ? parent.clone().multiply(place) : place;
    return this;
  }

  /** Adds a `kind` part at `pos` in the frame, turned by `r`, scaled by `s`, in colour `c`. */
  put(kind: FolkKind, pos: Vec, { r = [0, 0, 0], s = 1, c }: Put): this {
    const size = typeof s === "number" ? new Vector3(s, s, s) : new Vector3(...s);
    const local = this.frame.clone().multiply(new Matrix4().compose(new Vector3(...pos), turn.setFromEuler(euler.set(...r)), size));
    this.parts.push({ kind, joint: this.joint, local, colour: new Color(c) });
    return this;
  }
}

/** A seeded random stream in [0, 1), so a folk's fur and spikes are the same on every build. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
