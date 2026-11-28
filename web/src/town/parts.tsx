import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BufferGeometry, Color, ConeGeometry, CylinderGeometry, DataTexture, Euler, ExtrudeGeometry, InstancedMesh, Matrix4, MeshToonMaterial,
  NearestFilter, Quaternion, RedFormat, Shape, SphereGeometry, Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/** Four light steps: toon materials band their shading into these, which gives the island its matte clay look. */
export const STEPS = new DataTexture(new Uint8Array([95, 165, 222, 255]), 4, 1, RedFormat);
STEPS.minFilter = STEPS.magFilter = NearestFilter;
STEPS.needsUpdate = true;

/** A gable roof's cross-section: a triangle one unit wide and high, one unit deep, its base on y = 0. */
function prism(): BufferGeometry {
  const s = new Shape();
  s.moveTo(-0.5, 0);
  s.lineTo(0.5, 0);
  s.lineTo(0, 1);
  s.closePath();
  return new ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
}

/** Every part kind, unit-sized: a part's size comes from its scale. Cones and pyramids stand on y = 0; the rest are centred. */
export const GEOMETRIES = {
  box: new RoundedBoxGeometry(1, 1, 1, 2, 0.08),
  cyl: new CylinderGeometry(0.5, 0.5, 1, 24),
  cone: new ConeGeometry(0.5, 1, 24).translate(0, 0.5, 0),
  pyramid: new ConeGeometry(0.5 * Math.SQRT2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0),
  sph: new SphereGeometry(0.5, 14, 10),
  gable: prism(),
  pane: new RoundedBoxGeometry(1, 1, 1, 1, 0.1),
};
export type PartKind = keyof typeof GEOMETRIES;

/** The clay every part is made of: white, tinted per part by its instance colour. Window panes keep their own dark glass. */
export const CLAY = new MeshToonMaterial({ color: "#ffffff", gradientMap: STEPS });
const GLASS = new MeshToonMaterial({ color: "#4f5f78", gradientMap: STEPS });
/** Kinds that neither cast a shadow nor take the clay. */
const OWN: Partial<Record<PartKind, MeshToonMaterial>> = { pane: GLASS };

/** One part: its kind, where it is (a world matrix) and its colour. */
export type Part = { kind: PartKind; matrix: Matrix4; colour: string };
type Put = { r?: [number, number, number]; s?: number | [number, number, number]; c?: string };

const turn = new Euler(0, 0, 0, "YXZ");
const spin = new Quaternion();

/** Collects parts in a frame of its own (a place and a turn about the vertical), for `<Parts>` to draw. */
export class PartList {
  readonly parts: Part[] = [];
  private frame = new Matrix4();

  /** Puts the next parts in a frame at (x, y, z) turned `yaw` about the vertical, until the next call. */
  at(x: number, y: number, z: number, yaw = 0): this {
    this.frame.compose(new Vector3(x, y, z), spin.setFromEuler(turn.set(0, yaw, 0)), new Vector3(1, 1, 1));
    return this;
  }

  /** Adds a part at `pos` in the current frame, turned by `r` (x, y, z, tilt then yaw), scaled by `s`, in colour `c`. */
  put(kind: PartKind, pos: [number, number, number], { r = [0, 0, 0], s = 1, c = "#ffffff" }: Put = {}): void {
    const size = typeof s === "number" ? new Vector3(s, s, s) : new Vector3(...s);
    const matrix = new Matrix4().compose(new Vector3(...pos), spin.setFromEuler(turn.set(r[0], r[1], r[2])).clone(), size).premultiply(this.frame);
    this.parts.push({ kind, matrix, colour: c });
  }
}

/** One instanced mesh of `kind` for its parts in `parts`. */
function Kind({ kind, parts }: { kind: PartKind; parts: Part[] }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    const colour = new Color();
    parts.forEach((p, i) => {
      mesh.setMatrixAt(i, p.matrix);
      if (!OWN[kind]) mesh.setColorAt(i, colour.set(p.colour));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [kind, parts]);
  const shadow = !OWN[kind];
  return <instancedMesh key={parts.length} ref={ref} args={[GEOMETRIES[kind], OWN[kind] ?? CLAY, parts.length]} castShadow={shadow} receiveShadow />;
}

/** Draws every part in `parts` with one instanced mesh, so one draw call, per kind. */
export function Parts({ parts }: { parts: Part[] }) {
  const kinds = useMemo(() => {
    const by = new Map<PartKind, Part[]>();
    for (const p of parts) {
      if (!by.has(p.kind)) by.set(p.kind, []);
      by.get(p.kind)!.push(p);
    }
    return [...by];
  }, [parts]);
  return kinds.map(([kind, list]) => <Kind key={kind} kind={kind} parts={list} />);
}
