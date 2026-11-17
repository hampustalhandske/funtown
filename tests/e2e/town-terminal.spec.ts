import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { E2E_FAKE_DIR, FakeClaude, listedBg } from "../fake-claude.ts";
import { addProjectFolder, removeProjectFolder } from "./stream.ts";

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
