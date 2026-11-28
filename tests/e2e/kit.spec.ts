import { expect, test } from "@playwright/test";

test("the_kit_page_draws_a_canvas_with_no_console_errors_or_failed_requests", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("response", (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  await page.goto("/kit.html");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByText("queen (steward)")).toBeVisible();
  // The animal folk, beside the classroom's parts: each role's animal and the lead's captain's cap.
  for (const name of ["lead, cat", "implementer, beaver", "explorer, hare", "test-writer, hedgehog", "*review*, owl", "captain's cap"]) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  // The ask flag in its three modes.
  for (const name of ["flag, waving", "flag, still", "flag, furled"]) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
});
