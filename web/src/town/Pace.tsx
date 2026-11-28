import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { typingPlace } from "../keys.ts";
import { framePace } from "./pace.ts";

/**
 * What moved in the frame just drawn, which the next frame's pace reads. A part that moves sets its flag while it moves; the
 * frame loop clears both before each frame it draws. This is the one place the town learns that someone walks or the camera eases.
 */
export const motion = { walking: false, easing: false };

/** How far a tick may fall short of a frame's interval and still draw: a 60 Hz screen's ticks land 16.7 ms apart, give or take. */
const SLACK_MS = 4;

/**
 * Draws the town's frames at the pace `framePace` gives, in place of the canvas's own loop (which must be `frameloop="never"`):
 * 60 or 30 a second, none while the window is hidden or `lost` (the page has lost the server), and one frame when the canvas is
 * resized, which would otherwise be left blank. The pointer over the canvas and the keys outside typing places count as
 * using the town.
 */
export function Pace({ lost }: { lost: boolean }) {
  const advance = useThree((s) => s.advance);
  const canvas = useThree((s) => s.gl.domElement);
  const size = useThree((s) => s.size);
  const lostNow = useRef(lost);
  lostNow.current = lost;

  useEffect(() => {
    let pointerAt: number | null = null;
    let key: { at: number; typing: boolean } | null = null;
    const onPointer = () => (pointerAt = performance.now());
    const onKey = (event: KeyboardEvent) => (key = { at: performance.now(), typing: typingPlace(event.target) });
    const pointer = ["pointermove", "pointerdown", "pointerup", "wheel"] as const;
    for (const name of pointer) canvas.addEventListener(name, onPointer, { passive: true });
    window.addEventListener("keydown", onKey, true);

    let last = -Infinity;
    let tick = 0;
    const loop = () => {
      tick = requestAnimationFrame(loop);
      const now = performance.now();
      const pace = framePace({ now, hidden: document.visibilityState === "hidden", lost: lostNow.current, ...motion, pointerAt, key });
      if (pace === 0 || now - last < 1000 / pace - SLACK_MS) return;
      last = now;
      motion.walking = motion.easing = false;
      advance(now / 1000);
    };
    tick = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(tick);
      for (const name of pointer) canvas.removeEventListener(name, onPointer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [advance, canvas]);

  // A resize clears the canvas: draw it once more, hidden or lost or not.
  useEffect(() => {
    const frame = requestAnimationFrame(() => advance(performance.now() / 1000));
    return () => cancelAnimationFrame(frame);
  }, [advance, size]);

  return null;
}
