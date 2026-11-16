import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_FAKE_DIR, FakeClaude, listed } from "../fake-claude.ts";

const fake = FakeClaude.at(E2E_FAKE_DIR);
let cwd = "";
let project = "";
let sid = "";

test.beforeEach(() => {
  cwd = realpathSync(mkdtempSync(join(tmpdir(), "funtown-e2e-switch-")));
  project = basename(cwd);
  sid = randomUUID();
  fake.reset();
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
  await page.goto("/");
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
