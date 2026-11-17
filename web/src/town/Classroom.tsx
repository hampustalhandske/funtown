import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Html } from "@react-three/drei";
import { TONES } from "./kit/clay.tsx";
import type { HatKind } from "./kit/palette.ts";
import { Figure, Parcel } from "./kit/parts.tsx";
import { BOARD_HEIGHT, BOARD_SIZE, Door, Floor, SIDE_WALL_HEIGHT, SeatedFigure, StudentDesk, Table, TeacherDesk, Wall, WALL_HEIGHT, Whiteboard } from "./kit/classroom.tsx";
import { BOARD, FRONT, TABLE, type Board, type InPlaced } from "./interior.ts";
import type { Pose } from "./layout.ts";
import type { House } from "../../../server/types.ts";
import { Bob, Body, Dizzy, Mover, Pennant, Pick, Slip, plates } from "./Village.tsx";

/** What the classroom shows: the house's places, the whiteboard's text, the words for hover plates and what a click does. */
export type ClassroomProps = {
  house: House;
  placed: InPlaced[];
  board: Board;
  name: (p: InPlaced) => string;
  onPick: (p: InPlaced) => void;
};

/** The floor's extent: symmetric about the aisle, wide and deep enough for everything in `placed`, with a margin. */
export function roomOf(placed: InPlaced[]) {
  let [half, maxZ] = [5.2, 0];
  for (const p of placed) {
    half = Math.max(half, Math.abs(p.at.x) + 0.8);
    maxZ = Math.max(maxZ, p.at.z + 1);
  }
  return { minX: -half, maxX: half, minZ: BOARD.z - 0.05, maxZ };
}

const TABLE_WIDTH = 1.8;
const PARCELS_PER_ROW = 3;
const PARCEL_ROW = 0.5;
/** The board's card is laid out in CSS pixels at 400 / `BOARD_SCALE` to a world unit. */
const BOARD_SCALE = 2;
const PIXELS = 400 / BOARD_SCALE;
/** The steps and the phase lines fit the card's height at `BASE_FONT` px up to this many lines; a longer list shrinks to fit. */
const BOARD_LINES = 10;
const BASE_FONT = 60;
/** How much taller than a student a lead stands. */
const LEAD_SCALE = 1.25;

const keyOf = (p: InPlaced): string =>
  p.kind === "parcel" ? `parcel:${p.cwd}#${p.number}` : p.kind === "observer" ? "observer" : `character:${p.id}`;

const plateHeight = (p: InPlaced) =>
  p.kind === "parcel" ? 0.9 : p.kind === "hat" ? (p.pose === "queue" ? 2.2 : 1.7) : p.kind === "lead" ? (p.pose === "queue" ? 2.7 : 2.3) : 1.8;

/** A subagent at its desk: nodding when working, with its slip up when it needs you, askew with stars when stuck. */
function Pupil({ pose, colour, hat }: { pose: Pose; colour: string; hat: HatKind }) {
  if (pose === "stuck") {
    return <group rotation={[0, 0, 0.3]}><SeatedFigure colour={colour} hat={hat}><Dizzy /></SeatedFigure></group>;
  }
  return (
    <Bob speed={pose === "queue" ? 3 : 2} height={0.015}>
      <SeatedFigure colour={colour} hat={hat}>{pose === "queue" && <Slip />}</SeatedFigure>
    </Bob>
  );
}

