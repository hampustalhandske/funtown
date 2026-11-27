import type { Locator, Page } from "@playwright/test";

// Made-up asks from a project named ledgerline, for the card specs: the brief on a card, and the keys on it.
export const NOW = Date.now();
export const MIN = 60_000;
export const claude = { version: "2.1.325", problems: [] };

export const PHASE = {
  phase: "implement", steps: ["spec", "tickets", "implement", "review", "merge", "ship"],
  goal: "Invoices export from one button", spec: "docs/specs/csv-export.md",
};
export const asker = (over: Record<string, unknown> = {}) => ({
  id: "s1", name: "csv-export", stage: "needs_you", activity: null, step: "Edit: src/invoices/export.ts", needs: "question", since: NOW - 4 * MIN,
  tty: null, termProgram: null, kind: "terminal", shortId: null, subagents: [], ...over,
});
export const ledger = (leads: unknown[], cards: unknown[], phase: unknown = PHASE) => ({
  claude, cards, houses: [{ project: "ledgerline", cwd: "/work/ledgerline", leads, ...(phase ? { phase } : {}) }],
});
export type Q = { question: string; header: string; multiSelect: boolean; options: { label: string; description: string }[] };
export const MEDIUM: Q = {
  question: "Keep the old invoice table while the new one is built?", header: "medium: data", multiSelect: false,
  options: [
    { label: "Keep both (Recommended)", description: "Nothing breaks meanwhile; one more table to drop later." },
    { label: "New table only", description: "Smaller change; the old CSV export stops until step 5." },
    { label: "Migrate now", description: "One step; about 40 minutes of downtime on the test server." },
  ],
};
/** A question card as the server sends it: `levels` and `picks` per question, the card's level by the several-questions rule. */
export const asks = (questions: Q[], levels: string[], picks: (number | null)[], over: Record<string, unknown> = {}) => {
  const level = ["high", "unstated", "medium", "low"].find((l) => levels.includes(l))!;
  const header = questions[levels.indexOf(level)].header;
  return {
    id: "q1", lead: "s1", agent: null, kind: "question", tool: "AskUserQuestion", cwd: "/work/ledgerline", at: NOW - 4 * MIN,
    input: { questions },
    severity: level === "unstated" ? { level, reason: "the agent didn't say", source: "agent" } : { level, reason: `the agent's word: ${header}`, source: "agent" },
    questions: levels.map((l, i) => ({ level: l, pick: picks[i] })),
    ...over,
  };
};
/** Opens `name`'s panel from the plain list and gives the card in it. */
export async function cardIn(page: Page, name: string) {
  await page.locator(".character").filter({ hasText: name }).first().click({ position: { x: 5, y: 5 } });
  return page.getByRole("dialog", { name: `${name} details` }).getByRole("group", { name: /request$/ });
}

export const LOW: Q = {
  question: "Call the new settings module prefs or settings?", header: "low: naming", multiSelect: false,
  options: [
    { label: "prefs (Recommended)", description: "Matches the /prefs route; 4 imports change." },
    { label: "settings", description: "Clearer to a new reader; 11 imports change." },
    { label: "user-config", description: "Matches the docs' word; the env var is renamed too." },
  ],
};
export const HIGH: Q = {
  question: "Run the invoice migration on the shared staging database?", header: "high: data", multiSelect: false,
  options: [
    { label: "Dry run first (Recommended)", description: "Prints the 3 changes and touches nothing; about 5 minutes more." },
    { label: "Run it now", description: "Alters 2 tables other people use; undoing it needs last night's backup." },
    { label: "Wait for review", description: "The agent stops here until the PR is reviewed." },
  ],
};
export const UNSTATED: Q = {
  question: "Which date library should the report page use?", header: "Library", multiSelect: false,
  options: [
    { label: "date-fns (Recommended)", description: "Small; the invoice page already uses it." },
    { label: "Keep moment.js", description: "No change now; it stays the biggest package in the bundle." },
  ],
};
export const NO_PICK: Q = {
  question: "Which customer list should the import test use?", header: "medium: tests", multiSelect: false,
  options: [
    { label: "The 20-row sample", description: "Fast; misses the odd names in real data." },
    { label: "The anonymised export", description: "Slow (2 minutes); catches real edge cases." },
  ],
};
export const EXTRAS: Q = {
  question: "Which checks run on every retry?", header: "low: config", multiSelect: true,
  options: [{ label: "Card limit", description: "One call to the bank." }, { label: "Fraud score", description: "Adds 300 ms." }],
};
export const tile = (brief: Locator, label: string) => brief.locator(".tile").filter({ hasText: label });

export const PLAN = [
  "Goal: invoices export as CSV and PDF from one button.",
  "What changes: a new export service, two routes; the old PDF button goes.",
  "How serious: medium; the old button's link stops working.",
  "",
  "## Steps",
  "1. Add src/invoices/export-service.ts with toCsv and toPdf.",
].join("\n");
export const planned = (severity: Record<string, string>) => ({
  id: "p1", lead: "s1", agent: null, kind: "plan", tool: "ExitPlanMode", cwd: "/work/ledgerline", at: NOW - MIN,
  input: { plan: PLAN, planFilePath: "/home/me/.claude/plans/export-button.md" }, severity,
});
export const MEDIUM_PLAN = { level: "medium", reason: "Funtown's rule: every plan is medium", source: "kind" };

export const permission = (input: Record<string, unknown>, severity: Record<string, string>) => ({
  id: "c1", lead: "s1", agent: "x1", kind: "permission", tool: "Bash", cwd: "/work/ledgerline", at: NOW - MIN, input, severity,
});
export const implementer = { id: "x1", name: "implementer-1", stage: "needs_you", needs: "permission", since: NOW - MIN, activity: null, step: "Bash: npm test", role: "implementer" };
