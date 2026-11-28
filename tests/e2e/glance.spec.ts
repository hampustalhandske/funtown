import { expect, test, type Page } from "@playwright/test";
import { alertStubs, house, lead, pr, red, stubStream, town, waiting, withPrs } from "./stream.ts";

const NOW = Date.now();

async function open(page: Page, initial: unknown) {
  await page.addInitScript(alertStubs);
  const stream = await stubStream(page, initial);
  await page.goto("/work.html");
  await expect(page.locator("section[aria-label]").first()).toBeVisible();
  return stream;
}
const houseOf = (page: Page, project: string) => page.locator(`section.house[aria-label="${project}"]`);
const queue = (page: Page) => page.getByRole("region", { name: "Needs you" });
const rows = (page: Page) => queue(page).getByRole("button");
const sounds = (page: Page) => page.evaluate(() => (window as unknown as { __starts: number }).__starts);
const popups = (page: Page) =>
  page.evaluate(() => (window as unknown as { __notes: { title: string; body: string }[] }).__notes.map((n) => ({ title: n.title, body: n.body })));

test("a_house_says_burning_or_handled_beside_its_name_and_a_green_pr_says_it_waits_only_where_no_lead_works", async ({ page }) => {
  // Catches a red PR with no word on the house, a handled fire shown as burning, and "waits for you" while someone works.
  await open(
    page,
    town([
      withPrs("alpha", [waiting("s1", "rester", NOW - 1000, { needs: "turn ended" })], [red(12), pr(13)]),
      withPrs("beta", [lead({ id: "s2", name: "fixer", kind: "background", shortId: "b2b2b2b2" })], [red(20), pr(21)]),
      withPrs("gamma", [lead({ id: "s3", name: "busy" })], [pr(30, { checks: "none" })]),
      withPrs("delta", [], [pr(40, { checks: "running" })]),
    ]),
  );
  await expect(houseOf(page, "alpha").getByRole("heading")).toContainText("burning");
  await expect(houseOf(page, "beta").getByRole("heading")).toContainText("handled");
  await expect(houseOf(page, "beta").getByRole("heading")).not.toContainText("burning");
  await expect(houseOf(page, "gamma").getByRole("heading")).not.toContainText(/burning|handled/);
  await expect(houseOf(page, "delta").getByRole("heading")).not.toContainText(/burning|handled/);

  const parcel = (project: string, n: number) => houseOf(page, project).locator("li.parcel", { hasText: `#${n} ` });
  await expect(parcel("alpha", 13)).toContainText("waits for you");
  await expect(parcel("alpha", 12)).not.toContainText("waits for you");
  await expect(parcel("beta", 21)).not.toContainText("waits for you");
  await expect(parcel("gamma", 30)).not.toContainText("waits for you");
  await expect(parcel("delta", 40)).not.toContainText("waits for you");
});

