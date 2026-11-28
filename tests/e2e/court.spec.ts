import { expect, test, type Page } from "@playwright/test";
import { stubStream } from "./stream.ts";

// The forecourt: you on your throne and the Queen on hers. The town is a canvas, so these specs read the hidden list that
// says what the picture shows, and watch the page for errors while it draws.

const claude = { version: "2.1.325", problems: [] };
const lead = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, name, stage: "working", activity: null, step: null, tty: null, termProgram: null, kind: "terminal", shortId: null, subagents: [], ...over,
});
const steward = (over: Record<string, unknown> = {}) => lead("st1", "steward", { kind: "background", shortId: "st1short", steward: true, ...over });
const asker = lead("a1", "asker", { stage: "needs_you", needs: "question", since: 5 });
/** A town with an asker whose card carries `word`, the steward listed when `st` is given, and the avatar `avatar`. */
const state = (word?: Record<string, unknown>, st?: Record<string, unknown>, avatar?: string) => ({
  claude,
  ...(avatar === undefined ? {} : { avatar }),
  cards: [{ id: "c1", lead: "a1", agent: null, kind: "question", tool: "AskUserQuestion", input: { questions: [] }, cwd: "/work/demo-app", at: 5, severity: { level: "low", reason: "", source: "kind" }, ...(word ? { word } : {}) }],
  houses: [
    { project: "demo-app", cwd: "/work/demo-app", added: true, leads: [asker] },
    ...(st ? [{ project: "steward", cwd: "/home/me/.funtown/steward", leads: [steward(st)] }] : []),
  ],
});

/** Opens the town on a stubbed stream; every console error and failed request is gathered in `problems`. */
async function openTown(page: Page, initial: unknown) {
  const problems: string[] = [];
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("response", (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  const stream = await stubStream(page, initial);
  await page.route("**/letters?*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  return { stream, problems };
}
const queen = (page: Page) => page.getByRole("button", { name: /^Queen/ });

test("the_hidden_list_names_the_queen_with_what_she_is_doing_and_follows_the_word", async ({ page }) => {
  // Catches a Queen the list never mentions, or one whose state the picture shows and the list doesn't.
  const { stream } = await openTown(page, state({ state: "idle" }, { stage: "needs_you", needs: "turn ended", since: 2 }));
  await expect(queen(page)).toHaveAccessibleName(/steward/);
  await expect(queen(page)).toHaveAccessibleName(/sitting still/);
  stream.send(state({ state: "writing" }, { stage: "working" }));
  await expect(queen(page)).toHaveAccessibleName(/writing your word/, { timeout: 10_000 });
  stream.send(state({ state: "idle" }, { stage: "working" }));
  await expect(queen(page)).toHaveAccessibleName(/reading a parcel/, { timeout: 10_000 });
  stream.send(state({ state: "ready", letter: "w1" }, { stage: "needs_you", needs: "turn ended", since: 2 }));
  await expect(queen(page)).toHaveAccessibleName(/her word is ready/, { timeout: 10_000 });
});

test("with_no_steward_listed_the_list_says_the_queen_has_no_session_and_offers_no_button_for_her_or_for_you", async ({ page }) => {
  // Catches a button that opens nothing, and a Queen who leaves the list when her session does.
  await openTown(page, state());
  await expect(page.getByText(/^Queen, no steward session, sitting still$/)).toHaveCount(1);
  await expect(queen(page)).toHaveCount(0);
  await expect(page.getByText("you, on your throne")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /on your throne/ })).toHaveCount(0);
});

test("clicking_the_queen_opens_her_panel", async ({ page }) => {
  // Catches the Queen drawn but unreachable: today's way in to the steward's panel.
  await openTown(page, state({ state: "idle" }, { stage: "needs_you", needs: "turn ended", since: 2 }));
  await queen(page).click();
  await expect(page.getByRole("dialog", { name: "steward details" })).toBeVisible();
});

test("the_town_draws_with_no_errors_for_every_queen_state_and_every_avatar_the_state_names", async ({ page }) => {
  // Catches a throw while drawing a pose, a person or the furniture, and a State avatar the scene can't read.
  const { stream, problems } = await openTown(page, state({ state: "queued" }, { stage: "working" }, "sage"));
  await expect(queen(page)).toHaveAccessibleName(/writing your word/, { timeout: 10_000 });
  for (const [word, st, avatar] of [
    [{ state: "idle" }, { stage: "working" }, "terracotta"],
    [{ state: "idle" }, { stage: "needs_you", needs: "turn ended", since: 2 }, "no-such-avatar"],
    [{ state: "ready", letter: "w1" }, { stage: "needs_you", needs: "turn ended", since: 2 }, undefined],
  ] as const) {
    stream.send(state(word, st, avatar));
    await page.waitForTimeout(1200);
  }
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(problems).toEqual([]);
});
