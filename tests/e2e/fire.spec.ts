import { expect, test } from "@playwright/test";
import { lead, red, stubStream, town, visibleWords, waiting, withPrs } from "./stream.ts";

const NOW = Date.now();
const resting = (id: string) => lead({ id, name: id, stage: "needs_you", needs: "turn ended", since: 1 });

test("a_burning_handled_and_last_seen_house_and_a_loud_stuck_lead_draw_with_no_errors_and_the_hidden_list_keeps_its_house_words", async ({ page }) => {
  // Catches a fire part that throws in the scene, and house words on the hidden list changed by the fire.
  const problems: string[] = [];
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("response", (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  await stubStream(
    page,
    town([
      withPrs("burning", [resting("b1")], [red(7, 30)]),
      withPrs("handled", [lead({ id: "h1", name: "h1" })], [red(8, 20)]),
      withPrs("foggy", [resting("f1")], [red(9, 10)], { parcelsAt: undefined }),
      withPrs("sticky", [waiting("s1", "s1", NOW - 600_000, { needs: "stuck", reason: "loop" })], []),
    ]),
  );
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect.poll(() => page.locator("canvas").evaluate((c: HTMLCanvasElement) => c.getContext("webgl2") !== null)).toBe(true);
  // The names of the houses as before: the project, "house", then its state words.
  const house = (project: string) => page.getByRole("button", { name: new RegExp(`^${project}, house`) });
  await expect(house("burning")).toHaveAccessibleName(/burning/);
  await expect(house("handled")).toHaveAccessibleName(/handled/);
  await expect(house("handled")).not.toHaveAccessibleName(/burning/);
  await expect(house("foggy")).toHaveAccessibleName(/failed when last read/);
  await page.waitForTimeout(2000);
  expect(await visibleWords(page)).toEqual([]);
  expect(problems).toEqual([]);
});


test("a_burning_house_that_is_not_the_head_is_named_burning_on_the_hidden_list_and_a_house_with_no_fire_is_not", async ({ page }) => {
  // Catches a fire known only for the loud house, and a calm house named as burning. What the flames look like is the model's (tests/town/fire.test.ts).
  const stream = await stubStream(page, town([withPrs("calm", [resting("c1")], [])]));
  await page.goto("/");
  const house = (project: string) => page.getByRole("button", { name: new RegExp(`^${project}, house`) });
  await expect(house("calm")).toBeVisible();
  await expect(house("calm")).not.toHaveAccessibleName(/burning|handled/);
  // An ask in another house is the head, so the burning house is the quiet form.
  stream.send(town([withPrs("burning", [resting("b1")], [red(7, 30)]), withPrs("asker", [waiting("a1", "a1", NOW - 60_000, { needs: "permission" })], [])]));
  await expect(house("burning")).toHaveAccessibleName(/burning/);
  await expect(house("asker")).not.toHaveAccessibleName(/burning|handled/);
});