/** The whiteboard's words on a card over the board, in one column: the project, the phase and its note, then a line per step; nothing when there is no phase. */
function BoardText({ board }: { board: Board }) {
  if (board.phase === null) return null;
  const { width, height } = BOARD_SIZE;
  const fontSize = BASE_FONT * Math.max(0.35, Math.min(1, BOARD_LINES / (board.steps.length + 4)));
  return (
    <Html transform distanceFactor={BOARD_SCALE} portal={plates} pointerEvents="none" zIndexRange={[100, 1]} position={[BOARD.x, BOARD_HEIGHT, BOARD.z + 0.1]}>
      <div className="board" style={{ width: width * PIXELS, height: height * PIXELS, fontSize }}>
        <h2>{board.project}</h2>
        <p>{board.phase}</p>
        {board.note !== null && <p>{board.note}</p>}
        {board.steps.length > 0 && (
          <ol>
            {board.steps.map((step, i) => (
              <li key={i} data-state={step.state}>
                <span style={{ display: "inline-block", width: "3em" }}>{step.state === "done" ? "\u2713" : step.state === "now" ? "\u25B6" : step.state}</span>
                {step.label}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Html>
  );
}

/** A house's classroom: leads at the front, subagents at desks, the whiteboard behind, the parcels on the table by the door and the observer at the back. */
export function Classroom({ house, placed, board, name, onPick }: ClassroomProps) {
  const [hover, setHover] = useState<string | null>(null);
  const hovered = placed.some((p) => p.kind !== "observer" && keyOf(p) === hover);
  useEffect(() => {
    // A hovered thing that leaves the room takes its hover with it, so its plate can't come back on its own.
    if (hover !== null && !hovered) setHover(null);
    document.body.style.cursor = hovered ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hover, hovered]);
  const room = useMemo(() => roomOf(placed), [placed]);
  const [width, depth] = [room.maxX - room.minX, room.maxZ - room.minZ];
  const leads = placed.filter((p) => p.kind === "lead").length;
  const parcels = placed.filter((p) => p.kind === "parcel").length;
  const rows = Math.max(1, Math.ceil(parcels / PARCELS_PER_ROW));
  const tableDepth = 0.8 + PARCEL_ROW * (rows - 1);

  const pick = (p: InPlaced, children: ReactNode) => (
    <Pick id={keyOf(p)} height={plateHeight(p)} plate={keyOf(p) === hover ? name(p) : null} onPick={() => onPick(p)} onHover={setHover}>{children}</Pick>
  );
  const thing = (p: InPlaced) => {
    switch (p.kind) {
      case "observer":
        return <group position={[p.at.x, 0, p.at.z]} rotation-y={Math.PI}><Bob speed={1.2}><Figure colour={TONES.ribbon} hat="crown" /></Bob></group>;
      case "parcel":
        return (
          <group position={[p.at.x, 0.6, p.at.z]} rotation-y={((p.number % 5) - 2) * 0.12}>
            {pick(
              p,
              <>
                <Parcel />
                {house.parcels?.find((x) => x.number === p.number)?.review?.state === "ready" && <Pennant />}
              </>,
            )}
          </group>
        );
      case "lead":
        return <Mover to={p.at} facing={0}>{pick(p, <group scale={LEAD_SCALE}><Body pose={p.pose} colour={p.colour} hat="cap" /></group>)}</Mover>;
      case "hat":
        return (
          <group position={[p.at.x, 0, p.at.z]} rotation-y={Math.PI}>
            {pick(p, <><StudentDesk /><Pupil pose={p.pose} colour={p.colour} hat={p.hat} /></>)}
          </group>
        );
    }
  };

  return (
    <>
      <group position={[(room.minX + room.maxX) / 2, 0, (room.minZ + room.maxZ) / 2]}><Floor width={width} depth={depth} /></group>
      <group position={[(room.minX + room.maxX) / 2, 0, room.minZ - 0.15]}><Wall length={width + 0.6} height={WALL_HEIGHT} /></group>
      {[room.minX - 0.15, room.maxX + 0.15].map((x) => (
        <group key={x} position={[x, 0, (room.minZ + room.maxZ) / 2]} rotation-y={Math.PI / 2}><Wall length={depth} height={SIDE_WALL_HEIGHT} /></group>
      ))}
      <group position={[room.maxX - 0.03, 0, TABLE.z]}><Door /></group>
      <group position={[BOARD.x, BOARD_HEIGHT, BOARD.z]}><Whiteboard /></group>
      <BoardText board={board} />
      <group position={[FRONT.x, 0, FRONT.z - 0.9]}><TeacherDesk width={Math.max(2.4, leads * 1.5 + 0.8)} /></group>
      <group position={[TABLE.x, 0, TABLE.z - (PARCEL_ROW * (rows - 1)) / 2]}><Table width={TABLE_WIDTH} depth={tableDepth} /></group>
      {placed.map((p) => <group key={keyOf(p)}>{thing(p)}</group>)}
    </>
  );
}
