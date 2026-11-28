import { expect, test, type Page } from "@playwright/test";
import { house, lead, panel, stubStream, town, waiting } from "./stream.ts";

// The walk between a house and the castle. The town is a canvas, so these read the hidden list that says what the picture shows.

const MIN = 60_000;
const PROJECTS: [string, number][] = [["alpha", 14], ["beta", 6], ["gamma", 1]];
/** A card held for lead `lead`'s question in `/work/<project>`. */
const card = (id: string, project: string) => ({
  id: `card-${id}`, lead: id, agent: null, kind: "question", tool: "AskUserQuestion", cwd: `/work/${project}`, at: Date.now(),
  input: { questions: [{ question: `Which way for ${project}?`, header: "Way", multiSelect: false, options: [{ label: "Left", description: "" }, { label: "Right", description: "" }] }] },
  severity: { level: "low", reason: "", source: "kind" },
});
/** The three houses; the leads of the projects in `asking` ask since their minutes, with a card each, the others work. */
function state(asking: string[]) {
  const id = (project: string) => `${project.slice(0, 1)}1`;
  return town(
    PROJECTS.map(([project, minutes]) =>
      house(project, [asking.includes(project) ? waiting(id(project), `lead-${project}`, Date.now() - minutes * MIN, { needs: "question" }) : lead({ id: id(project), name: `lead-${project}` })])),
    asking.map((project) => card(id(project), project)),
  );
}
const item = (page: Page, name: RegExp) => page.getByRole("list", { name: "Town" }).getByRole("button", { name });

test("a_new_ask_opens_its_card_at_once_while_its_character_walks_up_and_it_waves_only_at_the_table", async ({ page }) => {
  // Catches a walk that holds the card back until the character arrives, or a loud flag that waves on the stair.
  test.setTimeout(60_000);
  const stream = await stubStream(page, state([]));
  await page.goto("/");
  await expect(item(page, /^lead-alpha,/)).toBeVisible();
  stream.send(state(["alpha"]));
  await expect(item(page, /^lead-alpha,/)).toHaveAccessibleName(/, walking up$/, { timeout: 10_000 });
  await item(page, /^lead-alpha,/).click();
  await expect(panel(page, "lead-alpha").getByText("Which way for alpha?")).toBeVisible();
  await expect(item(page, /^lead-alpha,/)).toHaveAccessibleName(/, walking up$/);
  await expect(item(page, /^lead-alpha,/)).toHaveAccessibleName(/, at the table, waving the flag$/, { timeout: 40_000 });
});

test("an_answered_character_walks_home_and_the_next_one_is_at_the_table_at_once", async ({ page }) => {
  // Catches an answer that leaves the answered one in the line, or a loud flag that waits for the walk home to end.
  const stream = await stubStream(page, state(["alpha", "beta", "gamma"]));
  await page.goto("/");
  await expect(item(page, /^lead-alpha,/)).toHaveAccessibleName(/, at the table, waving the flag$/);
  await expect(item(page, /^lead-beta,/)).toHaveAccessibleName(/, in the line, 2nd$/);
  stream.send(state(["beta", "gamma"]));
  await expect(item(page, /^lead-alpha,/)).toHaveAccessibleName(/, walking home$/, { timeout: 10_000 });
  await expect(item(page, /^lead-alpha,/)).not.toHaveAccessibleName(/in the line|at the table/);
  await expect(item(page, /^lead-beta,/)).toHaveAccessibleName(/, at the table, waving the flag$/);
  await expect(item(page, /^lead-gamma,/)).toHaveAccessibleName(/, in the line, 2nd$/);
});
