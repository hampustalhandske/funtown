import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_FAKE_DIR, FakeClaude, listed } from "../fake-claude.ts";

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

let clock = Date.now();
/** Posts one hook event for `sid` to the e2e server, with a `funtown.at` later than the last one. */
async function hook(sid: string, name: string, extra: Record<string, unknown> = {}) {
  const at = (clock = Math.max(clock + 1, Date.now()));
  const res = await fetch("http://127.0.0.1:4799/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hook_event_name: name, session_id: sid, cwd, funtown: { tty: null, term_program: null, at }, ...extra }),
  });
  expect(res.status).toBe(204);
}
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
/** Closes the open view with its close button when it has one, else with Escape. */
async function closeView(page: Page) {
  const close = view(page).getByRole("button", { name: /close/i });
  if (await close.count()) await close.first().click();
  else await page.keyboard.press("Escape");
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

test("the_window_starts_when_the_view_was_last_closed_and_survives_a_reload", async ({ page }) => {
  await openPage(page);
  await hook(sidA, "Stop", { last_assistant_message: "Before the first close." });
  await openButton(page).click();
  await expect(view(page)).toContainText("Before the first close.");
  await closeView(page);

  await page.waitForTimeout(100);
  await hook(sidA, "Stop", { last_assistant_message: "After the first close." });
  await page.reload();
  await expect(openButton(page)).toBeVisible();
  await openButton(page).click();
  await expect(view(page)).toContainText("After the first close.");
  await expect(view(page)).not.toContainText("Before the first close.");
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
