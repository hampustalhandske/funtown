import { expect, test } from "@playwright/test";

test("the_kit_page_draws_a_canvas_with_no_console_errors_or_failed_requests", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("response", (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  await page.goto("/kit.html");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByText("queen (steward)")).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
});