test("the_needs_you_list_has_a_burning_house_after_an_ask_and_a_waiting_pr_quiet_after_a_rate_limit_and_a_handled_fire_is_absent", async ({ page }) => {
  await open(
    page,
    town([
      withPrs("alpha", [waiting("s1", "lead-1", NOW - 60_000, { needs: "permission" })], [pr(1, { checks: "running" })]),
      withPrs("beta", [], [red(12), pr(13, { title: "Ready" })]),
      withPrs("gamma", [waiting("s2", "limited", NOW - 600_000, { needs: "stuck", reason: "rate limit" })], []),
      withPrs("delta", [lead({ id: "s3", name: "fixer" })], [red(30)]),
    ]),
  );
  // Ask, burning house (one entry, its oldest red PR), rate limit, waiting PR; delta's handled fire is not listed.
  await expect(rows(page)).toHaveCount(4);
  const text = await rows(page).allInnerTexts();
  expect(text[0]).toMatch(/alpha.*lead-1.*permission/s);
  expect(text[1]).toMatch(/beta/);
  expect(text[1]).toMatch(/#12/);
  expect(text[1]).toMatch(/burning: checks failed/);
  expect(text[1]).toMatch(/12\s?m/);
  expect(text[2]).toMatch(/gamma.*limited.*rate limit/s);
  expect(text[3]).toMatch(/beta/);
  expect(text[3]).toMatch(/#13/);
  expect(text[3]).toMatch(/waits for you/);
  await expect(queue(page)).not.toContainText("delta");

  // The waiting PR is drawn quieter than the burning one.
  const style = (row: number) => rows(page).nth(row).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(await style(3)).toBeLessThan(await style(1));
});

test("a_house_that_starts_burning_toasts_sounds_and_notifies_and_a_pr_that_starts_waiting_does_not", async ({ page }) => {
  const stream = await open(page, town([withPrs("alpha", [lead({})], [red(12)]), withPrs("beta", [lead({ id: "s2", name: "lead-2" })], [pr(13, { checks: "running" })])]));
  await page.waitForTimeout(400); // the stream re-sends the same state a few times
  expect(await sounds(page)).toBe(0);
  expect(await popups(page)).toEqual([]);

  // Alpha's lead stops working: the fire it held is no one's now. Beta's checks pass and its lead rests: its PR waits.
  stream.send(
    town([
      withPrs("alpha", [waiting("s1", "lead-1", NOW, { needs: "turn ended" })], [red(12)]),
      withPrs("beta", [waiting("s2", "lead-2", NOW, { needs: "turn ended" })], [pr(13)]),
    ]),
  );
  const toast = page.getByRole("status").getByText("alpha is burning: #12 checks failed");
  await expect(toast).toBeVisible();
  await expect.poll(() => sounds(page)).toBeGreaterThan(0);
  expect(await popups(page)).toEqual([{ title: "alpha is burning: #12 checks failed", body: "Broken build" }]);
  await expect(page.getByRole("status")).not.toContainText("beta");
  await expect(rows(page).filter({ hasText: "waits for you" })).toHaveCount(1);
});

/** The clock time the page shows for `at`, in the machine's own zone: two digits each. */
const clock = (at: number) => new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
/** A house under fog since `at` (its PR list last worked then); leave `at` out for one never read. */
const foggy = (project: string, leads: unknown[], parcels: unknown[], at?: number) => ({ ...house(project, leads), parcels, ...(at === undefined ? {} : { parcelsAt: at }) });

test("a_house_whose_prs_were_last_read_long_ago_or_never_says_so_beside_its_name_and_a_fresh_house_says_nothing", async ({ page }) => {
  // Catches fog with no words, the wrong time, and a house read a minute ago called foggy.
  const old = NOW - 10 * 60_000;
  await open(
    page,
    town([
      foggy("alpha", [waiting("s1", "rester", NOW - 1000, { needs: "turn ended" })], [pr(1)], old),
      foggy("beta", [], [pr(2)]),
      withPrs("gamma", [], [pr(3)]),
      { ...withPrs("delta", [], [pr(4)]), parcelsAt: NOW - 60_000 },
    ]),
  );
  await expect(houseOf(page, "alpha").getByRole("heading")).toContainText(`PRs last read ${clock(old)}`);
  await expect(houseOf(page, "beta").getByRole("heading")).toContainText("PRs not read yet");
  await expect(houseOf(page, "gamma").getByRole("heading")).not.toContainText("PRs");
  await expect(houseOf(page, "delta").getByRole("heading")).not.toContainText("PRs");
  // No PR waits for you where the list may be old.
  await expect(houseOf(page, "alpha").locator("li.parcel", { hasText: "#1 " })).not.toContainText("waits for you");
  await expect(houseOf(page, "gamma").locator("li.parcel", { hasText: "#3 " })).toContainText("waits for you");
});

test("a_fire_in_a_house_under_fog_is_the_first_quiet_entry_and_raises_no_toast_sound_or_notification", async ({ page }) => {
  // Catches a fire seen on an old list shouting like a live one, and a rate limit sorted before it.
  const limited = waiting("s1", "limited", NOW - 600_000, { needs: "stuck", reason: "rate limit" });
  const stream = await open(page, town([withPrs("alpha", [limited], []), withPrs("beta", [], [pr(13)])]));
  await page.waitForTimeout(400);
  expect(await sounds(page)).toBe(0);

  // Beta's list is now 10 minutes old and shows a failed PR.
  stream.send(town([withPrs("alpha", [limited], []), foggy("beta", [], [red(12), pr(13)], NOW - 10 * 60_000)]));
  await expect(rows(page).first()).toContainText("failed when last read");
  await expect(rows(page)).toHaveCount(2);
  const text = await rows(page).allInnerTexts();
  expect(text[0]).toMatch(/beta.*#12.*failed when last read/s);
  expect(text[1]).toMatch(/alpha.*limited.*rate limit/s);
  await expect(queue(page)).not.toContainText("waits for you");
  await page.waitForTimeout(400);
  expect(await sounds(page)).toBe(0);
  expect(await popups(page)).toEqual([]);
  await expect(page.getByRole("status")).not.toContainText("beta");
});

test("a_fire_in_a_house_under_fog_says_failed_when_last_read_beside_its_name_and_never_burning", async ({ page }) => {
  // Catches the plain list's badge showing a red "burning" for a fire Funtown can't be sure still burns.
  await open(
    page,
    town([
      foggy("zeta", [waiting("s1", "rester", NOW - 1000, { needs: "turn ended" })], [red(50)], NOW - 10 * 60_000),
      withPrs("alpha", [waiting("s2", "rester-2", NOW - 1000, { needs: "turn ended" })], [red(12)]),
    ]),
  );
  const heading = houseOf(page, "zeta").getByRole("heading");
  await expect(heading).toContainText("failed when last read");
  await expect(heading).toContainText(/PRs last read \d\d:\d\d/);
  await expect(heading).not.toContainText("burning");
  await expect(houseOf(page, "alpha").getByRole("heading")).toContainText("burning");
  // Only a sure fire is red.
  await expect(page.locator(".badge.burning")).toHaveCount(1);
});

test("a_frame_is_judged_by_the_clock_of_its_arrival_not_by_the_last_5_second_tick", async ({ page }) => {
  // Catches a house that went 3 minutes without a PR read staying calm until the page's own 5 s clock next ticked.
  const read = new Date(2026, 10, 28, 14, 0, 0).getTime();
  await page.clock.install({ time: read });
  await open(page, town([withPrs("alpha", [waiting("s1", "rester", read, { needs: "turn ended" })], [pr(1)], { parcelsAt: read })]));
  await page.clock.pauseAt(new Date(2026, 10, 28, 14, 1, 0));
  await expect(houseOf(page, "alpha").getByRole("heading")).not.toContainText("PRs");
  // The clock jumps to 14:05 with no timer firing; the next frame the stream sends is judged by it.
  await page.clock.setFixedTime(new Date(2026, 10, 28, 14, 5, 0));
  await expect(houseOf(page, "alpha").getByRole("heading")).toContainText(`PRs last read ${clock(read)}`);
});
