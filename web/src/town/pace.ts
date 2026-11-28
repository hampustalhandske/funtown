/** How long the pointer or a key keeps the town at full speed after its last move or press, in milliseconds. */
export const ACTIVE_MS = 600;

/** Frames a second the town draws; 0 draws none. */
export type Pace = 0 | 30 | 60;

/** What is going on, as of `now` (milliseconds): the window, the server, what moves, and the last pointer move and key press on the town. */
export type Activity = {
  now: number;
  /** The window is hidden (another tab, a minimised window). */
  hidden: boolean;
  /** The page has lost the server. */
  lost: boolean;
  /** Someone is walking. */
  walking: boolean;
  /** The camera is still easing toward where it fits the town. */
  easing: boolean;
  /** When the pointer last moved or pressed on the town, if ever. */
  pointerAt: number | null;
  /** The last key press and whether it went to a typing place (a text box, a terminal), if any. */
  key: { at: number; typing: boolean } | null;
};

/**
 * How many frames a second the town draws: none while the window is hidden or the page has lost the server, 60 while anything
 * walks, the camera eases, or the pointer or a key has just acted on the town, and 30 otherwise. A key typed in a typing
 * place is not the town's, so it counts for nothing.
 */
export function framePace(a: Activity): Pace {
  if (a.hidden || a.lost) return 0;
  const recent = (at: number | null) => at !== null && a.now - at < ACTIVE_MS;
  return a.walking || a.easing || recent(a.pointerAt) || (a.key !== null && !a.key.typing && recent(a.key.at)) ? 60 : 30;
}
