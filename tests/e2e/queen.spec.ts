import { expect, test, type Locator, type Page } from "@playwright/test";
import { stubStream } from "./stream.ts";
import { asker, asks, cardIn, HIGH, implementer, ledger, MEDIUM, NOW, permission } from "./briefs.ts";

// The Queen's slot on a card: her word from the card's `word` field, asked for by the button or Q. The page's clock is
// paused once the list is in, so the 1 s arm and the 1.5 s undo window pass only on `clock.runFor`.

const WORD_TEXT = ["Pick: Migrate now", "Why: Step 3 says the nightly report must keep working, and only the old table feeds it.", "Check first: That the report reads **only** invoices_v1."].join("\n");
/** The listed steward (the Queen's session), working unless `stage` says otherwise. */
const queen = (stage = "working") => ({
  id: "st1", name: "steward", stage, activity: null, step: null, needs: null, tty: null, termProgram: null, kind: "background", shortId: "st1", subagents: [], steward: true,
});
/** The ledgerline state with `cards`, and the Queen's own house when `steward` is given. */
const town = (cards: unknown[], steward?: unknown, leads: unknown[] = [asker()]) => {
  const base = ledger(leads, cards);
  return steward ? { ...base, houses: [...base.houses, { project: "steward", cwd: "/home/me/.funtown/steward", leads: [steward] }] } : base;
};
/** A medium question card whose `word` is as given (absent when `word` is undefined). */
const withWord = (word?: Record<string, unknown>, questions = MEDIUM, level = "medium") =>
  asks([questions], [level], [0], word ? { word } : {});

/**
 * Opens the plain list on a stubbed stream with the clock paused. Records each POST /answer and POST /word body; /word
 * replies `wordStatus`, and GET /letters?lead=&id= gives her word text for id "w1" and records its query.
 */
async function open(page: Page, initial: unknown, wordStatus = 204) {
  const answers: unknown[] = [];
  const words: unknown[] = [];
  const fetched: string[] = [];
  const stream = await stubStream(page, initial);
  await page.route("**/answer", (r) => {
    answers.push(r.request().postDataJSON());
    return r.fulfill({ status: 204, contentType: "text/plain", body: "" });
  });
  await page.route("**/word", (r) => {
    words.push(r.request().postDataJSON());
    return r.fulfill({ status: wordStatus, contentType: "text/plain", body: "" });
  });
  await page.route("**/letters?*", (r) => {
    const url = new URL(r.request().url());
    if (url.searchParams.get("id") === null) return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    fetched.push(url.search);
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "w1", from: "st1", name: "steward", text: WORD_TEXT, at: NOW }]) });
  });
  await page.clock.install();
  await page.goto("/work.html");
  await expect(page.locator("section[aria-label]").first()).toBeVisible();
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  return { answers, words, fetched, send: stream.send };
}

/** The Queen's slot on a card. */
const slot = (brief: Locator) => brief.getByRole("region", { name: "The Queen" });
/** Opens the card and waits out its first second, so Enter and Q would act on it. */
async function armed(page: Page) {
  const brief = await cardIn(page, "csv-export");
  await page.clock.runFor(1000);
  await expect(brief.getByRole("button", { name: "Ask the Queen" }).locator("kbd")).toHaveText("Q");
  return brief;
}
/** Gives the network a moment, so a request that wrongly went out has been recorded before the test says none did. */
const settle = (page: Page) => page.waitForTimeout(200);

test("a_card_without_a_word_has_no_queen_slot", async ({ page }) => {
  // Catches a button for a word that is off (or the steward's own card), which could only be refused.
  await open(page, town([withWord()]));
  const brief = await cardIn(page, "csv-export");
  await expect(brief.getByRole("button", { name: /Raw detail/ })).toBeVisible();
  await expect(slot(brief)).toHaveCount(0);
  await expect(brief.getByRole("button", { name: /Ask the Queen/ })).toHaveCount(0);
});

test("an_idle_word_offers_the_button_and_one_click_posts_the_card_to_word", async ({ page }) => {
  // Catches a button that does nothing, or one that posts the wrong card.
  const { words } = await open(page, town([withWord({ state: "idle" })]));
  const brief = await cardIn(page, "csv-export");
  await expect(slot(brief)).toContainText("Her second opinion, when you ask.");
  await slot(brief).getByRole("button", { name: "Ask the Queen" }).click();
  await expect.poll(() => words).toEqual([{ card: "q1" }]);
});

test("a_word_that_is_queued_says_starting_without_a_steward_and_busy_with_a_working_one", async ({ page }) => {
  // Catches a user told to wait for a session that isn't there, or told she is starting when she is only busy.
  const { send } = await open(page, town([withWord({ state: "queued" })]));
  const brief = await cardIn(page, "csv-export");
  await expect(slot(brief)).toContainText("The Queen is coming");
  await expect(slot(brief)).toContainText("Starting her session. Your card is first.");
  await expect(slot(brief).getByRole("button")).toHaveCount(0);
  send(town([withWord({ state: "queued" })], queen()));
  await expect(slot(brief)).toContainText("The Queen is busy", { timeout: 10_000 });
  await expect(slot(brief)).toContainText("Your card is next.");
});

