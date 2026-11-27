import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_FAKE_DIR, FakeClaude, listed, listedBg } from "../fake-claude.ts";
import { addProjectFolder, removeProjectFolder } from "./stream.ts";

const fake = FakeClaude.at(E2E_FAKE_DIR);
let cwd = "";
let project = "";
let sid = "";

test.beforeEach(async () => {
  cwd = realpathSync(mkdtempSync(join(tmpdir(), "funtown-e2e-switch-")));
  project = basename(cwd);
  sid = randomUUID();
  fake.reset();
  await addProjectFolder(cwd);
});

test.afterEach(async () => {
  await removeProjectFolder(cwd);
});

const row = (page: Page) => page.locator(`section[aria-label="${project}"] .character`).filter({ hasText: "alpha" }).first();
const panel = (page: Page) => page.getByRole("dialog", { name: "alpha details" });
const switchButton = (page: Page) => page.getByRole("button", { name: "I had to switch" });
const why = (page: Page) => page.getByRole("textbox", { name: "Why?" });
const noted = (page: Page) => page.getByText("Switch noted");

/** Answers the page's POST /switch with 204 here, so no note reaches the server's file; gives the bodies the page sent. */
async function recordSwitches(page: Page): Promise<unknown[]> {
  const bodies: unknown[] = [];
  await page.route("**/switch", async (r) => {
    bodies.push(r.request().postDataJSON());
    await r.fulfill({ status: 204 });
  });
  return bodies;
}

async function openPage(page: Page) {
  fake.list([listed(sid, cwd, { name: "alpha" })]);
  await page.goto("/work.html");
  await expect(row(page)).toBeVisible();
}

test("enter_saves_the_note_with_the_session_open_in_the_panel_and_switch_noted_shows_then_goes", async ({ page }) => {
  const sent = await recordSwitches(page);
  await openPage(page);
  await row(page).click({ position: { x: 5, y: 5 } });
  await expect(panel(page)).toBeVisible();

  await switchButton(page).click();
  await expect(why(page)).toBeFocused();
  await page.keyboard.type("standup");
  await page.keyboard.press("Enter");

  await expect(noted(page)).toBeVisible();
  expect(sent).toEqual([{ reason: "standup", open: { id: sid, name: "alpha", cwd } }]);
  await expect(noted(page)).toBeHidden({ timeout: 5000 });
});

test("the_box_opens_only_on_click_esc_closes_it_without_saving_and_note_it_saves_without_an_open_session", async ({ page }) => {
  const sent = await recordSwitches(page);
  await openPage(page);
  await page.waitForTimeout(300); // a few state frames after load
  await expect(why(page)).toHaveCount(0);

  await switchButton(page).click();
  await expect(why(page)).toBeFocused();
  await page.keyboard.type("not this one");
  // The first Esc only leaves the text box, with its text.
  await page.keyboard.press("Escape");
  await expect(why(page)).toHaveValue("not this one");
  await expect(why(page)).not.toBeFocused();
  await page.keyboard.press("Escape");
  await expect(why(page)).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(sent).toEqual([]);
  await expect(noted(page)).toHaveCount(0);

  await switchButton(page).click();
  await page.getByRole("button", { name: "Note it" }).click();
  await expect(noted(page)).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0]).not.toHaveProperty("open");
});

test("note_it_can_be_clicked_while_a_wide_panel_is_open", async ({ page }) => {
  const sent = await recordSwitches(page);
  // A background lead's panel is the wide one, spanning most of the width under the header.
  fake.list([listedBg(sid, cwd, { name: "alpha" })]);
  await page.goto("/work.html");
  await row(page).click({ position: { x: 5, y: 5 } });
  await expect(panel(page)).toBeVisible();
  await switchButton(page).click();
  // A box under the panel fails here: the panel intercepts the click.
  await page.getByRole("button", { name: "Note it" }).click({ timeout: 3000 });
  await expect(noted(page)).toBeVisible();
  expect(sent).toHaveLength(1);
});

test("esc_leaves_the_box_then_closes_it_and_leaves_the_open_panel_open", async ({ page }) => {
  await openPage(page);
  await row(page).click({ position: { x: 5, y: 5 } });
  await expect(panel(page)).toBeVisible();
  await switchButton(page).click();
  await expect(why(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(why(page)).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
});

test("at_390_px_the_box_and_note_it_stay_inside_the_viewport_and_the_page_does_not_widen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openPage(page);
  const pageWidth = () => page.evaluate(() => document.documentElement.scrollWidth);
  const before = await pageWidth();
  await switchButton(page).click();
  await expect(why(page)).toBeVisible();
  for (const part of [page.getByRole("form", { name: "I had to switch" }), page.getByRole("button", { name: "Note it" })]) {
    const box = (await part.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  expect(await pageWidth()).toBe(before);
});
