import { expect, test, type Page } from "@playwright/test";
import { alertStubs, house, lead, stubStream, town, waiting } from "./stream.ts";

const asking = (id: string, name: string, since: number) => waiting(id, name, since, { needs: "permission" });
const sounds = (page: Page) => page.evaluate(() => (window as unknown as { __starts: number }).__starts);
const fogLine = (page: Page) => page.getByText(/^(Lost the server|Could not list sessions)/);
const cantSee = (page: Page) => page.getByRole("img", { name: /^Can't see/ });

/** Opens `path` on a stubbed stream under Playwright's clock: it starts at 14:00 local on a fixed day and, once the page is up, stands still at 14:01 until a test moves it. */
async function open(page: Page, path: string, initial: unknown) {
  await page.addInitScript(alertStubs);
  await page.clock.install({ time: new Date(2026, 10, 28, 14, 0, 0) });
  const stream = await stubStream(page, initial);
  await page.goto(path);
  await page.clock.pauseAt(new Date(2026, 10, 28, 14, 1, 0));
  return stream;
}

/** Takes the stream away and runs the page's clock until its 3 s without the server have passed. */
async function loseFor3s(page: Page, stream: { lose: () => void }) {
  stream.lose();
  await page.waitForEvent("requestfailed");
  // The first failure may land a moment after this call; two seconds is under the 3 s either way.
  await page.clock.fastForward(2000);
}

test("the_plain_list_says_it_lost_the_server_only_after_3_seconds_and_the_line_goes_when_the_stream_returns", async ({ page }) => {
  // Catches a town that looks calm with the server gone, a line before the 3 s, and a line that stays once the stream is back.
  const now = Date.now();
  const stream = await open(page, "/work.html", town([house("alpha", [asking("s1", "lead-1", now - 60_000)])]));
  await expect(page.getByRole("region", { name: "Needs you" })).toBeVisible();
  await expect(fogLine(page)).toHaveCount(0);

  await loseFor3s(page, stream);
  await expect(fogLine(page)).toHaveCount(0);
  await expect
    .poll(async () => {
      await page.clock.fastForward(500);
      return fogLine(page).count();
    })
    .toBe(1);
  await expect(fogLine(page)).toHaveText(/^Lost the server at 14:0\d: this is the town as it was then\.$/);
  // The town as it was stays on the page.
  await expect(page.getByRole("region", { name: "Needs you" })).toContainText("lead-1");

  stream.send(town([house("alpha", [asking("s1", "lead-1", now - 60_000)])]));
  await expect(fogLine(page)).toHaveCount(0);
});

test("nothing_chimes_while_the_server_is_lost_what_was_known_does_not_chime_again_on_return_and_news_does", async ({ page }) => {
  // Catches a sound for the ask the page already knew when the stream returns, none for a real new ask, and one while lost.
  const now = Date.now();
  const known = asking("s1", "lead-1", now - 60_000);
  const stream = await open(page, "/work.html", town([house("alpha", [known])]));
  await expect(page.getByRole("region", { name: "Needs you" })).toContainText("lead-1");
  expect(await sounds(page)).toBe(0);

  stream.lose();
  await expect.poll(async () => {
    await page.clock.fastForward(1000);
    return fogLine(page).count();
  }).toBe(1);
  await page.clock.fastForward(10_000);
  expect(await sounds(page)).toBe(0);

  stream.send(town([house("alpha", [known])]));
  await expect(fogLine(page)).toHaveCount(0);
  expect(await sounds(page)).toBe(0);

  stream.send(town([house("alpha", [known, asking("s2", "lead-2", now)])]));
  await expect.poll(() => sounds(page)).toBeGreaterThan(0);
});

test("the_town_page_shows_one_cant_see_icon_with_the_reason_while_the_server_is_lost_and_none_once_it_returns", async ({ page }) => {
  // Catches no icon on the town page, an icon with no reason, a veil, and an icon left after the stream is back.
  const stream = await open(page, "/", town([house("alpha", [lead({})])]));
  await expect(page.getByRole("navigation", { name: "Controls" })).toBeVisible();
  await expect(cantSee(page)).toHaveCount(0);

  await loseFor3s(page, stream);
  await expect(cantSee(page)).toHaveCount(0);
  await expect
    .poll(async () => {
      await page.clock.fastForward(500);
      return cantSee(page).count();
    })
    .toBe(1);
  await expect(cantSee(page)).toHaveAttribute("aria-label", /^Can't see: lost the server at 14:0\d$/);
  await expect(cantSee(page)).toHaveAttribute("title", /^Can't see: lost the server at 14:0\d$/);
  await expect(page.getByRole("navigation", { name: "Controls" }).getByRole("img")).toHaveCount(1);

  stream.send(town([house("alpha", [lead({})])]));
  await expect(cantSee(page)).toHaveCount(0);
});

test("a_session_list_that_stopped_working_says_since_when_in_the_plain_list_and_a_known_ask_stays_loud", async ({ page }) => {
  // Catches a list that is 40 s old shown as fresh, a failing list treated as a lost server, and the asks going quiet with it.
  const stale = new Date(2026, 10, 28, 13, 59, 20).getTime(); // 40 s before the page's clock
  const known = asking("s1", "lead-1", stale);
  const failing = { ...town([house("alpha", [known])]), listedAt: stale };
  const stream = await open(page, "/work.html", failing);
  await expect(fogLine(page)).toHaveText("Could not list sessions since 13:59.");
  await expect(page.getByRole("region", { name: "Needs you" })).toContainText("lead-1");

  // A new ask while only the list fails still chimes.
  stream.send({ ...failing, houses: [house("alpha", [known, asking("s2", "lead-2", stale + 1000)])] });
  await expect.poll(() => sounds(page)).toBeGreaterThan(0);

  // The list works again: the line goes with the next frame.
  stream.send({ ...failing, listedAt: Number.MAX_SAFE_INTEGER });
  await expect(fogLine(page)).toHaveCount(0);
});

test("the_town_page_shows_the_cant_see_icon_for_a_failing_list_and_not_for_an_old_claude_code", async ({ page }) => {
  // Catches the icon missing when the list fails, and a version problem making fog.
  const stale = new Date(2026, 10, 28, 13, 59, 20).getTime();
  const stream = await open(page, "/", { ...town([house("alpha", [lead({})])]), listedAt: stale });
  await expect(cantSee(page)).toHaveAttribute("aria-label", "Can't see: could not list sessions since 13:59");

  stream.send({ ...town([house("alpha", [lead({})])]), claude: { version: "2.1.1", problems: ["Claude Code 2.1.1 is older than 2.1.325."] } });
  await expect(cantSee(page)).toHaveCount(0);
});
