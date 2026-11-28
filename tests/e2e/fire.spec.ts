import { expect, test, type Page } from "@playwright/test";
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

/** How many pixels of the page's canvas are flame-coloured: bright, saturated orange, brighter than any roof tile. */
async function flamePixels(page: Page): Promise<number> {
  const shot = await page.locator("canvas").screenshot();
  // Decoded on a blank page, since the town's own page does not allow a data image.
  const blank = await page.context().newPage();
  const count = await blank.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && d[i + 1] > 90 && d[i + 1] < 180 && d[i + 2] < 90) n++;
    return n;
  }, shot.toString("base64"));
  await blank.close();
  return count;
}

test("a_burning_house_that_is_not_the_head_keeps_visible_flames_and_a_house_with_no_fire_shows_none", async ({ page }) => {
  // Catches flames drawn only for the loud fire, and a calm house drawing flame colour.
  const stream = await stubStream(page, town([withPrs("calm", [resting("c1")], [])]));
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.waitForTimeout(2000);
  expect(await flamePixels(page)).toBe(0);
  // An ask in another house is the head, so the burning house is the quiet form.
  stream.send(town([withPrs("burning", [resting("b1")], [red(7, 30)]), withPrs("asker", [waiting("a1", "a1", NOW - 60_000, { needs: "permission" })], [])]));
  await page.reload();
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.waitForTimeout(2000);
  expect(await flamePixels(page)).toBeGreaterThan(30);
});
