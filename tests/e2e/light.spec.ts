import { expect, test, type Page } from "@playwright/test";
import { house, lead, stubStream, town } from "./stream.ts";

// The town's light follows the page's clock. The town is a canvas, so these specs fake the clock, watch the page for errors
// while it draws, and read how bright the picture is.

/** A local time on a fixed day. */
const at = (h: number, m = 0, s = 0) => new Date(2026, 10, 28, h, m, s);

/** Opens the town on a stubbed stream with the page's clock at `time`; every console error and failed request is gathered in `problems`. */
async function openTownAt(page: Page, time: Date) {
  const problems: string[] = [];
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("response", (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  await page.clock.install({ time });
  await stubStream(page, town([house("demo-app", [lead({ id: "s1", name: "lead-1" })]), house("other-app", [lead({ id: "s2", name: "lead-2" })])]));
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  return problems;
}

/** How bright the page is as drawn, 0 to 255: the average of every pixel's red, green and blue. A blank page of the same browser reads the screenshot, as the town's own page may not load a data image. */
async function brightness(page: Page): Promise<number> {
  await page.waitForTimeout(1500);
  const shot = (await page.screenshot()).toString("base64");
  const reader = await page.context().newPage();
  const mean = await reader.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    for (let i = 0; i < pixels.length; i += 4) sum += pixels[i] + pixels[i + 1] + pixels[i + 2];
    return sum / (pixels.length / 4) / 3;
  }, shot);
  await reader.close();
  return mean;
}

for (const [name, time] of [["a_day_clock", at(13)], ["a_night_clock", at(23)]] as const) {
  test(`the_town_draws_with_no_errors_at_${name}`, async ({ page }) => {
    // Catches a light that breaks the scene (a uniform or a glow batch that fails to build) at either end of the day.
    const problems = await openTownAt(page, time);
    await page.waitForTimeout(1500);
    expect(problems).toEqual([]);
  });
}

test("the_picture_is_bright_by_day_dimmer_at_dusk_and_dark_at_night", async ({ browser }) => {
  // Catches a light that never reaches the picture, or that follows the wrong band of the clock.
  const seen: Record<string, number> = {};
  for (const [name, time] of [["day", at(13)], ["dusk", at(19, 30)], ["night", at(23)]] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const problems = await openTownAt(page, time);
    seen[name] = await brightness(page);
    expect(problems, name).toEqual([]);
    await context.close();
  }
  expect(seen.night).toBeLessThan(seen.dusk);
  expect(seen.dusk).toBeLessThan(seen.day);
  expect(seen.night).toBeLessThan(seen.day * 0.5);
});

test("the_light_is_read_again_each_minute_so_the_town_darkens_as_the_evening_goes_by", async ({ page }) => {
  // Catches a light fixed at the minute the page opened.
  const problems = await openTownAt(page, at(18, 59, 30));
  const before = await brightness(page);
  await page.clock.fastForward("04:00:00");
  const after = await brightness(page);
  expect(after).toBeLessThan(before * 0.5);
  expect(problems).toEqual([]);
});
