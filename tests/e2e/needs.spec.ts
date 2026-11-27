import { expect, test, type Page } from "@playwright/test";
import { stubStream } from "./stream.ts";

const NOW = Date.now();
const lead = (over: Record<string, unknown>) => ({
  id: "s1", name: "lead-1", stage: "working", activity: null, step: null, tty: "ttys001", termProgram: "TestTerm",
  kind: "terminal", shortId: null, subagents: [], ...over,
});
const waiting = (id: string, name: string, since: number, over: Record<string, unknown> = {}) =>
  lead({ id, name, stage: "needs_you", needs: "waiting", since, ...over });
const house = (project: string, leads: unknown[]) => ({ project, cwd: `/work/${project}`, leads });
const town = (houses: unknown[], cards: unknown[] = []) => ({ claude: { version: "2.1.325", problems: [] }, houses, cards });

/** Counts what the page asks of Web Audio and of the Notification API; `notificationPermission` is what the page is told. */
const stubs = (permission: string) => `
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
    constructor(title, opts = {}) { this.title = title; this.body = opts.body; this.handlers = []; window.__notes.push(this); }
    addEventListener(t, f) { if (t === "click") this.handlers.push(f); }
    close() {}
    click() { if (this.onclick) this.onclick({}); this.handlers.forEach((f) => f({})); }
    static requestPermission() { Notification.permission = "granted"; window.__asked = (window.__asked || 0) + 1; return Promise.resolve("granted"); }
  }
  Notification.permission = ${JSON.stringify(permission)};
  window.Notification = Notification;
`;

/** Opens the page on a stubbed stream whose state `send` replaces. */
async function open(page: Page, initial: unknown, permission = "granted") {
  await page.addInitScript(stubs(permission));
  const stream = await stubStream(page, initial);
  await page.goto("/work.html");
  await expect(page.locator("section[aria-label]").first()).toBeVisible(); // the first state is in before a test sends the next
  return stream;
}
const queue = (page: Page) => page.getByRole("region", { name: "Needs you" });
const rows = (page: Page) => queue(page).getByRole("button");
const sounds = (page: Page) => page.evaluate(() => (window as unknown as { __starts: number }).__starts);
const popups = (page: Page) =>
  page.evaluate(() => (window as unknown as { __notes: { title: string; body: string }[] }).__notes.map((n) => ({ title: n.title, body: n.body })));
const panel = (page: Page, name: string) => page.getByRole("dialog", { name: `${name} details` });
const active = (page: Page) => page.evaluate(() => `${document.activeElement?.tagName}:${(document.activeElement as HTMLInputElement | null)?.value ?? ""}`);

const three = () =>
  town([
    house("zeta", [waiting("s1", "lead-1", NOW - 60_000, { needs: "permission" })]),
    house("alpha", [
      waiting("s2", "lead-2", NOW - 300_000, { needs: "stuck", reason: "rate limit" }),
      lead({ id: "s3", name: "lead-3", subagents: [{ id: "x1", name: "Explore-1", stage: "needs_you", activity: null, needs: "question", since: NOW - 120_000 }] }),
    ]),
  ]);

test("the_needs_you_list_has_every_waiting_character_cards_first_then_oldest_first_and_replaces_the_banner", async ({ page }) => {
  await open(page, three());
  await expect(rows(page)).toHaveCount(3);
  const text = await rows(page).allInnerTexts();
  // Cards first, oldest first: the question (2m) then the permission (1m); the 5m stuck one comes after them.
  expect(text[0]).toMatch(/Explore-1/);
  expect(text[0]).toMatch(/question/);
  expect(text[1]).toMatch(/zeta.*lead-1.*permission/s);
  expect(text[2]).toMatch(/alpha/);
  expect(text[2]).toMatch(/lead-2/);
  expect(text[2]).toMatch(/rate limit/);
  expect(text[2]).toMatch(/5\s?m/);
  await expect(page.getByText(/sessions? need you/i)).toHaveCount(0);

  await rows(page).nth(0).click();
  await expect(panel(page, "Explore-1")).toBeVisible();
});

