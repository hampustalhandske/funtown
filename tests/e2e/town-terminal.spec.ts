import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_FAKE_DIR, FakeClaude, listedBg } from "../fake-claude.ts";
import { addProjectFolder, betaState, questionCard, removeProjectFolder, showTerminal, sizeShown, stubStream } from "./stream.ts";

const fake = FakeClaude.at(E2E_FAKE_DIR);
const sid = "abcd1234-0000-4000-8000-000000000000";
let cwd = "";

test.beforeEach(async () => {
  cwd = realpathSync(mkdtempSync(join(tmpdir(), "funtown-e2e-town-")));
  fake.reset();
  await addProjectFolder(cwd);
  fake.list([listedBg(sid, cwd, { name: "beta" })]);
});

test.afterEach(async () => {
  await removeProjectFolder(cwd);
});

/** Opens the town and beta's panel (the terminal not shown yet); gives the panel. */
async function openPanel(page: Page) {
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.getByRole("button", { name: /^beta,/ }).click();
  return page.getByRole("dialog", { name: "beta details" });
}

/** Shows beta's terminal once it has attached; gives its text rows. */
async function showAttached(panel: Locator) {
  await showTerminal(panel);
  const rows = panel.locator(".xterm-rows");
  await expect(rows).toContainText("attached abcd1234");
  return rows;
}

test("escape_typed_in_a_terminal_does_not_close_the_towns_settings_pane", async ({ page }) => {
  const panel = await openPanel(page);
  await showAttached(panel);
  await page.getByRole("button", { name: /^settings$/i }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible();
  // xterm swallows a real Escape press itself; an Escape that does reach the page from inside the terminal must not close Settings.
  await panel.locator(".xterm-helper-textarea").dispatchEvent("keydown", { key: "Escape", bubbles: true });
  await expect(settings).toBeVisible();
  await expect(panel).toBeVisible();
});

test.describe("the terminal sheet over the town at 1280 x 800", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the_shown_terminal_is_at_least_100_by_40_with_the_icon_row_and_claudes_prompt_box_visible", async ({ page }) => {
    // Catches a panel too small for Claude (95 x 25, prompt box below the fold) or a sheet that covers the icon row.
    fake.promptAttach();
    const panel = await openPanel(page);
    const rows = await showAttached(panel);
    const size = (await sizeShown(rows))!;
    expect(size.cols).toBeGreaterThanOrEqual(100);
    expect(size.rows).toBeGreaterThanOrEqual(40);
    const icons = page.getByRole("navigation", { name: "Controls" });
    await expect(icons).toBeInViewport({ ratio: 1 });
    const iconBox = (await icons.boundingBox())!;
    expect((await panel.boundingBox())!.y).toBeGreaterThanOrEqual(iconBox.y + iconBox.height);
    await expect(rows.getByText("PROMPT-BOX")).toBeInViewport({ ratio: 1 });
    await expect(panel.getByRole("textbox", { name: "Reply" })).toHaveCount(0);
  });

  test("the_early_client_starts_at_the_sheets_size_so_show_resizes_nothing", async ({ page }) => {
    // Catches the town's hidden terminal box drifting from its sheet, so Claude redraws the moment Show reveals it.
    const before = fake.attachPids("abcd1234").length;
    const panel = await openPanel(page);
    await expect.poll(() => fake.attachPids("abcd1234").length).toBe(before + 1);
    const size = (await sizeShown(await showAttached(panel)))!;
    expect(size.cols).toBeGreaterThanOrEqual(100);
    expect(size.rows).toBeGreaterThanOrEqual(40);
    expect(size.count).toBe(1);
  });

  test("with_a_card_the_buttons_stay_inside_the_window_on_the_sheet_and_on_the_narrow_panel", async ({ page }) => {
    // Catches a tall card pushing Show terminal, Hide terminal and Close session below the window.
    await stubStream(page, betaState(basename(cwd), cwd, sid, [questionCard(sid, cwd)]));
    const panel = await openPanel(page);
    await expect(panel.getByText("Which queue?")).toBeAttached({ timeout: 10_000 });
    await expect(panel.getByRole("button", { name: "Show terminal" })).toBeInViewport({ ratio: 1 });
    await showAttached(panel);
    await expect(panel.getByRole("button", { name: "Hide terminal" })).toBeInViewport({ ratio: 1 });
    await expect(panel.getByRole("button", { name: "Close session" })).toBeInViewport({ ratio: 1 });
  });
});

test.describe("the terminal sheet over the town at 390 px", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("the_buttons_are_inside_the_window_and_the_terminal_keeps_at_least_40_columns", async ({ page }) => {
    // Catches the 19rem column keeping its width and squeezing the terminal to 2 columns.
    const panel = await openPanel(page);
    const rows = await showAttached(panel);
    await expect(panel.getByRole("button", { name: "Hide terminal" })).toBeInViewport({ ratio: 1 });
    await expect(panel.getByRole("button", { name: "Close session" })).toBeInViewport({ ratio: 1 });
    expect((await sizeShown(rows))!.cols).toBeGreaterThanOrEqual(40);
  });
});
