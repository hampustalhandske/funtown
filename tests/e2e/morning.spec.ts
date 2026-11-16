import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_FAKE_DIR, FakeClaude, listed } from "../fake-claude.ts";
import { hook as postHook } from "./stream.ts";

const fake = FakeClaude.at(E2E_FAKE_DIR);
let cwd = "";
let project = "";
let sidA = "";
let sidB = "";

test.beforeEach(() => {
  cwd = realpathSync(mkdtempSync(join(tmpdir(), "funtown-e2e-morning-")));
  project = basename(cwd);
  sidA = randomUUID();
  sidB = randomUUID();
  fake.reset();
});

const hook = (sid: string, name: string, extra: Record<string, unknown> = {}) => postHook(sid, cwd, name, extra);
const sub = { agent_id: "x1", agent_type: "Explore" };

const panel = (page: Page, name: string) => page.getByRole("dialog", { name: `${name} details` });
/** The morning view: the element named "Morning" that is not the header button. */
const view = (page: Page) => page.locator('[aria-label="Morning"]:not(button)');
const openButton = (page: Page) => page.getByRole("button", { name: "Morning", exact: true });

async function openPage(page: Page) {
  fake.list([listed(sidA, cwd, { name: "alpha" }), listed(sidB, cwd, { name: "beta" })]);
  await page.goto("/");
  await expect(page.locator(`section[aria-label="${project}"] .character`).filter({ hasText: "alpha" }).first()).toBeVisible();
}
/** Closes the open view with its close button. */
async function closeView(page: Page) {
  await view(page).getByRole("button", { name: /close/i }).click();
  await expect(view(page)).toHaveCount(0);
}

test("the_morning_view_shows_done_stuck_and_next_for_the_project_and_a_next_row_opens_that_characters_panel", async ({ page }) => {
  await openPage(page);
  await hook(sidA, "SubagentStart", sub);
  await hook(sidA, "SubagentStop", { ...sub, last_assistant_message: "SUBLETTER" });
  await hook(sidA, "Stop", { last_assistant_message: "Shipped the fix." });
  await hook(sidB, "StopFailure", { error: "rate_limit" });
  await expect(page.locator(".needs-list")).toContainText("beta");

  await openButton(page).click();
  const v = view(page);
  await expect(v).toBeVisible();
  await expect(v).toContainText(/Since /);
  await expect(v).toContainText(project);
  await expect(v).toContainText("Done");
  await expect(v).toContainText("Shipped the fix.");
  await expect(v).not.toContainText("SUBLETTER");
  await expect(v).toContainText("Stuck");
  await expect(v).toContainText("rate limit");
  await expect(v).toContainText("Next");

  await v.getByRole("button", { name: /beta/ }).first().click();
  await expect(panel(page, "beta")).toBeVisible();
});

test("the_window_starts_when_the_view_last_loaded_and_survives_a_reload", async ({ page }) => {
  await openPage(page);
  await hook(sidA, "Stop", { last_assistant_message: "Before the first load." });
  await openButton(page).click();
  await expect(view(page)).toContainText("Before the first load.");
  await closeView(page);

  await page.waitForTimeout(100);
  await hook(sidA, "Stop", { last_assistant_message: "After the first load." });
  await page.reload();
  await expect(openButton(page)).toBeVisible();
  await openButton(page).click();
  await expect(view(page)).toContainText("After the first load.");
  await expect(view(page)).not.toContainText("Before the first load.");
});