test("a_word_being_written_says_so_and_offers_no_button", async ({ page }) => {
  // Catches a second press while her word is on its way (the cost the ADR guards).
  await open(page, town([withWord({ state: "writing" })], queen()));
  const brief = await cardIn(page, "csv-export");
  await expect(slot(brief)).toContainText("The Queen is writing");
  await expect(slot(brief)).toContainText("Usually under a minute.");
  await expect(slot(brief).getByRole("button")).toHaveCount(0);
});

test("a_ready_word_shows_her_letter_fetched_by_id_as_written_with_no_raw_html", async ({ page }) => {
  // Catches the wrong letter (the newest instead of hers), a flattened word, and raw HTML getting through.
  const { fetched } = await open(page, town([withWord({ state: "ready", letter: "w1" })], queen("idle")));
  const brief = await cardIn(page, "csv-export");
  await expect(slot(brief)).toContainText("The Queen's word");
  await expect(slot(brief)).toContainText("Pick: Migrate now");
  await expect(slot(brief).locator("strong")).toHaveText("only");
  // The card shows in the list row and in the pane, so it is fetched once for each.
  expect([...new Set(fetched)]).toEqual(["?lead=st1&id=w1"]);
  await expect(slot(brief).getByRole("button")).toHaveCount(0);
  // The three parts stay on their own lines.
  const lines = await slot(brief).locator(".q-word p").evaluate((p) => (p as HTMLElement).innerText.split("\n").map((l) => l.split(":")[0]));
  expect(lines).toEqual(["Pick", "Why", "Check first"]);
});

test("a_ready_word_never_marks_her_pick_on_the_options", async ({ page }) => {
  // Catches Funtown dressing her advice as the agent's pick (ADR 0003): the ribbon stays on the agent's option alone.
  await open(page, town([withWord({ state: "ready", letter: "w1" })], queen("idle")));
  const brief = await cardIn(page, "csv-export");
  await expect(slot(brief)).toContainText("Pick: Migrate now");
  await expect(brief.locator(".ribbon")).toHaveCount(1);
  await expect(brief.locator(".tile").filter({ hasText: "Keep both" }).locator(".ribbon")).toHaveText("Agent's pick");
  await expect(brief.locator(".tile.on")).toHaveCount(1);
  await expect(brief.locator(".tile.on")).toContainText("Keep both");
});

test("a_failed_word_shows_why_and_only_then_offers_ask_again", async ({ page }) => {
  // Catches a failure with no reason, and a retry that is not one deliberate press.
  const { words } = await open(page, town([withWord({ state: "failed", reason: "no reply in 5 minutes" })], queen("idle")));
  const brief = await cardIn(page, "csv-export");
  await expect(slot(brief)).toContainText("No word from the Queen");
  await expect(slot(brief)).toContainText("no reply in 5 minutes");
  await slot(brief).getByRole("button", { name: "Ask again" }).click();
  await expect.poll(() => words).toEqual([{ card: "q1" }]);
});

test("a_refused_ask_shows_its_reason_in_the_slot", async ({ page }) => {
  // Catches a press that fails with no word on screen (the server's 409 and 404 carry no body, so the page words them).
  await open(page, town([withWord({ state: "idle" })]), 409);
  const brief = await cardIn(page, "csv-export");
  await slot(brief).getByRole("button", { name: "Ask the Queen" }).click();
  await expect(slot(brief).getByRole("alert")).toHaveText("The Queen's word is off, or this is her own card.");
});

/** Whether the slot comes after the card's act row in the page (not by position: the act row sticks to the panel's bottom). */
const slotAfterAct = (brief: Locator) =>
  slot(brief).evaluate((queen) => !!(queen.parentElement!.querySelector(".act")!.compareDocumentPosition(queen) & Node.DOCUMENT_POSITION_FOLLOWING));

test("the_slot_sits_under_the_act_row_on_a_light_card", async ({ page }) => {
  // Catches a light card whose act row is pushed down by the second opinion.
  await open(page, town([withWord({ state: "idle" })]));
  expect(await slotAfterAct(await cardIn(page, "csv-export"))).toBe(true);
});

test("the_slot_sits_above_the_act_row_on_a_heavy_card", async ({ page }) => {
  // Catches a heavy card whose act row comes before the Queen is offered.
  await open(page, town([asks([HIGH], ["high"], [0], { word: { state: "idle" } })]));
  expect(await slotAfterAct(await cardIn(page, "csv-export"))).toBe(false);
});

test("a_permission_card_has_the_slot_too", async ({ page }) => {
  // Catches a slot built only into the question branch.
  const card = permission({ command: "npm test", description: "Run the tests" }, { level: "medium", reason: "Funtown's rule: unknown command", source: "rule" });
  await open(page, town([{ ...card, word: { state: "idle" } }], undefined, [asker({ stage: "working", subagents: [implementer] })]));
  const brief = await cardIn(page, "implementer-1");
  await expect(slot(brief).getByRole("button", { name: "Ask the Queen" })).toBeVisible();
});

