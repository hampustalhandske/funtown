import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { Drawn } from "./folk.ts";
import { groundHeight } from "./island.ts";
import { motion } from "./Pace.tsx";
import type { Spot } from "./layout.ts";
import { stepOf, walkEnd, walksAfter, type Walk, type Walks } from "./walk.ts";

/** The shortest signed turn from angle `from` to `to`. */
const turn = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/**
 * The walks going now, kept as the drawn things change: each render works out what `drawn` changed from the last one
 * (`walksAfter`), and the page draws again when the first walk ends, so what shows a walk (its flag, its words) follows it.
 */
export function useWalks(drawn: Drawn[]): Walks {
  const last = useRef<{ drawn: Drawn[]; walks: Walks }>({ drawn: [], walks: new Map() });
  if (last.current.drawn !== drawn) last.current = { drawn, walks: walksAfter(last.current.walks, last.current.drawn, drawn, Date.now()) };
  const { walks } = last.current;
  const [, redraw] = useState(0);
  const end = Math.min(...[...walks.values()].map(walkEnd));
  useEffect(() => {
    if (end === Infinity) return;
    const timer = setTimeout(() => redraw((n) => n + 1), Math.max(0, end - Date.now()) + 1);
    return () => clearTimeout(timer);
  }, [end]);
  return walks;
}

type WalkerProps = { at: Spot; facing: number; walk: Walk | undefined; children: ReactNode };

/**
 * Stands its children at `at`, facing `facing`, on the ground there; while `walk` goes it puts them along its route by the clock,
 * facing the way they go, and tells the frame pace someone walks (`motion.walking`). It sits wherever its walk is at the first
 * frame, so a folk drawn mid-walk is not moved.
 */
export function Walker({ at, facing, walk, children }: WalkerProps) {
  const ref = useRef<Group>(null);
  const latest = useRef(walk);
  latest.current = walk;
  const [start] = useState(() => {
    const now = walk !== undefined && Date.now() < walkEnd(walk) ? stepOf(walk, Date.now()) : { ...at, y: groundHeight(at.x, at.z), yaw: facing };
    return now;
  });
  useFrame((_, delta) => {
    const g = ref.current!;
    const dt = Math.min(delta, 0.1);
    const now = Date.now();
    const w = latest.current;
    if (w !== undefined && now < walkEnd(w)) {
      const s = stepOf(w, now);
      motion.walking = true;
      g.position.set(s.x, s.y, s.z);
      g.rotation.y += turn(g.rotation.y, s.yaw) * Math.min(1, dt * 8);
    } else {
      g.position.set(at.x, groundHeight(at.x, at.z), at.z);
      g.rotation.y += turn(g.rotation.y, facing) * Math.min(1, dt * 8);
    }
  });
  return <group ref={ref} position={[start.x, start.y, start.z]} rotation-y={start.yaw}>{children}</group>;
}