test("space_opens_the_first_in_the_list_then_the_next_and_wraps_and_does_nothing_with_nothing_waiting", async ({ page }) => {
  const stream = await open(page, town([house("alpha", [lead({})])]));
  await page.keyboard.press("Space");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  stream.send(three());
  await page.reload();
  await expect(rows(page)).toHaveCount(3);
  // Catches the jump firing on any other plain key.
  await page.keyboard.press("n");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Space");
  await expect(panel(page, "Explore-1")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(panel(page, "lead-1")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(panel(page, "lead-2")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(panel(page, "Explore-1")).toBeVisible();
});

test("space_in_a_card_text_box_opens_nothing_and_is_text_and_a_new_card_or_waiting_character_leaves_focus_and_text_alone", async ({ page }) => {
  const plan = {
    id: "p1", lead: "b1", agent: null, kind: "plan", tool: "ExitPlanMode", input: { plan: "1. Do it" }, cwd: "/work/alpha", at: NOW - 1000,
  };
  const bg = waiting("b1", "bg-1", NOW - 1000, { kind: "background", shortId: "b1b1b1b1", needs: "plan", tty: null, termProgram: null });
  const stream = await open(page, town([house("alpha", [bg])], [plan]));
  const box = page.locator('section[aria-label="alpha"]').getByRole("textbox").first();
  await box.click();
  await page.keyboard.type("ab");
  await page.keyboard.press("Space");
  await expect(box).toHaveValue("ab ");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  stream.send(town([house("alpha", [bg, waiting("s2", "lead-2", NOW)]), house("beta", [waiting("s3", "lead-3", NOW)])], [plan, { ...plan, id: "p2", at: NOW }]));
  await expect(rows(page)).toHaveCount(3);
  await expect(page.getByRole("status").getByText("lead-3 needs you")).toBeVisible();
  expect(await active(page)).toBe("TEXTAREA:ab ");
  await page.keyboard.type("c");
  await expect(box).toHaveValue("ab c");
  // Catches the jump key firing while the user types in a text box.
  await page.keyboard.press("Space");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a_character_that_joins_plays_the_sound_shows_the_toast_and_system_pop_up_and_both_open_its_panel", async ({ page }) => {
  const stream = await open(page, town([house("alpha", [waiting("s1", "lead-1", NOW - 5000)]), house("beta", [lead({ id: "s2", name: "lead-2" })])]));
  await expect(rows(page)).toHaveCount(1);
  await page.waitForTimeout(400); // the stream re-sends the same state a few times
  expect(await sounds(page)).toBe(0);
  expect(await popups(page)).toEqual([]);
  await expect(page.getByRole("status").getByText("needs you")).toHaveCount(0);

  stream.send(town([house("alpha", [waiting("s1", "lead-1", NOW - 5000)]), house("beta", [waiting("s2", "lead-2", NOW, { needs: "permission" })])]));
  const toast = page.getByRole("status").getByText("lead-2 needs you");
  await expect(toast).toBeVisible();
  await expect(page.getByRole("status")).toContainText("beta: permission");
  await expect.poll(() => sounds(page)).toBeGreaterThan(0);
  expect(await popups(page)).toEqual([{ title: "lead-2 needs you", body: "beta: permission" }]);
  expect(await active(page)).toMatch(/^BODY/);

  await toast.click();
  await expect(panel(page, "lead-2")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { __notes: { click(): void }[] }).__notes[0].click());
  await expect(panel(page, "lead-2")).toBeVisible();
});

test("a_character_whose_since_changes_joins_again_and_one_that_stays_the_same_does_not", async ({ page }) => {
  const stream = await open(page, town([house("alpha", [lead({})])]));
  stream.send(town([house("alpha", [waiting("s1", "lead-1", NOW)])]));
  await expect.poll(() => popups(page).then((p) => p.length)).toBe(1);
  await page.waitForTimeout(400);
  expect(await popups(page)).toHaveLength(1);
  stream.send(town([house("alpha", [waiting("s1", "lead-1", NOW + 5000, { needs: "permission" })])]));
  await expect.poll(() => popups(page).then((p) => p.length)).toBe(2);
});

test("the_toast_goes_after_8_seconds", async ({ page }) => {
  await page.clock.install();
  const stream = await open(page, town([house("alpha", [lead({})])]));
  stream.send(town([house("alpha", [waiting("s1", "lead-1", NOW)])]));
  await page.clock.runFor(200);
  await expect(page.getByRole("status").getByText("lead-1 needs you")).toBeVisible();
  await page.clock.runFor(7000);
  await expect(page.getByRole("status").getByText("lead-1 needs you")).toBeVisible();
  await page.clock.runFor(2000);
  await expect(page.getByRole("status").getByText("lead-1 needs you")).toHaveCount(0);
});

test("mute_silences_the_sound_not_the_toast_and_is_still_on_after_a_reload", async ({ page }) => {
  const stream = await open(page, town([house("alpha", [lead({})])]));
  await page.getByRole("button", { name: /^mute$/i }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: /^unmute$/i })).toBeVisible();

  stream.send(town([house("alpha", [waiting("s1", "lead-1", NOW)])]));
  await expect(page.getByRole("status").getByText("lead-1 needs you")).toBeVisible();
  await page.waitForTimeout(300);
  expect(await sounds(page)).toBe(0);
});

test("the_pop_up_button_asks_for_permission_only_when_clicked_and_nothing_is_shown_without_it", async ({ page }) => {
  const stream = await open(page, town([house("alpha", [lead({})])]), "default");
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { __asked?: number }).__asked ?? 0)).toBe(0);
  stream.send(town([house("alpha", [waiting("s1", "lead-1", NOW)])]));
  await expect(page.getByRole("status").getByText("lead-1 needs you")).toBeVisible();
  expect(await popups(page)).toEqual([]);

  await page.getByRole("button", { name: /pop-?ups?|notifications?/i }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __asked?: number }).__asked ?? 0)).toBe(1);
});