test("q_waits_the_cards_first_second_then_asks_after_the_undo_window", async ({ page }) => {
  // Catches a Q that arrives with the card being sent, and an ask with no time to undo.
  const { words } = await open(page, town([withWord({ state: "idle" })]));
  const brief = await cardIn(page, "csv-export");
  const button = brief.getByRole("button", { name: "Ask the Queen" });
  await page.clock.runFor(999);
  await expect(button.locator("kbd")).toHaveCount(0);
  await page.keyboard.press("q");
  await expect(slot(brief)).not.toContainText("Asking the Queen");
  await page.clock.runFor(1);
  await expect(button.locator("kbd")).toHaveText("Q");
  await page.keyboard.press("q");
  await expect(slot(brief)).toContainText("Asking the Queen... Esc to undo");
  await page.clock.runFor(1499);
  await settle(page);
  expect(words).toEqual([]);
  await page.clock.runFor(1);
  await expect.poll(() => words).toEqual([{ card: "q1" }]);
});

test("esc_in_the_asking_window_stops_the_ask_and_leaves_the_pane_open", async ({ page }) => {
  // Catches an ask that can't be caught, or an Esc that closes the pane instead.
  const { words } = await open(page, town([withWord({ state: "idle" })]));
  const brief = await armed(page);
  await page.keyboard.press("q");
  await expect(slot(brief)).toContainText("Asking the Queen");
  await page.keyboard.press("Escape");
  await expect(slot(brief)).not.toContainText("Asking the Queen");
  await expect(slot(brief)).toContainText("Her second opinion, when you ask.");
  await expect(page.getByRole("dialog", { name: "csv-export details" })).toBeVisible();
  await page.clock.runFor(3000);
  await settle(page);
  expect(words).toEqual([]);
});

test("space_in_the_asking_window_sends_the_ask_at_once", async ({ page }) => {
  // Catches a Space that moves on and leaves the ask hanging, or waits out the rest of the window.
  const { words } = await open(page, town([withWord({ state: "idle" })]));
  await armed(page);
  await page.keyboard.press("q");
  await page.keyboard.press(" ");
  await expect.poll(() => words).toEqual([{ card: "q1" }]);
});

test("q_on_a_failed_word_asks_again", async ({ page }) => {
  // Catches a retry that needs the mouse.
  const { words } = await open(page, town([withWord({ state: "failed", reason: "no reply in 5 minutes" })], queen("idle")));
  const brief = await cardIn(page, "csv-export");
  await page.clock.runFor(1000);
  await expect(brief.getByRole("button", { name: "Ask again" }).locator("kbd")).toHaveText("Q");
  await page.keyboard.press("q");
  await page.clock.runFor(1500);
  await expect.poll(() => words).toEqual([{ card: "q1" }]);
});

for (const word of [{ state: "queued" }, { state: "writing" }, { state: "ready", letter: "w1" }, undefined]) {
  test(`q_asks_nothing_when_her_word_is_${word?.state ?? "off"}`, async ({ page }) => {
    // Catches a press that costs usage while her word is queued, writing or ready, and one with the word off.
    const { words } = await open(page, town([withWord(word)], queen()));
    const brief = await cardIn(page, "csv-export");
    await page.clock.runFor(1000);
    await expect(brief.getByRole("button", { name: /Raw detail/ })).toBeVisible();
    await page.keyboard.press("q");
    await page.clock.runFor(3000);
    await settle(page);
    expect(words).toEqual([]);
    await expect(page.getByText("Asking the Queen")).toHaveCount(0);
  });
}

test("q_is_not_armed_with_two_cards_in_the_pane", async ({ page }) => {
  // Catches a Q that could ask about the wrong card of two (ADR 0004's rule, shared).
  const { words } = await open(page, town([withWord({ state: "idle" }), { ...withWord({ state: "idle" }), id: "q2" }]));
  await cardIn(page, "csv-export");
  await page.clock.runFor(1000);
  await page.keyboard.press("q");
  await page.clock.runFor(3000);
  await settle(page);
  expect(words).toEqual([]);
});

test("enter_still_sends_the_agents_pick_when_her_word_is_ready", async ({ page }) => {
  // Catches Funtown answering from her word (ADR 0003): her pick is Migrate now, the agent's is Keep both.
  const { answers } = await open(page, town([withWord({ state: "ready", letter: "w1" })], queen("idle")));
  const brief = await cardIn(page, "csv-export");
  await expect(slot(brief)).toContainText("Pick: Migrate now");
  await page.clock.runFor(1000);
  await expect(brief.getByRole("button", { name: "Send: Keep both" }).locator("kbd")).toHaveText("Enter");
  await page.keyboard.press("Enter");
  await page.clock.runFor(1500);
  await expect.poll(() => answers).toEqual([{ card: "q1", decision: "allow", answers: { [MEDIUM.question]: "Keep both (Recommended)" } }]);
});

