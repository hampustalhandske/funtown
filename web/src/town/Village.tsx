import { useMemo, type MutableRefObject } from "react";
import { Canvas } from "@react-three/fiber";
import { Classroom, roomBounds, type ClassroomProps } from "./Classroom.tsx";
import { useHover } from "./kit/actors.tsx";
import { avatarFor } from "./kit/avatars.ts";
import { keyOf, type Placed } from "./layout.ts";
import type { Door } from "./mark.ts";
import { FOV, GROUND, Rig, Sun } from "./stage.tsx";
import { TownScene, boundsOf } from "./TownScene.tsx";
import type { TownIndex } from "./TownPage.tsx";

type Props = {
  /** The town's houses and characters, for the steward's stage and parcels' reviews. */
  index: TownIndex;
  /** The id of the king's chosen preset (`Town.avatar`); absent or unknown shows the default. */
  avatar?: string;
  placed: Placed[];
  /** The folder of the marked house, whose name plate shows as a hover's does. */
  marked?: string | null;
  /** The words a thing's hover plate shows. */
  name: (p: Placed) => string;
  onPick: (p: Placed) => void;
  /** When set, the canvas shows this house's classroom in place of the town. */
  inside?: ClassroomProps;
  /** Filled while the town shows with a function that gives every house's door on the screen, in pixels from its middle, as the camera is now. */
  doors?: MutableRefObject<(() => Door[]) | null>;
};

/** The canvas and its camera, with the town on its island or, when `inside` is set, a house's classroom in its own light on its own floor. */
export function Village({ index, avatar, placed, marked, name, onPick, inside, doors }: Props) {
  const look = avatarFor(avatar);
  const bounds = useMemo(() => (inside ? roomBounds(inside.placed) : boundsOf(placed)), [inside?.placed, placed]);
  const [hover, setHover] = useHover(inside ? inside.placed.filter((p) => p.kind !== "observer").map(keyOf) : placed.map(keyOf));
  return (
    <Canvas shadows="percentage" camera={{ fov: FOV, position: [0, 30, 30] }} onPointerMissed={() => setHover(null)}>
      {inside ? (
        <>
          <color attach="background" args={[GROUND]} />
          <hemisphereLight args={["#fff8ec", "#b9a98f", 1.6]} />
          <Sun bounds={bounds} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.26, 0]} receiveShadow>
            <planeGeometry args={[400, 400]} />
            <meshLambertMaterial color={GROUND} />
          </mesh>
          <Classroom key={inside.house.cwd} {...inside} look={look} hover={hover} onHover={setHover} />
        </>
      ) : (
        <TownScene index={index} look={look} placed={placed} marked={marked} name={name} onPick={onPick} hover={hover} onHover={setHover} doors={doors} />
      )}
      <Rig bounds={bounds} />
    </Canvas>
  );
}
