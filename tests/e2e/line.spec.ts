import { expect, test, type Page } from "@playwright/test";
import { house, panel, stubStream, town, waiting } from "./stream.ts";

// The line at the castle: the town is a canvas, so these specs read the hidden list that says what the picture shows.

const MIN = 60_000;
/** A card held for lead `lead`'s question in `/work/<project>`. */
const card = (id: string, lead: string, project: string) => ({
  id, lead, agent: null, kind: "question", tool: "AskUserQuestion", cwd: `/work/${project}`, at: Date.now(),
  input: { questions: [{ question: `Which way for ${project}?`, header: "Way", multiSelect: false, options: [{ label: "Left", description: "" }, { label: "Right", description: "" }] }] },
  severity: { level: "low", reason: "", source: "kind" },
});
/** Three leads asking in three houses, the oldest first: 14, 6 and 1 minutes. */
function threeAsks() {
  const asks: [string, string, number][] = [["a1", "alpha", 14], ["b1", "beta", 6], ["c1", "gamma", 1]];
  return town(
    asks.map(([id, project, minutes]) => house(project, [waiting(id, `lead-${project}`, Date.now() - minutes * MIN, { needs: "question" })])),
    asks.map(([id, project]) => card(`card-${id}`, id, project)),
  );
}
const item = (page: Page, name: RegExp) => page.getByRole("list", { name: "Town" }).getByRole("button", { name });

test("the_hidden_list_says_who_is_at_the_table_waving_and_where_the_others_stand_in_the_line", async ({ page }) => {
  // Catches a line the picture draws but the list never tells, or one in the wrong order.
  await stubStream(page, threeAsks());
  await page.goto("/");
  await expect(item(page, /^lead-alpha,/)).toHaveAccessibleName(/, at the table, waving the flag$/);
  await expect(item(page, /^lead-beta,/)).toHaveAccessibleName(/, in the line, 2nd$/);
  await expect(item(page, /^lead-gamma,/)).toHaveAccessibleName(/, in the line, 3rd$/);
});

test("clicking_a_character_in_the_line_opens_its_card", async ({ page }) => {
  // Catches a character in the line that can't be reached, or one that opens another's card.
  await stubStream(page, threeAsks());
  await page.goto("/");
  await item(page, /^lead-beta,/).click();
  await expect(panel(page, "lead-beta").getByText("Which way for beta?")).toBeVisible();
});
