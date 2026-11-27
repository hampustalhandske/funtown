/**
 * The parts of a decision brief the server and the page both read: the mark of the agent's pick, a plan's own top
 * lines and where a project stands in its steps. No Node imports, so the page bundles it too.
 */

/** The end of the label of the option the agent recommends. */
export const RECOMMENDED = " (Recommended)";

/** How many of a plan's first lines are read for its top lines. */
const PLAN_LINES = 10;
/** A plan's top line: Goal, What changes or How serious after any Markdown marks, then a colon and what it says. */
const TOP_LINE = /^[\s#>*_-]*(goal|what changes|how serious)[*_\s]*:[*_\s]*(.*)$/i;

/** A plan's own top lines (Goal, What changes, How serious) among its first lines: each as written, its label in lower case and what it says. */
export function planTop(plan: string): { line: string; label: string; said: string }[] {
  return plan.split("\n", PLAN_LINES).flatMap((line) => {
    const top = TOP_LINE.exec(line);
    return top ? [{ line, label: top[1].toLowerCase(), said: top[2] }] : [];
  });
}

/** Where a project stands: its phase, with "step n of m" when the phase is one of its steps. */
export function standing({ phase, steps }: { phase: string; steps?: string[] }): string {
  const at = steps?.indexOf(phase) ?? -1;
  return at < 0 ? phase : `${phase}, step ${at + 1} of ${steps!.length}`;
}
