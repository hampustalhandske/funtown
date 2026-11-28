import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, CanvasTexture, Color, ConeGeometry, DynamicDrawUsage, InstancedMesh, MeshBasicMaterial, Object3D, OctahedronGeometry, SphereGeometry, SRGBColorSpace } from "three";
import { TONES } from "./kit/clay.tsx";
import { CLAY } from "./parts.tsx";
import { LOOKS, type FireLook, type Point } from "./fire.ts";

/**
 * Fire, smoke, steam, thrown water and a stuck character's stars: parts and sprites, no shader of their own. Each kind is
 * one instanced mesh moved each frame, so a fire costs no draw call of its own. The numbers of how each form looks are in
 * `fire.ts`; the red-orange of the flames is the only one in the town.
 */

/** A fire to draw: its form (not `none`), where it sits (on the roof) and which way its house turns. */
export type Blaze = { key: string; form: keyof typeof LOOKS; at: Point; facing: number };

/** The flames of one fire, each with its colour, where it stands in the house's frame (across, forward) and its size. */
const FLAMES = 9;
const FLAME_COLOURS = ["#ff6a2b", "#ff9a32", "#ffc84d"];
/** The time a frozen fire is drawn at: a still picture of the last thing seen. */
const FROZEN_AT = 7.3;
const FLAME = new ConeGeometry(0.22, 0.9, 7).translate(0, 0.45, 0);
const FLAME_MATERIAL = new MeshBasicMaterial({ color: "#ffffff" });
const SMOKE = new SphereGeometry(0.5, 10, 8);
const SMOKE_MATERIAL = new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85, depthWrite: false });
/** The wind: smoke leans toward +x and a little away from the camera. */
const DOWNWIND = { x: 1, z: -0.6 };

const dummy = new Object3D();
const colour = new Color();

/** A mesh of `count` instances that is moved each frame; made new when the count changes. */
function useInstances(count: number) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.computeBoundingSphere();
  }, [count]);
  return ref;
}

/** The look of `blaze` and the time its flames and smoke are drawn at (frozen: a fixed one). */
const timeOf = (look: FireLook, clock: number) => (look.frozen ? FROZEN_AT : clock);

/** How many smoke puffs `blazes` need. */
const puffsIn = (blazes: Blaze[]) => blazes.reduce((n, b) => n + LOOKS[b.form].puffs, 0);

