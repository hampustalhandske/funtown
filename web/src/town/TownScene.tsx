import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from "react";
import { useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { actOf } from "./acts.ts";
import { Animal, FolkLayer, seedOf } from "./Folk.tsx";
import type { Drawn } from "./folk.ts";
import { Pennant, Pick } from "./kit/actors.tsx";
import { avatarFor } from "./kit/avatars.ts";
import { Parcel } from "./kit/parts.tsx";
import { CASTLE_HEIGHT, castleHill } from "./castle.ts";
import { CASTLE, CASTLE_TURN, HILL, castleAt } from "./hill.ts";
import { SEAT_TOP, QUEEN_SEAT, YOUR_THRONE } from "./court.ts";
import { courtFurniture } from "./furniture.ts";
import { Queen, You } from "./People.tsx";
import { Glows, useLight } from "./Glow.tsx";
import { World } from "./World.tsx";
import { houseParts } from "./houseParts.ts";
import { chimneyOf, doorOf, planOf } from "./houses.ts";
import { groundHeight } from "./island.ts";
import { keyOf, type Placed, type Spot } from "./layout.ts";
import { HandFlag } from "./Flag.tsx";
import { houseFlagParts, tableSlipParts } from "./flag.ts";
import { PartList, Parts } from "./parts.tsx";
import { Boats, MarkRing, Puffs } from "./VillageFx.tsx";
import { Fires, Stars, Water, type Blaze, type Throw } from "./Fire.tsx";
import { bucketOf, roofOf, splashOf } from "./fire.ts";
import { doorPaths, treeParts, treesFor, village } from "./village.ts";
import { drawnFlag, gaitOf, type Walks } from "./walk.ts";
import { Walker } from "./Walker.tsx";
import type { Door } from "./mark.ts";
import type { Bounds } from "./stage.tsx";
import type { TownIndex } from "./TownPage.tsx";

/** The ground the camera always takes in: the village round the square, the harbour and the castle on its hill. */
const VILLAGE = { minX: -6, maxX: 15, minZ: CASTLE.z - 3, maxZ: 11 };
/** The village's boats and the parts of it that stay put, built once: the quay, the square and the lanes, the castle's stonework and the forecourt's furniture. */
const HARBOUR = village();
const STONEWORK = [...castleHill().parts, ...courtFurniture().parts, ...HARBOUR.parts.parts];
/** Where a house's name plate floats: beside its roof, to the right on the screen, never above it. */
const PLATE_BESIDE: [number, number, number] = [2.9, 1.7, 0];
/** Where a person sitting on a throne at (x, z) has their hips: on the dais, at the top of the cushion. */
const seated = ({ x, z }: Spot): [number, number, number] => [x, HILL.top + SEAT_TOP, z];
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

/** How high above the ground a house's door is read on the screen. */
const DOOR_HEIGHT = 0.3;

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
        const { x, z } = doorOf(p);
        const v = new Vector3(x, groundHeight(x, z) + DOOR_HEIGHT, z).project(camera);
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
  p.kind === "building" ? 2.3 : p.kind === "parcel" ? 0.9 : p.kind === "queen" || p.kind === "you" ? 2.7 : p.pose === "wait" ? 2.4 : 2.1;

type Props = {
  /** The town's houses and characters, for the steward's stage and parcels' reviews. */
  index: TownIndex;
  placed: Placed[];
  /** `placed` with the characters that just left still walking off (`useDeparted`), and the walks going (`useWalks`), both worked out by the page, which the hidden list reads too. */
  drawn: Drawn[];
  walks: Walks;
  /** The words a thing's hover plate shows. */
  name: (p: Placed) => string;
  onPick: (p: Placed) => void;
  /** The scene's hover, which the canvas owns so the town and the classroom share one. */
  hover: string | null;
  onHover: (key: string | null) => void;
  /** Filled with a function that gives every house's door on the screen, in pixels from its middle, as the camera is now. */
  doors?: MutableRefObject<(() => Door[]) | null>;
};

/**
 * The town: the island with the castle on its hill, the harbour village, the forecourt's table and thrones with you and the Queen
 * on them, a toy-harbour house per building with its chimney puffing while it is busy, and everyone placed by `layout`.
 * A marked house wears a white ring and shows its name plate, as a hovered thing does.
 */
export function TownScene({ index, placed, drawn: shown, walks, name, onPick, hover, onHover, doors }: Props) {
  const light = useLight();
  const pick = (p: Placed, children: ReactNode, disabled = false) => (
    <Pick
      id={keyOf(p)}
      height={plateHeight(p)}
      offset={p.kind === "building" ? PLATE_BESIDE : undefined}
      plate={keyOf(p) === hover || (p.kind === "building" && p.marked) ? name(p) : null}
      disabled={disabled}
      onPick={() => onPick(p)}
      onHover={onHover}>
      {children}
    </Pick>
  );

  // The houses' parts and the trees stay as they are until a house comes, goes, turns or changes colour; busy and marked change often and are drawn apart.
  const buildings = placed.filter((p): p is Extract<Placed, { kind: "building" }> => p.kind === "building");
  const shape = buildings.map((b) => `${b.cwd}|${b.colour}|${b.at.x}|${b.at.z}|${b.facing}|${b.variant}`).join("\n");
  const parts = useMemo(() => {
    const list = new PartList();
    const doorsOf = buildings.map(doorOf);
    for (const b of buildings) houseParts(list, b);
    doorPaths(list, doorsOf, HARBOUR.lane);
    treeParts(list, treesFor(buildings.map((b) => b.at), doorsOf));
    return [...STONEWORK, ...list.parts];
    // `shape` is everything the parts are made from.
  }, [shape]);

  // The line's still things, which change only when the line does: each flagged house's flag and the head's slip on the table.
  // The head's slip lies on the table only once it has got there; on its way it still carries it.
  const head = placed.find((p): p is Extract<Placed, { kind: "lead" | "hat" }> => (p.kind === "lead" || p.kind === "hat") && p.line?.place === 0 && gaitOf(walks, keyOf(p), Date.now()) === undefined);
  const note = placed.find((p): p is Extract<Placed, { kind: "queen" }> => p.kind === "queen")?.note ?? null;
  const flagged = buildings.filter((b) => b.flag);
  const lineKey = [...flagged.map((b) => `${b.at.x}|${b.at.z}|${b.facing}|${b.variant}`), head ? `${head.colour}|${note === head.id}` : ""].join("\n");
  const lineParts = useMemo(() => {
    const list = new PartList();
    for (const b of flagged) houseFlagParts(list, b);
    if (head) tableSlipParts(list, head.colour, note === head.id);
    return list.parts;
    // `lineKey` is everything the parts are made from.
  }, [lineKey]);

  // Fire on each burning house's roof, the water its lead throws at it, and the stars over a loud stuck character's head.
  const blazes: Blaze[] = buildings.flatMap((b) => (b.fire === "none" ? [] : [{ key: b.cwd, form: b.fire, at: roofOf(b), facing: b.facing }]));
  const throws: Throw[] = placed.flatMap((p) => {
    const house = p.kind === "lead" && p.pose === "bucket" ? buildings.find((b) => b.cwd === p.cwd) : undefined;
    return p.kind === "lead" && house ? [{ key: keyOf(p), from: bucketOf(p), to: splashOf(house) }] : [];
  });
  const stars = placed.flatMap((p) => (p.kind === "lead" || p.kind === "hat") && p.stars ? [{ key: keyOf(p), x: p.at.x, y: groundHeight(p.at.x, p.at.z), z: p.at.z }] : []);

  const thing = (p: Drawn) => {
    switch (p.kind) {
      case "building": {
        // The house itself is instanced parts, which take no clicks; an unseen box round it takes them.
        const { top, rh, w, d } = planOf(p.variant);
        return (
          <group position={on(p.at)}>
            {pick(
              p,
              <mesh visible={false} position={[0, (top + rh) / 2 - 0.3, 0]} rotation-y={p.facing}>
                <boxGeometry args={[w + 1, top + rh + 0.6, d + 1.3]} />
              </mesh>,
            )}
          </group>
        );
      }
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
      case "you":
        return <group position={seated(p.at)} rotation-y={CASTLE_TURN + YOUR_THRONE.yaw}><You look={avatarFor(p.avatar)} /></group>;
      case "queen":
        return (
          <group position={seated(p.at)} rotation-y={CASTLE_TURN + QUEEN_SEAT.yaw}>
            {p.id === null ? <Queen state={p.state} /> : pick(p, <Queen state={p.state} />)}
          </group>
        );
      case "lead":
      case "hat": {
        // A leaver walks its lane in the time it is drawn, out of the pointer's reach. One in the line holds its flag and slip;
        // a climber holds them still, and one going home furls its flag.
        const leaving = p.leftAt !== undefined;
        const gait = gaitOf(walks, keyOf(p), Date.now());
        const mode = drawnFlag(p, gait);
        const held = mode === null ? undefined : <HandFlag mode={mode} />;
        return (
          <Walker at={p.at} facing={p.facing} walk={walks.get(keyOf(p))}>
            {pick(p, <Animal costume={p} colour={p.colour} act={actOf(p, gait)} seed={seedOf(p.id)} note={note === p.id} held={held} />, leaving)}
          </Walker>
        );
      }
    }
  };

  return (
    <>
      <World light={light} />
      <Parts parts={parts} />
      <Parts parts={lineParts} />
      <Glows parts={parts} lamps={light.lamps} />
      <Boats boats={HARBOUR.boats} />
      <Puffs mouths={buildings.filter((b) => b.busy).map(chimneyOf)} />
      <Fires blazes={blazes} />
      <Water throws={throws} />
      <Stars heads={stars} />
      {buildings.filter((b) => b.marked).map((b) => <MarkRing key={b.cwd} at={b.at} />)}
      {doors && <Doors placed={placed} where={doors} />}
      <FolkLayer>{shown.map((p) => <group key={keyOf(p)}>{thing(p)}</group>)}</FolkLayer>
    </>
  );
}
