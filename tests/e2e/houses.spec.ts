import { expect, test, type Page } from "@playwright/test";
import { house, lead, stubStream, town, visibleWords } from "./stream.ts";

/** A town of one working house named `harbour-house`, so the only thing the pointer can find at the house is the house. */
async function openOneHouse(page: Page) {
  await stubStream(page, town([house("harbour-house", [lead({ id: "s1", name: "lead-1" })])]));
  await page.goto("/");
  await expect(page.locator("ul.town-list button").first()).toBeAttached(); // the first state is in before a test presses a key
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.waitForTimeout(1200); // the camera settles on the scene it fits
}

const plate = (page: Page) => page.locator(".plate", { hasText: "harbour-house" });

/** Moves the pointer over a grid of the canvas until the house's name plate shows, and leaves it there; false when it never does. */
async function hoverHouse(page: Page, around: { x: number; y: number }): Promise<boolean> {
  for (let y = around.y - 60; y <= around.y + 220; y += 14) {
    for (let x = around.x - 260; x <= around.x + 40; x += 14) {
      await page.mouse.move(x, y);
      if ((await plate(page).count()) > 0) return true;
    }
  }
  return false;
}

test("an_arrow_marks_the_house_and_its_plate_names_it_and_escape_takes_it_away", async ({ page }) => {
  await openOneHouse(page);
  await page.keyboard.press("ArrowRight");
  await expect(plate(page)).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(plate(page)).toHaveCount(0);
});

test("pointing_at_a_house_shows_its_name_and_clicking_it_opens_its_classroom", async ({ page }) => {
  await openOneHouse(page);
  // Where the mark's plate floats says where on the screen the house is.
  await page.keyboard.press("ArrowRight");
  const box = (await plate(page).boundingBox())!;
  await page.keyboard.press("Escape");
  await expect(plate(page)).toHaveCount(0);
  expect(await hoverHouse(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 })).toBe(true);
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(() => new URL(page.url()).hash).toBe(`#in=${encodeURIComponent("/work/harbour-house")}`);
});

test("the_town_shows_no_words_while_a_house_works_and_its_chimney_puffs", async ({ page }) => {
  await openOneHouse(page);
  await page.waitForTimeout(1200);
  expect(await visibleWords(page)).toEqual([]);
});
