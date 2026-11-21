import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { E2E_FAKE_DIR, FakeClaude, listedBg } from "../fake-claude.ts";
import { addProjectFolder, removeProjectFolder, showTerminal, sizeShown } from "./stream.ts";

const fake = FakeClaude.at(E2E_FAKE_DIR);

test("escape_typed_in_a_terminal_does_not_close_the_towns_settings_pane", async ({ page }) => {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), "funtown-e2e-town-")));
  fake.reset();
  await addProjectFolder(cwd);
  fake.list([listedBg("abcd1234-0000-4000-8000-000000000000", cwd, { name: "beta" })]);
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.getByRole("button", { name: /^beta,/ }).click();
  const panel = page.getByRole("dialog", { name: "beta details" });
  await showTerminal(panel);
  await expect(panel.locator(".xterm-rows")).toContainText("attached abcd1234");
  await page.getByRole("button", { name: /^settings$/i }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible();
  // xterm swallows a real Escape press itself; an Escape that does reach the page from inside the terminal must not close Settings.
  await panel.locator(".xterm-helper-textarea").dispatchEvent("keydown", { key: "Escape", bubbles: true });
  await expect(settings).toBeVisible();
  await expect(panel).toBeVisible();
  await removeProjectFolder(cwd);
});

test.describe("the terminal sheet over the town at 1280 x 800", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the_shown_terminal_is_at_least_100_by_40_with_the_icon_row_and_claudes_prompt_box_visible", async ({ page }) => {
    // Catches the wide panel coming back (95 x 25, prompt box below the fold) or a sheet that covers the icon row.
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "funtown-e2e-town-")));
    fake.reset();
    fake.promptAttach();
    await addProjectFolder(cwd);
    fake.list([listedBg("abcd1234-0000-4000-8000-000000000000", cwd, { name: "beta" })]);
    await page.goto("/");
    await expect(page.locator("canvas")).toHaveCount(1);
    await page.getByRole("button", { name: /^beta,/ }).click();
    const panel = page.getByRole("dialog", { name: "beta details" });
    await showTerminal(panel);
    const screen = panel.locator(".xterm-rows");
    await expect(screen).toContainText("attached abcd1234");
    const size = (await sizeShown(screen))!;
    expect(size.cols).toBeGreaterThanOrEqual(100);
    expect(size.rows).toBeGreaterThanOrEqual(40);
    console.log(`town terminal: ${size.cols}x${size.rows}`);
    const icons = page.getByRole("navigation", { name: "Controls" });
    await expect(icons).toBeInViewport({ ratio: 1 });
    const iconBox = (await icons.boundingBox())!;
    expect((await panel.boundingBox())!.y).toBeGreaterThanOrEqual(iconBox.y + iconBox.height);
    await expect(screen.getByText("PROMPT-BOX")).toBeInViewport({ ratio: 1 });
    await expect(panel.getByRole("textbox", { name: "Reply" })).toHaveCount(0);
    await removeProjectFolder(cwd);
  });

  test("the_early_client_starts_at_the_sheets_size_so_show_resizes_nothing", async ({ page }) => {
    // Catches the town's hidden terminal box drifting from its sheet, so Claude redraws the moment Show reveals it.
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "funtown-e2e-town-")));
    fake.reset();
    await addProjectFolder(cwd);
    const before = fake.attachPids("abcd1234").length;
    fake.list([listedBg("abcd1234-0000-4000-8000-000000000000", cwd, { name: "beta" })]);
    await page.goto("/");
    await expect(page.locator("canvas")).toHaveCount(1);
    await page.getByRole("button", { name: /^beta,/ }).click();
    await expect.poll(() => fake.attachPids("abcd1234").length).toBe(before + 1);
    const panel = page.getByRole("dialog", { name: "beta details" });
    await showTerminal(panel);
    const screen = panel.locator(".xterm-rows");
    await expect(screen).toContainText("attached abcd1234");
    const size = (await sizeShown(screen))!;
    expect(size.cols).toBeGreaterThanOrEqual(100);
    expect(size.rows).toBeGreaterThanOrEqual(40);
    expect(size.count).toBe(1);
    await removeProjectFolder(cwd);
  });
});
