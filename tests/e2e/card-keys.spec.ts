import { expect, test, type Locator, type Page } from "@playwright/test";
import { stubStream } from "./stream.ts";
import { asker, asks, cardIn, EXTRAS, HIGH, ledger, MEDIUM, MEDIUM_PLAN, MIN, NO_PICK, NOW, permission, planned } from "./briefs.ts";

// The keys on an open card: Enter only when the card is armed, the undo window, 1 to 4 and D. The page's clock is
// paused once the list is in, so the 1 s arm and the 1.5 s undo window pass only on `clock.runFor`.

/** Opens the plain list on a stubbed stream with the clock paused; records each POST /answer body and replies with `status`. */
async function open(page: Page, initial: unknown, status = 204) {
  const answers: unknown[] = [];
  const stream = await stubStream(page, initial);
  await page.route("**/answer", (r) => {
    answers.push(r.request().postDataJSON());
    return r.fulfill({ status, contentType: "text/plain", body: "" });
  });
  await page.route("**/letters?*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.clock.install();
  await page.goto("/work.html");
  await expect(page.locator("section[aria-label]").first()).toBeVisible();
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  return { answers, send: stream.send };
}

/** The card's undo window, while it shows. */
const sending = (brief: Locator) => brief.getByRole("status").filter({ hasText: "Sending" });
/** Gives the network a moment, so a send that wrongly went out has been recorded before the test says none did. */
const settle = (page: Page) => page.waitForTimeout(200);

test("enter_waits_for_the_cards_first_second_then_sends_the_pick_after_the_undo_window", async ({ page }) => {
  // Catches a card that arrives under a key press being answered by it, and a send with no time to undo.
  const { answers } = await open(page, ledger([asker()], [asks([MEDIUM], ["medium"], [0])]));
  const brief = await cardIn(page, "csv-export");
  const act = brief.getByRole("button", { name: "Send: Keep both" });
  await page.clock.runFor(999);
  await expect(act.locator("kbd")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(sending(brief)).toHaveCount(0);
  await page.clock.runFor(1);
  await expect(act.locator("kbd")).toHaveText("Enter");
  await page.keyboard.press("Enter");
  await expect(sending(brief)).toHaveText("Sending Keep both... Esc to undo");
  await page.clock.runFor(1499);
  await settle(page);
  expect(answers).toEqual([]);
  await page.clock.runFor(1);
  await expect.poll(() => answers).toEqual([{ card: "q1", decision: "allow", answers: { [MEDIUM.question]: "Keep both (Recommended)" } }]);
  await expect(brief.getByRole("status")).toHaveText("Sent. The agent goes on.");
});

test("a_card_closed_elsewhere_during_the_undo_window_says_already_closed_never_sent", async ({ page }) => {
  // Catches a send to a closed ask that reads as if the agent got it.
  await open(page, ledger([asker()], [asks([MEDIUM], ["medium"], [0])]), 404);
  const brief = await cardIn(page, "csv-export");
  await page.clock.runFor(1000);
  await page.keyboard.press("Enter");
  await page.clock.runFor(1500);
  await expect(brief.getByRole("alert")).toHaveText("This request is already closed.");
  await expect(brief).not.toContainText("Sent.");
});

/** Opens `name`'s card and waits out its first second, so Enter would answer it. */
async function armedCard(page: Page, name = "csv-export") {
  const brief = await cardIn(page, name);
  await page.clock.runFor(1000);
  await expect(brief.locator(".go kbd")).toHaveText("Enter");
  return brief;
}

test("esc_in_the_undo_window_stops_the_send_and_leaves_the_pane_open", async ({ page }) => {
  // Catches a misread pick that can't be caught, or an Esc that closes the pane instead.
  const { answers } = await open(page, ledger([asker()], [asks([MEDIUM], ["medium"], [0])]));
  const brief = await armedCard(page);
  await page.keyboard.press("Enter");
  await expect(sending(brief)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sending(brief)).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "csv-export details" })).toBeVisible();
  await page.clock.runFor(3000);
  await settle(page);
  expect(answers).toEqual([]);
  await expect(brief.getByRole("button", { name: "Send: Keep both" })).toBeEnabled();
});

