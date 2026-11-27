import type { Card, House, Level } from "../../server/types.ts";

/**
 * Each severity level's word, its weight (marks filled of three) and its colour: the one place the card reads them,
 * so a level never shows by colour alone.
 */
export const SEVERITY: Record<Level, { word: string; marks: number; colour: string }> = {
  low: { word: "Low", marks: 1, colour: "#5f7f5a" },
  medium: { word: "Medium", marks: 2, colour: "#a8761b" },
  high: { word: "High", marks: 3, colour: "#9c3434" },
  unstated: { word: "Not stated", marks: 0, colour: "#7c7580" },
};

/** A heavy card (high or not stated) opens its stakes, shows every consequence uncut and names its act. */
export const isHeavy = (level: Level) => level === "high" || level === "unstated";

/** The first line of a heavy card's stakes box: why it is heavy. */
export function stakesOf({ level, reason, source }: Card["severity"]): string {
  if (level === "unstated") return "The agent didn't say how serious this is. Read it as a high one.";
  return source === "agent" ? "The agent marked this high." : `High: ${reason.replace(/^Funtown's rule: /, "")}.`;
}

/** A question's topic: its header without the leading level word the severity was read from. */
export const topicOf = (header: unknown) => (typeof header === "string" ? header.replace(/^(low|medium|high)(:\s*|\s+|$)/, "") : "");

const RECOMMENDED = " (Recommended)";
/** An option's label as the card shows it: without " (Recommended)", which the "Agent's pick" ribbon says. */
export const shownLabel = (label: string) => (label.endsWith(RECOMMENDED) ? label.slice(0, -RECOMMENDED.length) : label);

/** Where the project stands, from its phase file: the goal, "<phase>, step n of m" and the spec; null without a phase file. */
export function goalOf(phase: House["phase"]): { goal?: string; where: string; spec?: string } | null {
  if (!phase) return null;
  const at = phase.steps?.indexOf(phase.phase) ?? -1;
  const where = at < 0 ? phase.phase : `${phase.phase}, step ${at + 1} of ${phase.steps!.length}`;
  return { goal: phase.goal, where, spec: phase.spec };
}

/** The input fields a permission names its subject by, in the order tried. */
const SUBJECTS = ["file_path", "notebook_path", "path", "url", "pattern"];

/**
 * The ask in one line: a question's text (or how many questions), "Approve the plan", or a permission's own
 * description, else "<Tool> <path>" with the path inside the card's folder made relative to it.
 */
export function askOf(card: Card, questions: { question: string }[]): string {
  if (card.kind === "plan") return "Approve the plan";
  if (card.kind === "question") return questions.length === 1 ? questions[0].question : `${questions.length} questions`;
  const { description } = card.input;
  if (typeof description === "string" && description.trim()) return description;
  const subject = SUBJECTS.map((key) => card.input[key]).find((v): v is string => typeof v === "string");
  if (subject === undefined) return card.tool === "Bash" ? "Run a Bash command" : `Use ${card.tool}`;
  return `${card.tool} ${subject.startsWith(`${card.cwd}/`) ? subject.slice(card.cwd.length + 1) : subject}`;
}

/** A plan's own top lines (Goal, What changes, How serious) among its first lines, as written. */
export function planTop(plan: string): string[] {
  return plan.split("\n", 10).filter((line) => /^[\s#>*_-]*(goal|what changes|how serious)[*_\s]*:/i.test(line));
}
