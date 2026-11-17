import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Html } from "@react-three/drei";
import type { Avatar } from "./kit/avatars.ts";
import type { HatKind } from "./kit/palette.ts";
import { Figure, Parcel } from "./kit/parts.tsx";
import { BOARD_HEIGHT, BOARD_SIZE, Door, Floor, SIDE_WALL_HEIGHT, SeatedFigure, StudentDesk, Table, TeacherDesk, Wall, WALL_HEIGHT, Whiteboard } from "./kit/classroom.tsx";
import { BOARD, DOOR, FRONT, LEAVE_MS, PARCEL_GAP, PARCELS_PER_ROW, TABLE, drawn, type Board, type Drawn, type InPlaced } from "./interior.ts";
import { keyOf, type Pose } from "./layout.ts";
import type { House } from "../../../server/types.ts";
import { Bob, Body, Dizzy, Mover, Pennant, Pick, Slip, WALK_SPEED, plates } from "./kit/actors.tsx";

/** What the classroom shows: the house's places, the whiteboard's text, the words for hover plates and what a click does. */
export type ClassroomProps = {
  house: House;
  placed: InPlaced[];
  board: Board;
  name: (p: InPlaced) => string;
  onPick: (p: InPlaced) => void;
};

/** The scene's hover, which `Village` owns so the town and the classroom share one, and the look the observer wears. */
type HoverProps = { look: Avatar; hover: string | null; onHover: (key: string | null) => void };

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
/** The board's card is laid out in CSS pixels at 400 / `BOARD_SCALE` to a world unit. */
const BOARD_SCALE = 2;
const PIXELS = 400 / BOARD_SCALE;
/** The card starts at this font size in px and shrinks until its text fits. */
const BASE_FONT = 60;
const MIN_FONT = 8;
/** More steps than this go in two columns. */
const ONE_COLUMN = 10;
/** How much taller than a student a lead stands. */
const LEAD_SCALE = 1.25;
/** A leaver walks fast enough to cover the longest walk to the door in this share of `LEAVE_MS`, the rest being slack for turning and slow frames. */
const LEAVE_SHARE = 0.75;

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