test("space_in_the_undo_window_sends_at_once_and_opens_the_next_item", async ({ page }) => {
  // Catches Space dropping the waiting send when it walks on, or holding it for the rest of the window.
  const other = asker({ id: "s2", name: "report-page", needs: "waiting", since: NOW - MIN });
  const { answers } = await open(page, ledger([asker(), other], [asks([MEDIUM], ["medium"], [0])]));
  const brief = await armedCard(page);
  await page.keyboard.press("Enter");
  await expect(sending(brief)).toBeVisible();
  await page.keyboard.press("Space");
  await expect.poll(() => answers).toEqual([{ card: "q1", decision: "allow", answers: { [MEDIUM.question]: "Keep both (Recommended)" } }]);
  await expect(page.getByRole("dialog", { name: "report-page details" })).toBeVisible();
});

test("enter_typed_in_a_cards_text_box_sends_nothing_and_leaving_the_box_starts_the_second_again", async ({ page }) => {
  // Catches the Enter that ends a typed answer, or the next one a moment later, answering the card.
  const { answers } = await open(page, ledger([asker()], [asks([MEDIUM], ["medium"], [0])]));
  const brief = await armedCard(page);
  const other = brief.getByRole("textbox", { name: `Other: ${MEDIUM.question}` });
  await other.fill("Drop it");
  await other.press("Enter");
  await expect(sending(brief)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(other).not.toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sending(brief)).toHaveCount(0);
  await page.clock.runFor(1000);
  await page.keyboard.press("Enter");
  await expect(sending(brief)).toHaveText("Sending Drop it... Esc to undo");
  await settle(page);
  expect(answers).toEqual([]);
});

test("leaving_the_terminal_starts_the_cards_second_again", async ({ page }) => {
  // Catches an Enter meant for Claude, pressed as the user leaves the terminal, answering the card beside it.
  await page.routeWebSocket(/\/term/, () => {}); // a socket that stays open and says nothing
  await open(page, ledger([asker({ kind: "background", shortId: "abcd1234" })], [asks([MEDIUM], ["medium"], [0])]));
  const brief = await armedCard(page);
  await page.getByRole("button", { name: "Show terminal" }).click();
  const typing = page.locator(".terminal textarea");
  await expect(typing).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Meta+Escape");
  await expect(typing).not.toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sending(brief)).toHaveCount(0);
  await page.clock.runFor(1000);
  await page.keyboard.press("Enter");
  await expect(sending(brief)).toBeVisible();
});

test("the_window_coming_to_the_front_starts_the_cards_second_again", async ({ page }) => {
  // Catches an Enter typed while switching back from another app answering the card.
  await open(page, ledger([asker()], [asks([MEDIUM], ["medium"], [0])]));
  const brief = await armedCard(page);
  const cap = brief.locator(".go kbd");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(cap).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(sending(brief)).toHaveCount(0);
  await page.clock.runFor(1000);
  await expect(cap).toHaveText("Enter");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(cap).toHaveCount(0);
});

test("a_held_enter_sends_once_and_a_repeat_never_arms", async ({ page }) => {
  // Catches a key held as the card arrives answering it, or a held key sending twice.
  const { answers } = await open(page, ledger([asker()], [asks([MEDIUM], ["medium"], [0])]));
  const brief = await cardIn(page, "csv-export");
  await page.keyboard.down("Enter");
  await page.clock.runFor(1000);
  await page.keyboard.down("Enter"); // a second down with no up is a repeat
  await page.keyboard.up("Enter");
  await expect(sending(brief)).toHaveCount(0);
  await page.keyboard.down("Enter");
  await expect(sending(brief)).toBeVisible();
  await page.keyboard.down("Enter");
  await page.keyboard.down("Enter");
  await page.keyboard.up("Enter");
  await page.clock.runFor(1500);
  await expect.poll(() => answers.length).toBe(1);
  await settle(page);
  expect(answers.length).toBe(1);
});

const RULED_MEDIUM = { level: "medium", reason: "Funtown's rule: not on the high or low list", source: "rule" };
const CLICK_ONLY: [string, unknown][] = [
  ["a_high_question", asks([HIGH], ["high"], [0])],
  ["a_high_plan", planned({ level: "high", reason: "the agent's word: high; drops a table", source: "agent" })],
  ["a_medium_permission", { ...permission({ command: "npm install papaparse@5.4.1" }, RULED_MEDIUM), agent: null }],
];
for (const [name, card] of CLICK_ONLY) {
  test(`enter_never_answers_${name}_which_says_click_to_answer`, async ({ page }) => {
    // Catches a serious ask, or one with nothing picked by the agent, answered by a habit key.
    const { answers } = await open(page, ledger([asker()], [card]));
    const brief = await cardIn(page, "csv-export");
    await page.clock.runFor(1000);
    await expect(brief).toContainText("Click to answer");
    await expect(brief.locator(".act kbd")).toHaveCount(0);
    await page.keyboard.press("Enter");
    await page.clock.runFor(1500);
    await settle(page);
    expect(answers).toEqual([]);
  });
}

