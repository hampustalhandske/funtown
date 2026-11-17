import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { PerspectiveCamera, Vector3, type DirectionalLight, type Group } from "three";
import { Clay, INK, TONES } from "./kit/clay.tsx";
import { Hat } from "./kit/hats.tsx";
import { PALETTE, type HatKind } from "./kit/palette.ts";
import { Castle, Desk, Figure, HouseModel, Parcel } from "./kit/parts.tsx";
import { CASTLE, DESK, KING, QUEUE_HEAD, keyOf, poseOf, type Placed, type Pose, type Spot } from "./layout.ts";
import type { TownIndex } from "./TownPage.tsx";

const GROUND = "#efe6d6";
const KING_COLOUR = TONES.ribbon;
const QUEEN_COLOUR = PALETTE[4];
const FOV = 40;
/**
 * Where the camera looks from, for a window of the given aspect: in front of the town, high up, a
 * little to the right; steeper the narrower the window, so a tall window's height fills too.
 */
const directionFor = (aspect: number) => new Vector3(0.1, 0.62 + 2 * Math.max(0, 1 - aspect), 1).normalize();
const WALK_SPEED = 2.4;
const CASTLE_SCALE = 1.6;

// Plates go in their own element beside the React root: drei's default target changes once the canvas connects.
const plates = { current: document.getElementById("plates")! };

/** The town's extent on the ground, with a key that changes only when the extent does. */
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number; key: string };

/** The ground everything in `placed` needs, the castle and the plaza included. */
function boundsOf(placed: Placed[]): Bounds {
  let [minX, maxX, minZ, maxZ] = [-6.5, 6.5, CASTLE.z - 2.6, QUEUE_HEAD.z + 3.4];
  for (const p of placed) {
    const [w, back, front] = p.kind === "building" ? [2.4, 2, 3.3] : [0.8, 0.8, 0.8];
    minX = Math.min(minX, p.at.x - w);
    maxX = Math.max(maxX, p.at.x + w);
    minZ = Math.min(minZ, p.at.z - back);
    maxZ = Math.max(maxZ, p.at.z + front);
  }
  return { minX, maxX, minZ, maxZ, key: [minX, maxX, minZ, maxZ].join() };
}

/** The camera position and look-at point that fit `b` in a window of the given aspect, with a margin. */
function fit(camera: PerspectiveCamera, b: Bounds, aspect: number): { position: Vector3; target: Vector3 } {
  const probe = camera.clone();
  probe.aspect = aspect;
  probe.updateProjectionMatrix();
  const target = new Vector3((b.minX + b.maxX) / 2, 0.6, (b.minZ + b.maxZ) / 2);
  // The ground's corners, the tops of the castle's towers at the back, and a house's height at the front.
  const reach = 1.6 * CASTLE_SCALE;
  const corners = [
    [b.minX, 0, b.minZ], [b.maxX, 0, b.minZ], [b.minX, 0, b.maxZ], [b.maxX, 0, b.maxZ],
    [CASTLE.x - reach, 3.9, CASTLE.z - reach], [CASTLE.x + reach, 3.9, CASTLE.z - reach], [b.minX, 2, b.maxZ], [b.maxX, 2, b.maxZ],
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
      return Math.abs(v.x) <= 0.92 && Math.abs(v.y) <= 0.84;
    });
    if (inside) far = d;
    else near = d;
  }
  return { position: direction.multiplyScalar(far).add(target), target };
}

