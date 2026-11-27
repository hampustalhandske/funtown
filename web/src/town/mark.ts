/** An arrow key. */
export type Direction = "left" | "right" | "up" | "down";

/** A house's door on the screen: `x` right and `y` down, in pixels from the screen's middle. */
export type Door = { cwd: string; x: number; y: number };

/**
 * Where the mark last landed: on `to`. `from` and `direction` say which house and arrow it came by; both are
 * absent when the mark was put there (Space, M) rather than walked.
 */
export type Move = { to: string; from?: string; direction?: Direction };

const STEP: Record<Direction, { x: number; y: number }> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };
const OPPOSITE: Record<Direction, Direction> = { left: "right", right: "left", up: "down", down: "up" };

/** The folder name of `cwd`, the last tie-break but one. */
const folder = (cwd: string) => cwd.slice(cwd.lastIndexOf("/") + 1);

/** Orders two doors by folder name, then by whole path, so a tie never depends on the order of the list. */
const byName = (a: Door, b: Door) => (folder(a.cwd) < folder(b.cwd) ? -1 : folder(a.cwd) > folder(b.cwd) ? 1 : a.cwd < b.cwd ? -1 : a.cwd > b.cwd ? 1 : 0);

/**
 * The house the mark goes to when `direction` is pressed with it on `from`, over each house's door on the screen as the
 * camera is now (so "left" is left on screen). `from` is null, or not among `points`, when nothing is marked.
 * - Nothing marked: the last marked house if it is still there, else the one nearest the screen's middle; the arrow does not matter.
 * - Back the way you came: the opposite arrow right after `lastMove` walked from a house to this one goes back to it, while it is there.
 * - Otherwise a house is a candidate when it is ahead (`forward > 0`) and no further across than twice that; the winner has the
 *   smallest `forward + 2 x sideways`, then the shorter straight line, then the folder name.
 * - No candidate: the mark stays. Null only when there is no house at all.
 */
export function nextHouse(points: Door[], from: string | null, direction: Direction, lastMove: Move | null): string | null {
  const here = points.find((p) => p.cwd === from);
  if (!here) {
    const last = points.find((p) => p.cwd === lastMove?.to);
    return (last ?? [...points].sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y) || byName(a, b))[0])?.cwd ?? null;
  }
  if (lastMove?.to === here.cwd && lastMove.from !== undefined && lastMove.direction === OPPOSITE[direction] && points.some((p) => p.cwd === lastMove.from)) {
    return lastMove.from;
  }
  const step = STEP[direction];
  const candidates = points
    .filter((p) => p !== here)
    .map((p) => {
      const [dx, dy] = [p.x - here.x, p.y - here.y];
      const forward = dx * step.x + dy * step.y;
      const sideways = Math.abs(dx * step.y - dy * step.x);
      return { p, forward, sideways, score: forward + 2 * sideways, distance: Math.hypot(dx, dy) };
    })
    .filter((c) => c.forward > 0 && c.sideways <= 2 * c.forward)
    .sort((a, b) => a.score - b.score || a.distance - b.distance || byName(a.p, b.p));
  return (candidates[0]?.p ?? here).cwd;
}
