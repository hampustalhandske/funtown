import { expect, test, type Page } from "@playwright/test";
import { house, lead, stubStream, town } from "./stream.ts";

const NOW = Date.now();

/**
 * Three houses on the island's first three lots: alpha on the slope above the quay (front left on the screen), beta to its
 * right across the square, and gamma behind alpha near the stair's foot, the house nearest the screen's middle.
 */
const row = () => town(["alpha", "beta", "gamma"].map((p, i) => house(p, [lead({ id: `s${i}`, name: `lead-${i}` })])));

async function open(page: Page, initial: unknown, path = "/") {
  await stubStream(page, initial);
  await page.goto(path);
  await expect(page.locator("ul.town-list button").first()).toBeAttached(); // the first state is in before a test presses a key
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.waitForTimeout(1200); // the camera settles on the scene it fits
}
const plate = (page: Page) => page.locator(".plate");
const hash = (page: Page) => page.evaluate(() => location.hash);
/** A keydown at the page as a held key sends it (`repeat`), which Playwright's keyboard can't. */
const held = (page: Page, key: string) =>
  page.evaluate((k) => void document.body.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, repeat: true })), key);

test("arrows_move_the_mark_by_screen_direction_and_show_its_name_plate", async ({ page }) => {
  await open(page, row());
  await expect(plate(page)).toHaveCount(0);
  // The first press marks the house nearest the middle, whichever arrow.
  await page.keyboard.press("ArrowLeft");
  await expect(plate(page)).toHaveText("gamma");
  await page.keyboard.press("ArrowRight");
  await expect(plate(page)).toHaveText("beta");
  // Nothing further right: the mark stays.
  await page.keyboard.press("ArrowRight");
  await expect(plate(page)).toHaveText("beta");
  await page.keyboard.press("ArrowUp");
  await expect(plate(page)).toHaveText("gamma");
  await page.keyboard.press("ArrowLeft");
  await expect(plate(page)).toHaveText("alpha");
  await page.keyboard.press("ArrowLeft");
  await expect(plate(page)).toHaveText("alpha");
});

test("down_and_up_follow_the_screen_and_the_way_back_returns_to_the_house_you_came_from", async ({ page }) => {
  await open(page, row());
  await page.keyboard.press("ArrowDown");
  await expect(plate(page)).toHaveText("gamma");
  await page.keyboard.press("ArrowDown");
  await expect(plate(page)).toHaveText("alpha");
  await page.keyboard.press("ArrowUp");
  await expect(plate(page)).toHaveText("gamma");
  await page.keyboard.press("ArrowRight");
  await expect(plate(page)).toHaveText("beta");
  // Left from beta goes back to gamma, where it came from, though alpha lies straighter to the left.
  await page.keyboard.press("ArrowLeft");
  await expect(plate(page)).toHaveText("gamma");
});

test("enter_goes_into_the_marked_house_and_esc_leaves_it_then_clears_the_mark", async ({ page }) => {
  await open(page, row());
  await page.keyboard.press("Enter");
  expect(await hash(page), "Enter with no mark goes nowhere").toBe("");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(plate(page)).toHaveText("beta");
  await page.keyboard.press("Enter");
  expect(await hash(page)).toBe(`#in=${encodeURIComponent("/work/beta")}`);
  // In the classroom the arrows do nothing and Enter goes nowhere new.
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  expect(await hash(page)).toBe(`#in=${encodeURIComponent("/work/beta")}`);
  // Esc leaves the classroom first, then clears the mark.
  await page.keyboard.press("Escape");
  expect(await hash(page)).toBe("");
  await expect(plate(page)).toHaveText("beta");
  await page.keyboard.press("Escape");
  await expect(plate(page)).toHaveCount(0);
  // A cleared mark comes back where it was on the next arrow.
  await page.keyboard.press("ArrowLeft");
  await expect(plate(page)).toHaveText("beta");
});

test("arrows_and_enter_do_nothing_with_a_pane_open_and_the_mark_is_the_last_layer_esc_closes", async ({ page }) => {
  await open(page, row());
  await page.keyboard.press("ArrowLeft");
  await expect(plate(page)).toHaveText("gamma");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(plate(page)).toHaveText("gamma");
  expect(await hash(page)).toBe("");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(plate(page)).toHaveText("gamma");
  await page.keyboard.press("Escape");
  await expect(plate(page)).toHaveCount(0);
});

test("space_marks_a_house_the_arrows_then_move_on_from", async ({ page }) => {
  const asking = town([
    house("alpha", [lead({ id: "a", name: "lead-a" })]),
    house("beta", [lead({ id: "b", name: "lead-b", stage: "needs_you", needs: "waiting", since: NOW - 1000 })]),
    house("gamma", [lead({ id: "c", name: "lead-c" })]),
  ]);
  await open(page, asking);
  await page.keyboard.press("Space");
  await expect(page.getByRole("dialog", { name: "lead-b details" })).toBeVisible();
  await expect(plate(page)).toHaveText("beta");
  await page.keyboard.press("ArrowRight"); // a pane is open: nothing moves
  await expect(plate(page)).toHaveText("beta");
  await page.keyboard.press("Escape");
  await page.keyboard.press("ArrowLeft");
  await expect(plate(page)).toHaveText("alpha");
});

test("a_held_arrow_moves_once_and_a_focused_button_keeps_its_enter", async ({ page }) => {
  await open(page, row());
  await page.keyboard.press("ArrowLeft");
  await expect(plate(page)).toHaveText("gamma");
  await held(page, "ArrowRight");
  await page.waitForTimeout(200);
  await expect(plate(page)).toHaveText("gamma");
  // Tab to a button: Enter presses it and does not go into the house.
  await page.getByRole("button", { name: "Key sheet" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Key sheet" })).toBeVisible();
  expect(await hash(page)).toBe("");
});
