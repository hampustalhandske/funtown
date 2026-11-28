import { expect, test, type Page } from "@playwright/test";
import { alertStubs, house, lead, pr, red, stubStream, town, withPrs } from "./stream.ts";

// The parcels: finished PRs lie on the pile by the Queen's seat and a lead carries a new one up. The town is a canvas, so the
// words read the hidden list that says what the picture shows; a click goes through the canvas itself.

const steward = lead({ id: "st1", name: "steward", kind: "background", shortId: "st1short", steward: true, stage: "needs_you", needs: "turn ended", since: 2 });
/** The state: alpha's lead `lead-1` works, with `parcels`; the steward is listed. */
const state = (parcels: unknown[]) => town([withPrs("alpha", [lead({ id: "s1", name: "lead-1" })], parcels), house("steward", [steward])]);
const item = (page: Page, name: RegExp) => page.getByRole("list", { name: "Town" }).getByRole("button", { name });

/** Opens the town on `initial`; every console error and failed request is gathered in `problems`, and no PR page is ever asked for. */
async function open(page: Page, initial: unknown) {
  const problems: string[] = [];
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("response", (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  const requested: string[] = [];
  await page.context().route("https://example.test/**", (r) => {
    requested.push(r.request().url());
    return r.fulfill({ status: 200, contentType: "text/html", body: "<title>pr</title>" });
  });
  await page.addInitScript(alertStubs);
  await page.route("**/letters?*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  const stream = await stubStream(page, initial);
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(item(page, /^lead-1,/)).toBeVisible();
  await page.waitForTimeout(1200); // the camera settles on the scene it fits
  return { stream, problems, requested };
}

test("finished_parcels_say_the_castle_and_running_or_failed_ones_their_house_and_the_word_follows_the_checks", async ({ page }) => {
  // Catches a parcel the list puts at the wrong place, or one that stays at its house after its checks passed.
  const { stream, problems } = await open(page, state([pr(1), pr(2, { checks: "none" }), pr(3, { checks: "running" }), red(4)]));
  const label = (n: number) => item(page, new RegExp(`^#${n} `));
  await expect(label(1)).toHaveAccessibleName(/, at the castle$/);
  await expect(label(2)).toHaveAccessibleName(/, at the castle$/);
  await expect(label(3)).toHaveAccessibleName(/, at its house$/);
  await expect(label(4)).toHaveAccessibleName(/, at its house$/);
  stream.send(state([pr(1), pr(2, { checks: "none" }), pr(3), red(4)]));
  await expect(label(3)).toHaveAccessibleName(/, at the castle$/, { timeout: 10_000 });
  await expect(label(4)).toHaveAccessibleName(/, at its house$/);
  expect(problems).toEqual([]);
});

test("a_pile_of_five_with_a_ready_review_draws_with_no_errors_and_each_parcel_stays_in_the_list", async ({ page }) => {
  const parcels = [1, 2, 3, 4, 5].map((n) => pr(n, n === 2 ? { review: { state: "ready", steward: "st1", letter: "L1" } } : {}));
  const { problems } = await open(page, state(parcels));
  for (const n of [1, 2, 3, 4, 5]) await expect(item(page, new RegExp(`^#${n} `))).toHaveAccessibleName(/, at the castle$/);
  await expect(item(page, /^#2 /)).toHaveAccessibleName(/review ready/);
  expect(problems).toEqual([]);
});

test("a_parcel_whose_checks_pass_is_carried_up_by_its_lead_who_walks_home_and_the_town_never_asks_for_its_page", async ({ page }) => {
  // Catches a finished PR that appears with nobody bringing it, a carry that never ends, or a click-free visit to GitHub.
  test.setTimeout(90_000);
  const { stream, requested } = await open(page, state([pr(1, { checks: "running" })]));
  await expect(item(page, /^lead-1,/)).not.toHaveAccessibleName(/carrying|walking/);
  stream.send(state([pr(1)]));
  await expect(item(page, /^lead-1,/)).toHaveAccessibleName(/, carrying a parcel$/, { timeout: 10_000 });
  await expect(item(page, /^#1 /)).toHaveAccessibleName(/, at the castle$/);
  await expect(item(page, /^lead-1,/)).toHaveAccessibleName(/, walking home$/, { timeout: 30_000 });
  await expect(item(page, /^lead-1,/)).not.toHaveAccessibleName(/carrying|walking/, { timeout: 40_000 });
  expect(requested).toEqual([]);
});

test("a_parcel_that_was_already_finished_when_the_page_opened_is_laid_with_no_carry", async ({ page }) => {
  // Catches a reload that sends every lead up the stair with the whole pile.
  await open(page, state([pr(1), pr(2)]));
  await page.waitForTimeout(800);
  await expect(item(page, /^lead-1,/)).not.toHaveAccessibleName(/carrying|walking/);
});

/**
 * Moves the pointer over the part of the canvas where the pile lies until the hover plate named `plate` shows, and leaves it
 * there; false when it never does. The pile's place is read off the default 1280 by 720 screen.
 */
async function pointAt(page: Page, plate: RegExp): Promise<boolean> {
  const shown = page.locator(".plate", { hasText: plate });
  for (let y = 170; y <= 260; y += 4) {
    for (let x = 690; x <= 800; x += 4) {
      await page.mouse.move(x, y);
      if ((await shown.count()) > 0) return true;
    }
  }
  return false;
}

test("clicking_a_parcel_on_the_pile_opens_its_pr_pane_and_a_ready_one_the_queens_review", async ({ page }) => {
  // Catches a pile whose boxes take no clicks, or one that opens GitHub or the wrong panel.
  const parcels = [pr(1), pr(2, { review: { state: "ready", steward: "st1", letter: "L1" } })];
  const { requested } = await open(page, state(parcels));
  await page.route("**/letters?lead=st1&id=L1", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "L1", from: "st1", name: "steward", text: "Looks fine", at: 1 }]) }),
  );
  expect(await pointAt(page, /#1 PR 1/)).toBe(true);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "Pull request 1" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await pointAt(page, /#2 PR 2/)).toBe(true);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "steward details" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Pull request 2" })).toHaveCount(0);
  expect(requested).toEqual([]);
});
