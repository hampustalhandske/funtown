import { expect, test, type Page } from "@playwright/test";
import { house, lead, stubStream, town, waiting } from "./stream.ts";

const NOW = Date.now();

/** Counts what the page asks of Web Audio and of the Notification API (granted). */
const stubs = `
  window.__starts = 0; window.__notes = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  class AudioContext {
    constructor() { this.currentTime = 0; this.destination = {}; this.state = "running"; }
    resume() { return Promise.resolve(); }
    createGain() { return { gain: param(), connect: (x) => x, disconnect() {} }; }
    createOscillator() { return { frequency: param(), detune: param(), type: "sine", connect: (x) => x, disconnect() {}, start() { window.__starts++; }, stop() {}, addEventListener() {} }; }
  }
  window.AudioContext = AudioContext; window.webkitAudioContext = AudioContext;
  class Notification {
    constructor(title, opts = {}) { this.title = title; this.body = opts.body; window.__notes.push(this); }
    close() {}
    static requestPermission() { return Promise.resolve("granted"); }
  }
  Notification.permission = "granted";
  window.Notification = Notification;
`;

const pr = (number: number, over: Record<string, unknown> = {}) => ({ number, title: `PR ${number}`, url: `https://example.test/${number}`, draft: false, checks: "green", ...over });
/** A house in `/work/<project>` with `parcels`. */
const withPrs = (project: string, leads: unknown[], parcels: unknown[]) => ({ ...house(project, leads), parcels });
const red = (number: number, minutesAgo = 12) => pr(number, { checks: "red", redAt: NOW - minutesAgo * 60_000 });

async function open(page: Page, initial: unknown) {
  await page.addInitScript(stubs);
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
  expect(await popups(page)).toEqual([{ title: "alpha is burning: #12 checks failed", body: "PR 12" }]);
  await expect(page.getByRole("status")).not.toContainText("beta");
  await expect(rows(page).filter({ hasText: "waits for you" })).toHaveCount(1);
});