test("a_card_with_no_pick_arms_once_a_number_key_chooses_and_the_number_never_sends", async ({ page }) => {
  // Catches Enter sending nothing chosen, or a number key that answers instead of choosing.
  const { answers } = await open(page, ledger([asker()], [asks([NO_PICK], ["medium"], [null])]));
  const brief = await cardIn(page, "csv-export");
  await expect(brief.locator(".tile .lab kbd")).toHaveText(["1", "2"]);
  await page.clock.runFor(1000);
  await page.keyboard.press("Enter");
  await expect(sending(brief)).toHaveCount(0);
  await page.keyboard.press("2");
  await expect(brief.getByRole("radio", { name: "The anonymised export" })).toBeChecked();
  await page.keyboard.press("1");
  await expect(brief.getByRole("radio", { name: "The 20-row sample" })).toBeChecked();
  await page.clock.runFor(3000);
  await settle(page);
  expect(answers).toEqual([]);
  await page.keyboard.press("Enter");
  await expect(sending(brief)).toHaveText("Sending The 20-row sample... Esc to undo");
});

test("enter_approves_a_medium_plan_after_the_undo_window", async ({ page }) => {
  // Catches the one card kind Enter answers before agents write level words being left out.
  const { answers } = await open(page, ledger([asker({ needs: "plan" })], [planned(MEDIUM_PLAN)]));
  const brief = await armedCard(page);
  await page.keyboard.press("Enter");
  await expect(sending(brief)).toHaveText("Sending Approve... Esc to undo");
  await page.clock.runFor(1500);
  await expect.poll(() => answers).toEqual([{ card: "p1", decision: "allow" }]);
});

test("two_cards_in_one_pane_take_no_card_keys", async ({ page }) => {
  // Catches Enter, a number or D landing on one of two cards the user can't tell apart by the key.
  const { answers } = await open(page, ledger([asker()], [asks([MEDIUM], ["medium"], [0]), planned(MEDIUM_PLAN)]));
  await page.locator(".character").filter({ hasText: "csv-export" }).first().click({ position: { x: 5, y: 5 } });
  const pane = page.getByRole("dialog", { name: "csv-export details" });
  await expect(pane.getByRole("group", { name: /request$/ })).toHaveCount(2);
  await page.clock.runFor(1000);
  await expect(pane.locator(".answer-card kbd")).toHaveCount(0);
  for (const key of ["Enter", "2", "d"]) await page.keyboard.press(key);
  await page.clock.runFor(1500);
  await settle(page);
  expect(answers).toEqual([]);
  await expect(pane.getByRole("radio", { name: "Keep both" })).toBeChecked();
  await expect(pane.locator("pre.raw")).toHaveCount(0);
});

test("number_keys_toggle_on_a_multi_select_and_do_nothing_on_a_card_with_several_questions", async ({ page }) => {
  // Catches a multi-select that keeps one choice, or a number key guessing which question it means.
  const { send } = await open(page, ledger([asker()], [asks([EXTRAS], ["low"], [null])]));
  const brief = await cardIn(page, "csv-export");
  for (const key of ["1", "2", "1"]) await page.keyboard.press(key);
  await expect(brief.getByRole("checkbox", { name: "Card limit" })).not.toBeChecked();
  await expect(brief.getByRole("checkbox", { name: "Fraud score" })).toBeChecked();

  send(ledger([asker()], [asks([EXTRAS, MEDIUM], ["low", "medium"], [null, 0])]));
  await page.reload();
  const several = await cardIn(page, "csv-export");
  await expect(several.locator(".tile .lab kbd")).toHaveCount(0);
  await page.keyboard.press("2");
  await expect(several.getByRole("checkbox", { name: "Fraud score" })).not.toBeChecked();
  await expect(several.getByRole("radio", { name: "Keep both" })).toBeChecked();
});

test("d_shows_and_hides_the_raw_detail", async ({ page }) => {
  // Catches the real request being more than one key away.
  await open(page, ledger([asker()], [asks([MEDIUM], ["medium"], [0])]));
  const brief = await cardIn(page, "csv-export");
  await expect(brief.getByRole("button", { name: "Raw detail" }).locator("kbd")).toHaveText("D");
  await page.keyboard.press("d");
  await expect(brief.locator("pre.raw")).toContainText('"label": "Keep both (Recommended)"');
  await page.keyboard.press("d");
  await expect(brief.locator("pre.raw")).toHaveCount(0);
});
