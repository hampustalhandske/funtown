// The card request: the brief the steward reads to give her word on a card, and the bounds of that word.
import { basename } from "node:path";
import { standing } from "./brief-parts.ts";
import type { Card, Lead, Level, Word } from "./types.ts";
import type { PhaseFile } from "./workflow.ts";

/** The most characters of a card's raw `tool_input` the brief carries. */
const INPUT_CHARS = 8_000;
/** How long a pasted word may go without a reply before it fails and the steward's next request may go. */
export const WORD_MS = 5 * 60_000;
/** The states a press queues a word from: not asked yet, and only a failed word again. */
export const ASKABLE: readonly Word["state"][] = ["idle", "failed"];
/** The labels a reply must hold, each followed by a colon, to count as the steward's word: the three parts `steward-card.md` asks for. */
export const WORD_LABELS = ["Pick", "Why", "Check first"];

const shown = (level: Level) => (level === "unstated" ? "not stated" : level);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** What each option of a question leads to, as the agent wrote it. */
function questionLines(card: Card): string[] {
  const asked = Array.isArray(card.input.questions) ? (card.input.questions as Record<string, unknown>[]) : [];
  return asked.flatMap((q, i) => {
    const options = Array.isArray(q?.options) ? (q.options as Record<string, unknown>[]) : [];
    const rating = card.questions?.[i];
    const pick = rating?.pick == null ? "none" : str(options[rating.pick]?.label);
    return [
      `Question ${i + 1}${q?.header ? ` [${str(q.header)}]` : ""}: ${str(q?.question)}`,
      ...options.map((o, j) => `  Option ${j + 1}: ${str(o?.label)}${o?.description ? `: ${str(o.description)}` : ""}`),
      `  The agent's pick: ${pick}`,
      `  How serious: ${shown(rating?.level ?? "unstated")}`,
    ];
  });
}

/** The ask in one line, with the options a plan or a permission always has. */
function fixedLines(card: Card): string[] {
  if (card.kind === "plan") {
    return ["Ask: approve this plan (the plan is in the raw input below)", "  Option 1: Approve: the agent leaves plan mode and starts on the plan", "  Option 2: Keep planning: the agent revises the plan", "  The agent's pick: Approve"];
  }
  const target = str(card.input.command) || str(card.input.file_path) || str(card.input.notebook_path) || str(card.input.url);
  return [`Ask: may it run ${card.tool}${target ? `: ${target}` : ""}`, "  Option 1: Allow: the tool runs as given", "  Option 2: Deny: the tool doesn't run and the agent is told so", "  The agent's pick: none"];
}

/**
 * The decision brief of `card` from lead `lead` listed in `house`, as plain text: who asks and
 * where, the ask, each option with where it leads, the agent's pick, the severity with its source
 * and reason, the goal facts of `phase`, and the raw `tool_input`, cut at INPUT_CHARS with a note.
 */
export function brief(card: Card, lead: Lead | undefined, house: string, phase: PhaseFile | undefined): string {
  const agent = card.agent === null ? undefined : lead?.subagents.find((a) => a.id === card.agent);
  const leadName = lead?.name ?? card.lead;
  const who = agent ? `${agent.name}${agent.role ? ` (${agent.role})` : ""}, a subagent of ${leadName}` : leadName;
  const lines = [`Who: ${who}, in the project ${basename(house)} (${card.cwd})`, `Kind: ${card.kind}`];
  lines.push(...(card.kind === "question" ? questionLines(card) : fixedLines(card)));
  const { level, source, reason } = card.severity;
  lines.push(`Severity: ${shown(level)}; source: ${source}; reason: ${reason}`);
  if (phase) {
    lines.push(`Phase: ${standing(phase)}`);
    if (phase.goal !== undefined) lines.push(`Goal: ${phase.goal}`);
    if (phase.spec !== undefined) lines.push(`Spec: ${phase.spec}`);
  }
  const raw = JSON.stringify(card.input, null, 2);
  lines.push(`Raw input of ${card.tool}:`, raw.length > INPUT_CHARS ? `${raw.slice(0, INPUT_CHARS)}\n(cut at ${INPUT_CHARS.toLocaleString("en-US")} of ${raw.length.toLocaleString("en-US")} characters)` : raw);
  return lines.join("\n");
}