test("a_state_from_a_restarted_server_shows_a_reload_banner_and_the_same_server_does_not", async ({ page }) => {
  // Catches a page left with a stale token after a restart, whose terminals and answers fail without a word.
  const stream = await open(page, { ...town([house("alpha", [lead({})])]), started: 1 });
  stream.send({ ...town([house("alpha", [waiting("s1", "lead-1", NOW)])]), started: 1 });
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByText(/Funtown restarted/)).toHaveCount(0);

  stream.send({ ...town([house("alpha", [lead({})])]), started: 2 });
  await expect(page.getByRole("alert").filter({ hasText: "Funtown restarted" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
});

const resting = (id: string, name: string, since: number) => waiting(id, name, since, { needs: "turn ended" });
const limited = (id: string, name: string, since: number) => waiting(id, name, since, { needs: "stuck", reason: "rate limit" });

test("a_resting_lead_and_a_rate_limited_one_join_the_list_last_without_a_toast_a_sound_or_a_pop_up", async ({ page }) => {
  const stream = await open(page, town([house("alpha", [lead({})])]));
  stream.send(
    town([
      house("alpha", [lead({}), resting("s2", "lead-2", NOW - 600_000), limited("s3", "lead-3", NOW - 300_000)]),
      house("beta", [waiting("s4", "lead-4", NOW, { needs: "permission" })]),
    ]),
  );
  // The loud one comes first although it waited least; a rate limit comes before a resting lead.
  await expect(rows(page)).toHaveCount(3);
  const text = await rows(page).allInnerTexts();
  expect(text[0]).toMatch(/lead-4/);
  expect(text[1]).toMatch(/lead-3/);
  expect(text[2]).toMatch(/lead-2/);
  await expect(page.getByRole("status").getByText("lead-4 needs you")).toBeVisible();
  await expect.poll(() => sounds(page)).toBeGreaterThan(0);
  expect(await popups(page)).toEqual([{ title: "lead-4 needs you", body: "beta: permission" }]);
  await expect(page.getByRole("status").getByText(/lead-[23] needs you/)).toHaveCount(0);

  // Quiet rows are drawn quieter than the loud one.
  const style = (row: number) =>
    rows(page).nth(row).evaluate((el) => ({ size: parseFloat(getComputedStyle(el).fontSize), colour: getComputedStyle(el.querySelector(".need")!).color }));
  const [loud, rate, rest] = [await style(0), await style(1), await style(2)];
  expect(rate.size).toBeLessThan(loud.size);
  expect(rest.size).toBeLessThan(loud.size);
  expect(rate.colour).not.toBe(loud.colour);
  expect(rest.colour).not.toBe(loud.colour);
});

test("a_resting_lead_that_starts_asking_alerts_then_and_one_that_stays_resting_never_does", async ({ page }) => {
  const stream = await open(page, town([house("alpha", [resting("s1", "lead-1", NOW - 5000)])]));
  stream.send(town([house("alpha", [resting("s1", "lead-1", NOW - 5000), resting("s2", "lead-2", NOW)])]));
  await expect(rows(page)).toHaveCount(2);
  await page.waitForTimeout(400);
  expect(await sounds(page)).toBe(0);
  expect(await popups(page)).toEqual([]);

  stream.send(town([house("alpha", [waiting("s1", "lead-1", NOW + 10, { needs: "question" }), resting("s2", "lead-2", NOW)])]));
  await expect(page.getByRole("status").getByText("lead-1 needs you")).toBeVisible();
  expect(await popups(page)).toEqual([{ title: "lead-1 needs you", body: "alpha: question" }]);
  await expect(page.getByRole("status").getByText("lead-2 needs you")).toHaveCount(0);
});

test("a_resting_lead_stays_at_its_house_in_the_town_and_raises_no_toast_while_an_asker_does", async ({ page }) => {
  await page.addInitScript(stubs("granted"));
  const stream = await stubStream(page, town([house("alpha", [lead({ id: "s2", name: "rester" })])]));
  await page.route("**/letters?*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  stream.send(
    town([house("alpha", [waiting("s1", "asker", NOW - 1000, { needs: "permission" }), waiting("s2", "rester", NOW, { needs: "turn ended", letter: NOW })])]),
  );
  // The town's hidden list keeps the resting lead in its house; only the asker is loud.
  await expect(page.getByRole("button", { name: /rester, alpha, lead, needs you: turn ended/ })).toBeVisible();
  await expect(page.getByRole("status").getByText("asker needs you")).toBeVisible();
  await expect(page.getByRole("status").getByText("rester needs you")).toHaveCount(0);
  expect(await popups(page)).toEqual([{ title: "asker needs you", body: "alpha: permission" }]);
});
