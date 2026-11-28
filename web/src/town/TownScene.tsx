import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type Group } from "three";
import { Bob, Body, Mover, Pennant, Pick } from "./kit/actors.tsx";
import { Clay, TONES } from "./kit/clay.tsx";
import type { Avatar } from "./kit/avatars.ts";
import { Hat } from "./kit/hats.tsx";
import { PALETTE, type HatKind } from "./kit/palette.ts";
import { Desk, Figure, HouseModel, Parcel } from "./kit/parts.tsx";
import { CASTLE_HEIGHT, castleHill } from "./castle.ts";
import { CASTLE, CASTLE_TURN, HILL, castleAt } from "./hill.ts";
import { World } from "./World.tsx";
import { groundHeight } from "./island.ts";
import { DESK, KING, keyOf, poseOf, type Placed, type Spot } from "./layout.ts";
import { Parts } from "./parts.tsx";
import type { Door } from "./mark.ts";
import type { Bounds } from "./stage.tsx";
import type { TownIndex } from "./TownPage.tsx";

const QUEEN_COLOUR = PALETTE[4];
/** The ground the camera always takes in: the village round the square, the harbour and the castle on its hill. */
const VILLAGE = { minX: -6, maxX: 15, minZ: CASTLE.z - 3, maxZ: 11 };
/** The castle's stonework, built once. */
const STONEWORK = castleHill().parts;
/** Where something at (x, z) stands: the ground's height there. */
const on = ({ x, z }: Spot): [number, number, number] => [x, groundHeight(x, z), z];

/** The ground everything in `placed` needs, the village and the castle included, seen from high in front. */
export function boundsOf(placed: Placed[]): Bounds {
  let { minX, maxX, minZ, maxZ } = VILLAGE;
  for (const p of placed) {
    const [w, back, front] = p.kind === "building" ? [2.4, 2, 3.3] : [0.8, 0.8, 0.8];
    minX = Math.min(minX, p.at.x - w);
    maxX = Math.max(maxX, p.at.x + w);
    minZ = Math.min(minZ, p.at.z - back);
    maxZ = Math.max(maxZ, p.at.z + front);
  }
  // The tips of the castle's towers at the back, and a house's height at the front.
  const tops: Bounds["tops"] = [
    ...[-2.3, 2.3].map((u): [number, number, number] => {
      const [x, z] = castleAt(u, -1.4);
      return [x, HILL.top + CASTLE_HEIGHT, z];
    }),
    [minX, 2, maxZ], [maxX, 2, maxZ],
  ];
  return { minX, maxX, minZ, maxZ, tops, margin: [0.92, 0.84], rise: 1, key: [minX, maxX, minZ, maxZ].join() };
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
    <group position={[0, groundHeight((from + to) / 2, pegs[0].z), pegs[0].z]}>
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

/** Where a house's door is, from the house's spot on the ground: the door is on the front wall. */
const DOOR = { y: 0.3, z: 0.6 };

/** Gives `where` a function that reads each house's door on the screen with the camera as it is when called, or null while the town is not shown. */
function Doors({ placed, where }: { placed: Placed[]; where: MutableRefObject<(() => Door[]) | null> }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const latest = useRef(placed);
  latest.current = placed;
  useEffect(() => {
    where.current = () => {
      camera.updateMatrixWorld();
      return latest.current.flatMap((p) => {
        if (p.kind !== "building") return [];
        const [x, z] = [p.at.x, p.at.z + DOOR.z];
        const v = new Vector3(x, groundHeight(x, z) + DOOR.y, z).project(camera);
        return [{ cwd: p.cwd, x: (v.x * size.width) / 2, y: (-v.y * size.height) / 2 }];
      });
    };
    return () => {
      where.current = null;
    };
  }, [camera, size, where]);
  return null;
}

/** How high above its spot a thing's name plate floats. */
const plateHeight = (p: Placed) =>
  p.kind === "building" ? 2.3 : p.kind === "parcel" ? 0.9 : p.kind === "steward" ? 1.8 : p.pose === "work" && p.kind === "hat" ? 1.4 : p.pose === "queue" ? 2.2 : 1.8;

type Props = {
  /** The town's houses and characters, for the steward's stage and parcels' reviews. */
  index: TownIndex;
  /** The look of the king's chosen avatar preset. */
  look: Avatar;
  placed: Placed[];
  /** The folder of the marked house, whose name plate shows as a hover's does. */
  marked?: string | null;
  /** The words a thing's hover plate shows. */
  name: (p: Placed) => string;
  onPick: (p: Placed) => void;
  /** The scene's hover, which the canvas owns so the town and the classroom share one. */
  hover: string | null;
  onHover: (key: string | null) => void;
  /** Filled with a function that gives every house's door on the screen, in pixels from its middle, as the camera is now. */
  doors?: MutableRefObject<(() => Door[]) | null>;
};

/** The town: the island with the castle on its hill, the king (in the chosen avatar) at his desk on the forecourt, a building per house, and everyone placed by `layout`. */
export function TownScene({ index, look, placed, marked, name, onPick, hover, onHover, doors }: Props) {
  const pick = (p: Placed, children: ReactNode) => (
    <Pick id={keyOf(p)} height={plateHeight(p)} plate={keyOf(p) === hover || (p.kind === "building" && p.cwd === marked) ? name(p) : null} onPick={() => onPick(p)} onHover={onHover}>{children}</Pick>
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
          <group position={on(p.at)}>
            {pick(p, <HouseModel colour={p.colour} />)}
          </group>
        );
      case "parcel":
        return (
          <group position={on(p.at)} rotation-y={((p.number % 5) - 2) * 0.12}>
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
        return <Mover to={p.at} facing={0} ground={groundHeight}>{pick(p, <Body pose={queen ? poseOf(queen) : "work"} colour={QUEEN_COLOUR} hat="tiara" />)}</Mover>;
      }
      case "lead":
      case "hat": {
        // Queuers turn halfway to the desk, so their faces and slips still show; the stuck sit turned a little, so their legs read as sitting.
        const facing = p.pose === "queue" ? Math.atan2(DESK.x - p.at.x, DESK.z - p.at.z) / 2 : p.pose === "stuck" ? 0.8 : 0;
        return (
          <Mover to={p.at} facing={facing} ground={groundHeight}>
            {pick(p, p.kind === "hat" && p.pose === "work" ? <RackHat hat={p.hat} colour={p.colour} /> : <Body pose={p.pose} colour={p.colour} hat={p.kind === "hat" ? p.hat : "cap"} />)}
          </Mover>
        );
      }
    }
  };

  return (
    <>
      <World />
      <Parts parts={STONEWORK} />
      <group position={on(DESK)} rotation-y={CASTLE_TURN}>
        <Desk />
        <Clay colour={TONES.paper} position={[0.3, 0.64, 0]} rotation-y={0.2}><boxGeometry args={[0.32, 0.06, 0.24]} /></Clay>
      </group>
      <group position={on(KING)} rotation-y={CASTLE_TURN}><Bob speed={1.2}><Figure colour={look.coat} hat={look.hat} skin={look.skin} /></Bob></group>
      {doors && <Doors placed={placed} where={doors} />}
      {[...rails].map(([rail, pegs]) => <Rail key={rail} pegs={pegs} />)}
      {placed.map((p) => <group key={keyOf(p)}>{thing(p)}</group>)}
    </>
  );
}
