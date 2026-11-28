import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera, Vector3, type DirectionalLight } from "three";

/** The colour of the ground the canvas shows beyond the scene. */
export const GROUND = "#efe6d6";
export const FOV = 40;
/**
 * Where the camera looks from, for a window of the given aspect: in front of the town, high up, a
 * little to the right; steeper the narrower the window, so a tall window's height fills too.
 */
const directionFor = (aspect: number) => new Vector3(0.1, 0.62 + 2 * Math.max(0, 1 - aspect), 1).normalize();

/** A scene's extent on the ground, with the points above it that must stay in view and a key that changes only when the extent does. */
export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number; tops: [number, number, number][]; margin: [number, number]; key: string };

/** The camera position and look-at point that fit `b` in a window of the given aspect, with a margin. */
function fit(camera: PerspectiveCamera, b: Bounds, aspect: number): { position: Vector3; target: Vector3 } {
  const probe = camera.clone();
  probe.aspect = aspect;
  probe.updateProjectionMatrix();
  const target = new Vector3((b.minX + b.maxX) / 2, 0.6, (b.minZ + b.maxZ) / 2);
  // The ground's corners and the points above it.
  const corners = [
    [b.minX, 0, b.minZ], [b.maxX, 0, b.minZ], [b.minX, 0, b.maxZ], [b.maxX, 0, b.maxZ], ...b.tops,
  ].map(([x, y, z]) => new Vector3(x, y, z));
  const direction = directionFor(aspect);
  let [near, far] = [1, 400];
  for (let i = 0; i < 32; i++) {
    const d = (near + far) / 2;
    probe.position.copy(direction).multiplyScalar(d).add(target);
    probe.lookAt(target);
    probe.updateMatrixWorld();
    const inside = corners.every((c) => {
      const v = c.clone().project(probe);
      return Math.abs(v.x) <= b.margin[0] && Math.abs(v.y) <= b.margin[1];
    });
    if (inside) far = d;
    else near = d;
  }
  return { position: direction.multiplyScalar(far).add(target), target };
}

/** Moves the camera, gently, to where the whole scene fits the window. */
export function Rig({ bounds }: { bounds: Bounds }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const goal = useMemo(() => fit(camera, bounds, size.width / size.height), [camera, bounds.key, size.width, size.height]);
  const look = useRef<Vector3 | null>(null);
  useFrame((_, dt) => {
    if (!look.current) {
      look.current = goal.target.clone();
      camera.position.copy(goal.position);
    }
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 3);
    camera.position.lerp(goal.position, k);
    look.current.lerp(goal.target, k);
    camera.lookAt(look.current);
  });
  return null;
}

/** The sun: a shadow-casting light whose shadow covers `bounds`. */
export function Sun({ bounds }: { bounds: Bounds }) {
  const light = useRef<DirectionalLight>(null);
  const [cx, cz] = [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2];
  const half = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2 + 4;
  useEffect(() => {
    const sun = light.current!;
    sun.target.position.set(cx, 0, cz);
    sun.target.updateMatrixWorld();
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, far: 80 });
    sun.shadow.camera.updateProjectionMatrix();
  }, [cx, cz, half]);
  return <directionalLight ref={light} position={[cx + 6, 16, cz + 9]} intensity={1.8} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0005} shadow-normalBias={0.03} />;
}