/** The card itself: the project, the phase and its note, then a line per step, its font shrunk until nothing is cut off. */
function Card({ board }: { board: Board }) {
  const { width, height } = BOARD_SIZE;
  const card = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(BASE_FONT);
  useLayoutEffect(() => {
    const el = card.current!;
    if ((el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth) && fontSize > MIN_FONT) setFontSize(fontSize * 0.92);
  }, [fontSize]);
  return (
    <div ref={card} className="board" style={{ width: width * PIXELS, height: height * PIXELS, fontSize }}>
      <h2>{board.project}</h2>
      <p>{board.phase}</p>
      {board.note !== null && <p>{board.note}</p>}
      {board.steps.length > 0 && (
        <ol style={board.steps.length > ONE_COLUMN ? { columns: 2, columnGap: "1.5em" } : undefined}>
          {board.steps.map((step, i) => (
            <li key={i} data-state={step.state} style={{ breakInside: "avoid" }}>
              <span style={{ display: "inline-block", width: "3em" }}>{step.state === "done" ? "\u2713" : step.state === "now" ? "\u25B6" : step.state}</span>
              {step.label}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** The whiteboard's words on a card over the board; nothing when there is no phase. */
function BoardText({ board }: { board: Board }) {
  if (board.phase === null) return null;
  return (
    <Html transform distanceFactor={BOARD_SCALE} portal={plates} pointerEvents="none" zIndexRange={[100, 1]} position={[BOARD.x, BOARD_HEIGHT, BOARD.z + 0.1]}>
      <Card key={JSON.stringify(board)} board={board} />
    </Html>
  );
}

/**
 * A house's classroom: leads at the front, subagents at desks, the whiteboard behind, the parcels on the table by the door and the observer at the back.
 * Whoever is there when the room first shows stands at their place; a lead or subagent that comes later walks in from the door,
 * and one that goes walks to the door, out of reach of the pointer, and is dropped `LEAVE_MS` after it went. Desks stay at their seats; only the figures walk.
 */
export function Classroom({ house, placed, board, name, onPick, look, hover, onHover }: ClassroomProps & HoverProps) {
  const room = useMemo(() => roomOf(placed), [placed]);
  const [width, depth] = [room.maxX - room.minX, room.maxZ - room.minZ];
  const leads = placed.filter((p) => p.kind === "lead").length;
  const parcels = placed.filter((p) => p.kind === "parcel").length;
  const rows = Math.max(1, Math.ceil(parcels / PARCELS_PER_ROW));
  const tableDepth = 0.8 + PARCEL_GAP * (rows - 1);

  const before = useRef<Drawn[]>([]);
  const shown = drawn(before.current, placed, Date.now());
  before.current = shown;
  const [tick, redraw] = useState(0);
  const firstLeft = Math.min(...shown.flatMap((p) => (p.leftAt === undefined ? [] : [p.leftAt])));
  useEffect(() => {
    if (firstLeft === Infinity) return;
    const timer = setTimeout(() => redraw((n) => n + 1), Math.max(0, firstLeft + LEAVE_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [firstLeft, tick]);
  // The farthest any lead or subagent has stood from the door in this room: a leaver's speed is set so it gets there in time.
  const reach = useRef(0);
  for (const p of placed) if (p.kind === "lead" || p.kind === "hat") reach.current = Math.max(reach.current, Math.hypot(p.at.x - DOOR.x, p.at.z - DOOR.z));
  const leaveSpeed = Math.max(WALK_SPEED, reach.current / ((LEAVE_MS / 1000) * LEAVE_SHARE));
  const mounted = useRef(false);
  const arriving = mounted.current;
  useEffect(() => {
    mounted.current = true;
  }, []);

  const pick = (p: Drawn, children: ReactNode) => (
    <Pick id={keyOf(p)} height={plateHeight(p)} plate={keyOf(p) === hover ? name(p) : null} disabled={p.leftAt !== undefined} onPick={() => onPick(p)} onHover={onHover}>{children}</Pick>
  );
  const speedOf = (p: Drawn) => (p.leftAt === undefined ? WALK_SPEED : leaveSpeed);
  const thing = (p: Drawn) => {
    switch (p.kind) {
      case "observer":
        return <group position={[p.at.x, 0, p.at.z]} rotation-y={Math.PI}><Bob speed={1.2}><Figure colour={look.coat} hat={look.hat} skin={look.skin} /></Bob></group>;
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
        return <Mover to={p.at} from={arriving ? DOOR : undefined} speed={speedOf(p)} facing={0}>{pick(p, <group scale={LEAD_SCALE}><Body pose={p.pose} colour={p.colour} hat="cap" /></group>)}</Mover>;
      case "hat":
        return (
          <Mover to={p.at} from={arriving ? DOOR : undefined} speed={speedOf(p)} facing={Math.PI}>
            {pick(p, <Pupil pose={p.pose} colour={p.colour} hat={p.hat} />)}
          </Mover>
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
      <group position={[TABLE.x, 0, TABLE.z - (PARCEL_GAP * (rows - 1)) / 2]}><Table width={TABLE_WIDTH} depth={tableDepth} /></group>
      {placed.map((p) => p.kind === "hat" && (
        <group key={`desk:${keyOf(p)}`} position={[p.at.x, 0, p.at.z]} rotation-y={Math.PI}>
          <Pick id={keyOf(p)} height={0} plate={null} onPick={() => onPick(p)} onHover={onHover}><StudentDesk /></Pick>
        </group>
      ))}
      {shown.map((p) => <group key={keyOf(p)}>{thing(p)}</group>)}
    </>
  );
}