/** Moves the camera, gently, to where the whole town fits the window. */
function Rig({ bounds }: { bounds: Bounds }) {
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
function Sun({ bounds }: { bounds: Bounds }) {
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

/** The shortest signed turn from angle `from` to `to`. */
const turn = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** Walks its children to `to`, facing the way it goes, then turns to `facing`; it appears at its first spot. */
function Mover({ to, facing, children }: { to: Spot; facing: number; children: ReactNode }) {
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
function Bob({ speed = 2, height = 0.03, children }: { speed?: number; height?: number; children: ReactNode }) {
  const ref = useRef<Group>(null);
  const [phase] = useState(() => Math.random() * Math.PI * 2);
  useFrame(({ clock }) => {
    ref.current!.position.y = (Math.sin(clock.elapsedTime * speed + phase) + 1) * height;
  });
  return <group ref={ref}>{children}</group>;
}

/** A paper slip on a stick, held up and waved: someone asking for you. */
function Slip() {
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
function Dizzy() {
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
function Sitting({ colour, hat }: { colour: string; hat: HatKind }) {
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
function Body({ pose, colour, hat }: { pose: Pose; colour: string; hat: HatKind }) {
  if (pose === "stuck") return <Sitting colour={colour} hat={hat} />;
  if (pose === "idle") return <Figure colour={colour} hat={hat} />;
  return (
    <group>
      <Bob speed={pose === "queue" ? 3 : 2}><Figure colour={colour} hat={hat} /></Bob>
      {pose === "queue" && <Slip />}
    </group>
  );
}

/** A working subagent: its hat on a rack peg, nodding as it works. */
function RackHat({ hat, colour }: { hat: HatKind; colour: string }) {
  const ref = useRef<Group>(null);
  const [phase] = useState(() => Math.random() * Math.PI * 2);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 2.5 + phase;
    ref.current!.rotation.set(Math.sin(t) * 0.08, Math.sin(t * 0.5) * 0.3, 0);
  });
  return <group ref={ref} position={[0, 0.88, 0]} scale={0.72}><Hat kind={hat} colour={colour} /></group>;
}

/** One rail of a hat rack: posts at each end and a peg under each hat spot in `pegs` (all at one z). */
function Rail({ pegs }: { pegs: Spot[] }) {
  const xs = pegs.map((p) => p.x);
  const [from, to] = [Math.min(...xs) - 0.22, Math.max(...xs) + 0.22];
  return (
    <group position={[0, 0, pegs[0].z]}>
      <Clay colour={TONES.wood} position={[(from + to) / 2, 0.7, 0]}><boxGeometry args={[to - from, 0.08, 0.08]} /></Clay>
      {[from, to].map((x) => (
        <Clay key={x} colour={TONES.wood} position={[x, 0.35, 0]}><cylinderGeometry args={[0.04, 0.05, 0.7, 8]} /></Clay>
      ))}
      {xs.map((x) => (
        <Clay key={x} colour={TONES.wood} position={[x, 0.8, 0]}><cylinderGeometry args={[0.025, 0.025, 0.16, 8]} /></Clay>
      ))}
    </group>
  );
}

/** A little ribbon flag on a parcel whose review is ready. */
function Pennant() {
  return (
    <group position={[0.15, 0.4, 0]}>
      <Clay colour={TONES.wood} position={[0, 0.25, 0]}><cylinderGeometry args={[0.02, 0.02, 0.5, 8]} /></Clay>
      <Clay colour={TONES.ribbon} position={[0.11, 0.42, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.09, 0.22, 3]} /></Clay>
    </group>
  );
}

/** How high above its spot a thing's name plate floats. */
const plateHeight = (p: Placed) =>
  p.kind === "building" ? 2.3 : p.kind === "parcel" ? 0.9 : p.kind === "steward" ? 1.8 : p.pose === "work" && p.kind === "hat" ? 1.4 : p.pose === "queue" ? 2.2 : 1.8;

type PickProps = { p: Placed; plate: string | null; onPick: (p: Placed) => void; onHover: (key: string | null) => void; children: ReactNode };

/** Makes its children hoverable and clickable as `p`; shows `plate`, when given, as a name plate above them that moves with them. */
function Pick({ p, plate, onPick, onHover, children }: PickProps) {
  const key = keyOf(p);
  const stop = (e: ThreeEvent<PointerEvent | MouseEvent>) => e.stopPropagation();
  return (
    <group
      onClick={(e) => {
        stop(e);
        onPick(p);
      }}
      onPointerOver={(e) => {
        stop(e);
        onHover(key);
      }}
      onPointerOut={() => onHover(null)}>
      {children}
      {plate !== null && (
        <Html center portal={plates} zIndexRange={[100, 1]} className="plate" position={[0, plateHeight(p), 0]}>
          {plate}
        </Html>
      )}
    </group>
  );
}

type Props = {
  /** The town's houses and characters, for the steward's stage and parcels' reviews. */
  index: TownIndex;
  placed: Placed[];
  /** The words a thing's hover plate shows. */
  name: (p: Placed) => string;
  onPick: (p: Placed) => void;
};

/** The village: the castle with the king at his desk, a building per house, and everyone placed by `layout`. */
export function Village({ index, placed, name, onPick }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const bounds = useMemo(() => boundsOf(placed), [placed]);
  const hovered = placed.some((p) => keyOf(p) === hover);
  useEffect(() => {
    // A hovered thing that leaves the town takes its hover with it, so its plate can't come back on its own.
    if (hover !== null && !hovered) setHover(null);
    document.body.style.cursor = hovered ? "pointer" : "";
  }, [hover, hovered]);
  const pick = (p: Placed, children: ReactNode) => (
    <Pick p={p} plate={keyOf(p) === hover ? name(p) : null} onPick={onPick} onHover={setHover}>{children}</Pick>
  );

  // Hats on racks, one rail per row of pegs (cwd and z).
  const rails = new Map<string, Spot[]>();
  for (const p of placed) {
    if (p.kind !== "hat" || p.pose !== "work") continue;
    const rail = `${p.cwd}|${p.at.z}`;
    rails.set(rail, [...(rails.get(rail) ?? []), p.at]);
  }

  const thing = (p: Placed) => {
    switch (p.kind) {
      case "building":
        return (
          <group position={[p.at.x, 0, p.at.z]}>
            {pick(p, <HouseModel colour={p.colour} />)}
          </group>
        );
      case "parcel":
        return (
          <group position={[p.at.x, 0, p.at.z]} rotation-y={((p.number % 5) - 2) * 0.12}>
            {pick(
              p,
              <>
                <Parcel />
                {index.houses.get(p.cwd)?.parcels?.find((x) => x.number === p.number)?.review?.state === "ready" && <Pennant />}
              </>,
            )}
          </group>
        );
      case "steward": {
        const queen = index.characters.get(p.id)?.character;
        return <Mover to={p.at} facing={0}>{pick(p, <Body pose={queen ? poseOf(queen) : "work"} colour={QUEEN_COLOUR} hat="tiara" />)}</Mover>;
      }
      case "lead":
      case "hat": {
        // Queuers turn halfway to the desk, so their faces and slips still show; the stuck sit turned a little, so their legs read as sitting.
        const facing = p.pose === "queue" ? Math.atan2(DESK.x - p.at.x, DESK.z - p.at.z) / 2 : p.pose === "stuck" ? 0.8 : 0;
        return (
          <Mover to={p.at} facing={facing}>
            {pick(p, p.kind === "hat" && p.pose === "work" ? <RackHat hat={p.hat} colour={p.colour} /> : <Body pose={p.pose} colour={p.colour} hat={p.kind === "hat" ? p.hat : "cap"} />)}
          </Mover>
        );
      }
    }
  };

  const width = bounds.maxX - bounds.minX + 1;
  const depth = bounds.maxZ - bounds.minZ + 1;
  return (
    <Canvas shadows="percentage" camera={{ fov: FOV, position: [0, 30, 30] }} onPointerMissed={() => setHover(null)}>
      <color attach="background" args={[GROUND]} />
      <hemisphereLight args={["#fff8ec", "#b9a98f", 1.6]} />
      <Sun bounds={bounds} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.26, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshLambertMaterial color={GROUND} />
      </mesh>
      {/* The board the town stands on: grass on soil, catching shadows but casting none. */}
      <group position={[(bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2]}>
        <Clay colour={TONES.soil} castShadow={false} position={[0, -0.15, 0]}><boxGeometry args={[width, 0.2, depth]} /></Clay>
        <Clay colour={TONES.grass} castShadow={false} position={[0, -0.025, 0]}><boxGeometry args={[width, 0.05, depth]} /></Clay>
      </group>
      <group position={[CASTLE.x, 0, CASTLE.z]} scale={CASTLE_SCALE}><Castle /></group>
      <group position={[DESK.x, 0, DESK.z]}>
        <Desk />
        <Clay colour={TONES.paper} position={[0.3, 0.64, 0]} rotation-y={0.2}><boxGeometry args={[0.32, 0.06, 0.24]} /></Clay>
      </group>
      <group position={[KING.x, 0, KING.z]}><Bob speed={1.2}><Figure colour={KING_COLOUR} hat="crown" /></Bob></group>
      {[...rails].map(([rail, pegs]) => <Rail key={rail} pegs={pegs} />)}
      {placed.map((p) => <group key={keyOf(p)}>{thing(p)}</group>)}
      <Rig bounds={bounds} />
    </Canvas>
  );
}