test("a_letter_written_while_the_view_is_open_shows_on_the_next_open_and_a_failed_load_does_not_move_the_window", async ({ page }) => {
  await openPage(page);
  // Two leads, since Done keeps only each lead's newest letter.
  await hook(sidB, "Stop", { last_assistant_message: "Before the first load." });
  await openButton(page).click();
  await expect(view(page)).toContainText("Before the first load.");
  await page.waitForTimeout(100);
  await hook(sidA, "Stop", { last_assistant_message: "While the view was open." });
  await page.waitForTimeout(100);
  await closeView(page);

  await page.route("**/morning?**", (r) => r.fulfill({ status: 500, body: "boom" }));
  await openButton(page).click();
  await expect(view(page).getByRole("alert")).toBeVisible();
  await page.waitForTimeout(100);
  await closeView(page);
  await page.unroute("**/morning?**");

  await openButton(page).click();
  await expect(view(page)).toContainText("While the view was open.");
  await expect(view(page)).not.toContainText("Before the first load.");
});

test("the_view_never_opens_or_takes_focus_when_events_arrive", async ({ page }) => {
  await openPage(page);
  await hook(sidA, "Stop", { last_assistant_message: "A letter." });
  await hook(sidB, "StopFailure", { error: "server_error" });
  await page.waitForTimeout(500);
  await expect(view(page)).toHaveCount(0);
  await expect(page.getByText(/^Since /)).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("BODY");
});

test("a_letter_heading_shows_the_writers_new_name_after_a_rename", async ({ page }) => {
  await openPage(page);
  await hook(sidA, "Stop", { last_assistant_message: "Written under the old name." });
  fake.list([listed(sidA, cwd, { name: "gamma" }), listed(sidB, cwd, { name: "beta" })]);
  const row = page.locator(`section[aria-label="${project}"] .character`).filter({ hasText: "gamma" }).first();
  await expect(row).toBeVisible({ timeout: 8000 });
  await row.click({ position: { x: 5, y: 5 } });
  const box = panel(page, "gamma").getByRole("region", { name: "Letters" });
  await expect(box).toContainText("Written under the old name.");
  await expect(box).toContainText("gamma");
  await expect(box).not.toContainText("alpha");
});

test("a_done_heading_shows_the_writers_new_name_after_a_rename_while_it_is_listed", async ({ page }) => {
  await openPage(page);
  await hook(sidA, "Stop", { last_assistant_message: "Written under the old name." });
  fake.list([listed(sidA, cwd, { name: "gamma" }), listed(sidB, cwd, { name: "beta" })]);
  await expect(page.locator(`section[aria-label="${project}"] .character`).filter({ hasText: "gamma" }).first()).toBeVisible({ timeout: 8000 });
  await openButton(page).click();
  const done = view(page).locator(`section[title="${cwd}"]`).locator('[aria-label="Done"]');
  await expect(done).toContainText("Written under the old name.");
  await expect(done).toContainText("gamma");
  await expect(done).not.toContainText("alpha");
});

test("a_waiting_character_shows_under_its_own_project_only_when_two_projects_share_a_basename", async ({ page }) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "funtown-e2e-same-")));
  const x = join(root, "x", "app");
  const y = join(root, "y", "app");
  mkdirSync(x, { recursive: true });
  mkdirSync(y, { recursive: true });
  fake.list([listed(sidA, x, { name: "alpha" }), listed(sidB, y, { name: "beta" })]);
  await page.goto("/");
  await expect(page.locator(".character").filter({ hasText: "alpha" }).first()).toBeVisible();
  await postHook(sidA, x, "Stop", { last_assistant_message: "Done in x." });
  await postHook(sidB, y, "Stop", { last_assistant_message: "Done in y." });
  fake.list([listed(sidA, x, { name: "alpha", status: "waiting", waitingFor: "input needed" }), listed(sidB, y, { name: "beta" })]);
  await expect(page.locator(".needs-list")).toContainText("alpha", { timeout: 8000 });

  await openButton(page).click();
  const inX = view(page).locator(`section[title="${x}"]`);
  const inY = view(page).locator(`section[title="${y}"]`);
  await expect(inX.locator('[aria-label="Next"]')).toContainText("alpha");
  await expect(inY).toContainText("Done in y.");
  await expect(inY.locator('[aria-label="Next"]')).toContainText("beta");
  await expect(inY).not.toContainText("alpha");
});
