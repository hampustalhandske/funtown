export type Stage = "working" | "needs_you" | "done" | "gone";
export type Character = {
  id: string;
  name: string;
  stage: Stage;
  activity: string | null;
  needs?: string;
};
export type Lead = Character & { tty: string | null; termProgram: string | null; subagents: Character[] };
export type House = { project: string; cwd: string; leads: Lead[] };
export type Town = { houses: House[] };