/** The flames of every fire in `blazes`: red-orange cones flickering on the roof, still when the fire is last seen. */
function Flames({ blazes }: { blazes: Blaze[] }) {
  const count = blazes.length * FLAMES;
  const ref = useInstances(count);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < count; i++) mesh.setColorAt(i, colour.set(FLAME_COLOURS[i % 3]));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [count, ref]);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    blazes.forEach((b, h) => {
      const look = LOOKS[b.form];
      const t = timeOf(look, clock.elapsedTime);
      const [sin, cos] = [Math.sin(b.facing), Math.cos(b.facing)];
      for (let k = 0; k < FLAMES; k++) {
        const a = (k / FLAMES) * Math.PI * 2;
        const reach = k % 2 ? 1 : 0.5;
        const [across, forward] = [Math.cos(a) * 0.35 * reach, Math.sin(a) * 0.5 * reach];
        const flick = 0.75 + 0.25 * Math.sin(t * 9 + k * 1.7) + 0.12 * Math.sin(t * 23 + k);
        dummy.position.set(b.at.x + across * cos + forward * sin, b.at.y - 0.1, b.at.z - across * sin + forward * cos);
        dummy.rotation.set(0, 0, Math.sin(t * 5 + k) * 0.12);
        dummy.scale.set(look.flame * (0.8 + (k % 3) * 0.15), look.flame * flick * (1.1 + (k % 3) * 0.35), look.flame * (0.8 + (k % 3) * 0.15));
        dummy.updateMatrix();
        mesh.setMatrixAt(h * FLAMES + k, dummy.matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  if (count === 0) return null;
  return <instancedMesh key={count} ref={ref} args={[FLAME, FLAME_MATERIAL, count]} frustumCulled={false} />;
}

/**
 * The smoke of every fire in `blazes`: round puffs rising from the roof, swelling and leaning downwind as they climb and
 * shrinking away at the top. The loud fire's column is dark and tall, a quiet one grey and short, a handled fire's steam white.
 */
function Smoke({ blazes }: { blazes: Blaze[] }) {
  const count = puffsIn(blazes);
  const ref = useInstances(count);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    let i = 0;
    for (const b of blazes) for (let k = 0; k < LOOKS[b.form].puffs; k++) mesh.setColorAt(i++, colour.set(LOOKS[b.form].smoke));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [blazes, count, ref]);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    let i = 0;
    for (const b of blazes) {
      const look = LOOKS[b.form];
      const loud = b.form === "burning-loud";
      const t = timeOf(look, clock.elapsedTime);
      for (let k = 0; k < look.puffs; k++) {
        const a = (t * (loud ? 0.09 : 0.18) + k / look.puffs) % 1;
        const sway = Math.sin(a * 4 + k) * 0.25 * a * look.width + a * a * look.width * 0.9;
        dummy.position.set(b.at.x + sway * DOWNWIND.x, b.at.y + 0.4 + a * look.rise, b.at.z + a * DOWNWIND.z);
        dummy.rotation.set(0, 0, 0);
        // It swells from nothing at the roof and thins away at the top of its climb.
        dummy.scale.setScalar((0.5 + a * look.width) * (loud ? 1.15 : 1) * Math.min(1, a * 6) * Math.min(1, (1 - a) * 3));
        dummy.updateMatrix();
        mesh.setMatrixAt(i++, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  if (count === 0) return null;
  return <instancedMesh key={count} ref={ref} args={[SMOKE, SMOKE_MATERIAL, count]} frustumCulled={false} />;
}

let glow: CanvasTexture | null = null;
/** A soft round dot, white in the middle and clear at the rim, drawn once: what the fires' glow is tinted from. */
function glowTexture(): CanvasTexture {
  if (glow) return glow;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d")!;
  const ramp = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  ramp.addColorStop(0, "rgba(255,255,255,1)");
  ramp.addColorStop(0.35, "rgba(255,255,255,0.5)");
  ramp.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = ramp;
  g.fillRect(0, 0, 64, 64);
  glow = new CanvasTexture(canvas);
  glow.colorSpace = SRGBColorSpace;
  return glow;
}

/** The fires that burn or are handled (not last seen): a warm, still halo over the roof, bigger the louder. */
function Glows({ blazes }: { blazes: Blaze[] }) {
  const map = useMemo(glowTexture, []);
  return blazes.filter((b) => LOOKS[b.form].glow > 0).map((b) => (
    <sprite key={b.key} position={[b.at.x, b.at.y + 0.4, b.at.z]} scale={LOOKS[b.form].glow}>
      <spriteMaterial map={map} color="#ff8a3a" transparent depthWrite={false} blending={AdditiveBlending} />
    </sprite>
  ));
}

/** Every fire in `blazes` on its roof: flames, smoke and glow. */
export function Fires({ blazes }: { blazes: Blaze[] }) {
  return (
    <>
      <Flames blazes={blazes} />
      <Smoke blazes={blazes} />
      <Glows blazes={blazes} />
    </>
  );
}

/** Water thrown from a bucket at `from` to a roof at `to`. */
export type Throw = { key: string; from: Point; to: Point };
const DROPS = 6;
const DROP = new SphereGeometry(0.09, 8, 6);
const DROP_MATERIAL = new MeshBasicMaterial({ color: "#7cc4e0" });

/** The water every thrower sends at its house's roof: drops flying in an arc from the bucket, again and again. */
export function Water({ throws }: { throws: Throw[] }) {
  const count = throws.length * DROPS;
  const ref = useInstances(count);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    throws.forEach((w, h) => {
      for (let k = 0; k < DROPS; k++) {
        const a = (clock.elapsedTime * 0.9 + k / DROPS) % 1;
        dummy.position.set(w.from.x + (w.to.x - w.from.x) * a, w.from.y + (w.to.y - w.from.y) * a + Math.sin(a * Math.PI) * 0.8, w.from.z + (w.to.z - w.from.z) * a);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        mesh.setMatrixAt(h * DROPS + k, dummy.matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  if (count === 0) return null;
  return <instancedMesh key={count} ref={ref} args={[DROP, DROP_MATERIAL, count]} frustumCulled={false} />;
}

/** Three little stars circle this far from the middle, this high above where the folk stands, and turn this fast (radians a second). */
const STARS = { radius: 0.45, up: 1.9, speed: 1.8 };
const STAR = new OctahedronGeometry(0.17);

/** Gold stars circling over each place in `heads`, each over a loud stuck character's slumped head. */
export function Stars({ heads }: { heads: (Point & { key: string })[] }) {
  const count = heads.length * 3;
  const ref = useInstances(count);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < count; i++) mesh.setColorAt(i, colour.set(TONES.gold));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [count, ref]);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    heads.forEach((h, n) => {
      for (let k = 0; k < 3; k++) {
        const a = clock.elapsedTime * STARS.speed + k * 2.1;
        dummy.position.set(h.x + Math.sin(a) * STARS.radius, h.y + STARS.up + Math.sin(a * 2) * 0.04, h.z + Math.cos(a) * STARS.radius);
        dummy.rotation.set(0, a * 2, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        mesh.setMatrixAt(n * 3 + k, dummy.matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  if (count === 0) return null;
  return <instancedMesh key={count} ref={ref} args={[STAR, CLAY, count]} frustumCulled={false} />;
}
