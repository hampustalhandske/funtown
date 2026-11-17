/** Clay colours for projects: soft and mid-toned, so the dark ink outline reads on each. */
export const PALETTE = [
  "#e07a5f", // terracotta
  "#f2cc8f", // sand
  "#81b29a", // sage
  "#6d9dc5", // cornflower
  "#b48ead", // heather
  "#e9a6a6", // blush
  "#a3c4bc", // seafoam
  "#d4a373", // caramel
  "#9aa7d6", // periwinkle
  "#c9d47c", // pear
] as const;

/** Every hat the kit can make: one per known role, the two crowns and the default cap. */
export type HatKind = "hardhat" | "toque" | "pith" | "wizard" | "straw" | "beret" | "tophat" | "crown" | "tiara" | "cap";

/** The hat for each listed subagent type. */
export const ROLE_HATS: Record<string, HatKind> = {
  implementer: "hardhat",
  "test-writer": "toque",
  explorer: "pith",
  Explore: "pith",
  Plan: "wizard",
  "general-purpose": "straw",
  "ui-reviewer": "beret",
};

/** The hat for a subagent type (`Character.role`): a listed role's hat, a top hat for any other reviewer, else the cap. */
export function hatFor(role?: string): HatKind {
  if (role === undefined) return "cap";
  if (Object.hasOwn(ROLE_HATS, role)) return ROLE_HATS[role];
  return /review/i.test(role) ? "tophat" : "cap";
}

/** A project's clay colour: the same name always gives the same palette entry (FNV-1a hash). */
export function colourFor(project: string): string {
  let hash = 0x811c9dc5;
  for (const ch of project) hash = Math.imul(hash ^ ch.codePointAt(0)!, 0x01000193);
  return PALETTE[(hash >>> 0) % PALETTE.length];
}
