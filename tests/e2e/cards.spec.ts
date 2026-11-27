import { expect, test, type Locator, type Page } from "@playwright/test";
import { stubStream } from "./stream.ts";
import {
  asker, asks, cardIn, claude, EXTRAS, HIGH, implementer, ledger, LOW, MEDIUM, MEDIUM_PLAN, MIN, NO_PICK, NOW, permission, PHASE, PLAN, planned, tile, UNSTATED, type Q,
} from "./briefs.ts";
const lead = (over: Record<string, unknown>) => ({
  id: "s1", name: "lead-1", stage: "needs_you", activity: null, step: null, needs: "permission", tty: "ttys001", termProgram: "TestTerm",
  kind: "terminal", shortId: null, subagents: [], ...over,
});
const card = (over: Record<string, unknown>) => ({
  id: "c1", lead: "s1", agent: null, kind: "permission", tool: "Bash", input: { command: "rm -rf /work/demo-app/build" }, cwd: "/work/demo-app", at: NOW,
  severity: { level: "high", reason: "Funtown's rule: rm with a recursive flag can't be walked back", source: "rule" }, ...over,
});
const town = (leads: unknown[], cards: unknown[]) => ({
  claude,
  houses: [{ project: "demo-app", cwd: "/work/demo-app", leads }],
  cards,
});

/** Opens the page on a stubbed stream; records each POST /answer body and replies with `reply`. */
async function open(page: Page, initial: unknown, reply: { status: number } = { status: 204 }) {
  const answers: unknown[] = [];
  const stream = await stubStream(page, initial);
  await page.route("**/answer", (r) => {
    answers.push(r.request().postDataJSON());
    return r.fulfill({ status: reply.status, contentType: "text/plain", body: "" });
  });
  await page.goto("/work.html");
  return { answers, send: stream.send };
}
const house = (page: Page) => page.locator('section[aria-label="demo-app"]');

test("a_permission_card_shows_the_tool_the_exact_command_and_the_folder_and_the_buttons_post_the_decision", async ({ page }) => {
  const { answers } = await open(page, town([lead({})], [card({})]));
  const under = house(page);
  await expect(under).toContainText("Bash");
  await expect(under).toContainText("rm -rf /work/demo-app/build");
  await expect(under).toContainText("/work/demo-app");
  await under.getByRole("button", { name: "Deny" }).click();
  await expect.poll(() => answers).toEqual([{ card: "c1", decision: "deny" }]);
  await page.reload();
  await under.getByRole("button", { name: "Allow" }).click();
  await expect.poll(() => answers).toEqual([{ card: "c1", decision: "deny" }, { card: "c1", decision: "allow" }]);
});

test("a_bare_edit_card_says_what_the_tool_does_to_which_path_and_the_same_card_is_in_the_leads_panel", async ({ page }) => {
  // Catches a bare permission with no one-line ask, or a card only in one of the two places.
  await open(page, town([lead({})], [card({ tool: "Edit", input: { file_path: "/work/demo-app/src/a.ts", old_string: "x", new_string: "y" } })]));
  await expect(house(page).getByRole("heading", { name: "Edit src/a.ts" })).toBeVisible();
  await house(page).locator(".character").filter({ hasText: "lead-1" }).first().click({ position: { x: 5, y: 5 } });
  const panel = page.getByRole("dialog", { name: "lead-1 details" });
  await expect(panel.getByRole("heading", { name: "Edit src/a.ts" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Allow" })).toBeVisible();
});

test("a_card_takes_no_focus_and_disappears_when_the_next_state_has_no_card", async ({ page }) => {
  const stream = await open(page, town([lead({})], []));
  await expect(house(page)).toBeVisible();
  stream.send(town([lead({})], [card({})]));
  await expect(house(page).getByRole("button", { name: "Allow" })).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("BODY");
  stream.send(town([lead({})], []));
  await expect(house(page).getByRole("button", { name: "Allow" })).toHaveCount(0);
});

test("a_404_on_answer_shows_that_the_request_is_already_closed", async ({ page }) => {
  await open(page, town([lead({})], [card({})]), { status: 404 });
  await house(page).getByRole("button", { name: "Allow" }).click();
  await expect(house(page)).toContainText("This request is already closed.");
});

test("a_card_from_an_agent_the_lead_does_not_list_shows_in_the_leads_panel", async ({ page }) => {
  await open(page, town([lead({})], [card({ agent: "ghost" })]));
  await house(page).locator(".character").filter({ hasText: "lead-1" }).first().click({ position: { x: 5, y: 5 } });
  const panel = page.getByRole("dialog", { name: "lead-1 details" });
  await expect(panel).toContainText("rm -rf /work/demo-app/build");
  await expect(panel.getByRole("button", { name: "Allow" })).toBeVisible();
});

test("after_a_successful_answer_the_card_says_sent_and_offers_no_button_until_it_leaves", async ({ page }) => {
  // Catches a second answer sent for the same ask.
  await open(page, town([lead({})], [card({})]));
  const under = house(page);
  await under.getByRole("button", { name: "Allow" }).click();
  await expect(under.getByRole("status")).toHaveText("Sent. The agent goes on.");
  await expect(under.getByRole("button", { name: /^(Allow|Deny)/ })).toHaveCount(0);
  await page.waitForTimeout(500);
  await expect(under.getByRole("button", { name: /^(Allow|Deny)/ })).toHaveCount(0);
});

// The brief on a card.
test("a_medium_question_shows_who_asks_its_weight_the_ask_the_goal_and_stacked_options_with_the_pick_chosen", async ({ page }) => {
  // Catches a card that hides whose work it is, the severity, the goal, or the agent's pick.
  const { answers } = await open(page, ledger([asker()], [asks([MEDIUM], ["medium"], [0])]));
  const brief = await cardIn(page, "csv-export");
  await expect(brief).toContainText("csv-export · ledgerline · waiting 4m");
  await expect(brief).toContainText("Medium");
  await expect(brief).toContainText("the agent's word: medium: data");
  await expect(brief.getByRole("heading", { name: MEDIUM.question })).toBeVisible();
  // the header's words after its level word are the question's topic (story 3)
  await expect(brief.locator(".topic")).toHaveText("data");
  await expect(brief).toContainText("For Invoices export from one button · implement, step 3 of 6");
  await expect(brief).toContainText("Spec: docs/specs/csv-export.md");
  await expect(brief).toContainText("Last step: Edit: src/invoices/export.ts");
  await expect(brief).not.toContainText("(Recommended)");
  for (const o of MEDIUM.options) await expect(brief).toContainText(o.description);
  const keep = brief.getByRole("radio", { name: /Keep both/ });
  await expect(keep).toBeChecked();
  await expect(brief.locator(".tile").filter({ hasText: "Keep both" })).toContainText("Agent's pick");
  await expect(brief.getByText("Agent's pick")).toHaveCount(1);
  const [a, b] = [await brief.locator(".tile").nth(0).boundingBox(), await brief.locator(".tile").nth(1).boundingBox()];
  expect(b!.y).toBeGreaterThanOrEqual(a!.y + a!.height);
  await brief.getByRole("button", { name: "Send: Keep both" }).click();
  await expect.poll(() => answers).toEqual([{ card: "q1", decision: "allow", answers: { [MEDIUM.question]: "Keep both (Recommended)" } }]);
});

test.describe("at 1280 x 800", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the_panel_is_32rem_while_it_holds_a_card_and_its_usual_width_without_one", async ({ page }) => {
    // Catches a card squeezed into the narrow panel, where a medium card no longer fits the window.
    const { send } = await open(page, ledger([asker()], [asks([MEDIUM], ["medium"], [0])]));
    const brief = await cardIn(page, "csv-export");
    const panel = page.getByRole("dialog", { name: "csv-export details" });
    expect((await panel.boundingBox())!.width).toBe(32 * 16);
    await expect(brief.getByRole("button", { name: "Send: Keep both" })).toBeInViewport({ ratio: 1 });
    send(ledger([asker({ stage: "working", needs: undefined })], []));
    await expect(brief).toHaveCount(0);
    expect((await panel.boundingBox())!.width).toBeLessThan(32 * 16);
  });

  test("the_act_row_stays_at_the_bottom_of_the_panel_while_a_long_card_scrolls", async ({ page }) => {
    // Catches a long card pushing the answer below the window.
    await open(page, ledger([asker()], [asks([LONG, MEDIUM, LOW, HIGH], ["medium", "medium", "medium", "medium"], [0, 0, 0, 0])]));
    const brief = await cardIn(page, "csv-export");
    const lines = page.getByRole("dialog", { name: "csv-export details" }).locator(".lines");
    expect(await lines.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
    await expect(brief.getByRole("button", { name: /^Send: / })).toBeInViewport({ ratio: 1 });
    await lines.evaluate((e) => (e.scrollTop = e.scrollHeight));
    await expect(brief.getByRole("button", { name: /^Send: / })).toBeInViewport({ ratio: 1 });
  });
});

test("a_low_question_lays_its_options_in_one_row", async ({ page }) => {
  // Catches a low card that opens as far as a medium one.
  await open(page, ledger([asker()], [asks([LOW], ["low"], [0])]));
  const brief = await cardIn(page, "csv-export");
  await expect(brief).toContainText("Low");
  const boxes = await Promise.all(["prefs", "settings", "user-config"].map((label) => tile(brief, label).first().boundingBox()));
  expect(new Set(boxes.map((b) => Math.round(b!.y))).size).toBe(1);
  await expect(brief.getByRole("button", { name: "Send: prefs" })).toBeVisible();
});

test("a_high_question_opens_its_stakes_first_and_its_button_names_the_act", async ({ page }) => {
  // Catches a serious ask that looks like an easy one, or a button that sends without saying what.
  const { answers } = await open(page, ledger([asker({ step: "Bash: npm run migrate -- --dry" })], [asks([HIGH], ["high"], [0])]));
  const brief = await cardIn(page, "csv-export");
  const stakes = brief.locator(".stakes");
  await expect(stakes).toContainText("The agent marked this high.");
  // the agent's own words: its header and its question
  await expect(stakes.locator(".words")).toHaveText(`high: data · ${HIGH.question}`);
  await expect(stakes).toContainText("Last step: Bash: npm run migrate -- --dry");
  const [stakesBox, first] = [await stakes.boundingBox(), await tile(brief, "Dry run first").boundingBox()];
  expect(stakesBox!.y + stakesBox!.height).toBeLessThanOrEqual(first!.y);
  await expect(brief).toContainText("Click to answer");
  await brief.getByRole("button", { name: "Answer: Dry run first" }).click();
  await expect.poll(() => answers).toEqual([{ card: "q1", decision: "allow", answers: { [HIGH.question]: "Dry run first (Recommended)" } }]);
});

test("a_question_with_no_level_word_reads_as_a_high_one", async ({ page }) => {
  // Catches unknown stakes shown as small.
  await open(page, ledger([asker()], [asks([UNSTATED], ["unstated"], [0])]));
  const brief = await cardIn(page, "csv-export");
  await expect(brief).toContainText("Not stated");
  // a header with no level word is still shown, as the question's topic
  await expect(brief).toContainText("Library");
  await expect(brief.locator(".stakes")).toContainText("The agent didn't say how serious this is. Read it as a high one.");
  await expect(brief.getByRole("button", { name: "Answer: date-fns" })).toBeVisible();
});

test("a_question_without_a_pick_starts_with_nothing_chosen_and_sends_once_one_is", async ({ page }) => {
  // Catches Funtown inventing a pick the agent never made.
  const { answers } = await open(page, ledger([asker()], [asks([NO_PICK], ["medium"], [null])]));
  const brief = await cardIn(page, "csv-export");
  for (const radio of await brief.getByRole("radio").all()) await expect(radio).not.toBeChecked();
  await expect(brief.getByText("Agent's pick")).toHaveCount(0);
  await expect(brief.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect(brief).toContainText("Choose an option to send");
  await tile(brief, "The anonymised export").click();
  await brief.getByRole("button", { name: "Send: The anonymised export" }).click();
  await expect.poll(() => answers).toEqual([{ card: "q1", decision: "allow", answers: { [NO_PICK.question]: "The anonymised export" } }]);
});

test("two_questions_each_show_their_own_level_toggle_on_a_multi_select_and_send_both_answers_or_the_typed_text", async ({ page }) => {
  // Catches one serious question hidden by an easy one, or a multi-select that keeps one choice.
  const { answers } = await open(page, ledger([asker()], [asks([EXTRAS, MEDIUM], ["low", "medium"], [null, 0])]));
  const brief = await cardIn(page, "csv-export");
  await expect(brief.getByRole("heading", { name: "2 questions" })).toBeVisible();
  await expect(brief.getByRole("group", { name: EXTRAS.question })).toContainText("config · Low");
  await expect(brief.getByRole("group", { name: MEDIUM.question })).toContainText("data · Medium");
  await tile(brief, "Card limit").click();
  await tile(brief, "Fraud score").click();
  await tile(brief, "Card limit").click();
  await brief.getByRole("button", { name: "Send: Fraud score; Keep both" }).click();
  await expect.poll(() => answers).toEqual([{ card: "q1", decision: "allow", answers: { [EXTRAS.question]: "Fraud score", [MEDIUM.question]: "Keep both (Recommended)" } }]);
  await page.reload();
  const again = await cardIn(page, "csv-export");
  await tile(again, "Card limit").click();
  await again.getByRole("textbox", { name: `Other: ${MEDIUM.question}` }).fill("Drop the old table");
  await again.getByRole("button", { name: "Send: Card limit; Drop the old table" }).click();
  await expect.poll(() => answers.length).toBe(2);
  expect((answers[1] as { answers: Record<string, string> }).answers[MEDIUM.question]).toBe("Drop the old table");
});

test("a_plan_shows_its_top_lines_as_written_approve_is_the_pick_and_keep_planning_takes_a_note_that_enter_never_sends", async ({ page }) => {
  // Catches approving a plan without its gist on screen, or a note sent before it is finished.
  const { answers } = await open(page, ledger([asker({ needs: "plan" })], [planned(MEDIUM_PLAN)]));
  const brief = await cardIn(page, "csv-export");
  await expect(brief.getByRole("heading", { name: "Approve the plan" })).toBeVisible();
  for (const line of PLAN.split("\n").slice(0, 3)) await expect(brief).toContainText(line);
  await expect(brief).not.toContainText("## Steps");
  await expect(brief.getByRole("radio", { name: "Approve" })).toBeChecked();
  await expect(tile(brief, "Approve")).toContainText("Agent's pick");
  await tile(brief, "Keep planning").click();
  const note = brief.getByRole("textbox", { name: "Note to the agent" });
  await note.fill("Keep the old route for a week");
  await note.press("Enter");
  await page.waitForTimeout(300);
  expect(answers).toEqual([]);
  await brief.getByRole("button", { name: "Keep planning" }).click();
  await expect.poll(() => answers).toEqual([{ card: "p1", decision: "deny", feedback: "Keep the old route for a week" }]);
  await page.reload();
  await (await cardIn(page, "csv-export")).getByRole("button", { name: "Approve" }).click();
  await expect.poll(() => answers.length).toBe(2);
  expect(answers[1]).toEqual({ card: "p1", decision: "allow" });
});

test("a_high_plan_opens_its_stakes", async ({ page }) => {
  // Catches a plan the agent called high that reads like any other.
  await open(page, ledger([asker({ needs: "plan" })], [planned({ level: "high", reason: "the agent's word: high; drops a table", source: "agent" })]));
  const brief = await cardIn(page, "csv-export");
  await expect(brief.locator(".stakes")).toContainText("The agent marked this high.");
  // the agent's own words: the plan's How serious line as written
  await expect(brief.locator(".stakes .words")).toHaveText(PLAN.split("\n")[2]);
  await expect(brief).toContainText("Click to answer");
});

test("a_subagents_high_permission_says_who_asks_under_which_lead_its_description_and_the_command_in_its_stakes", async ({ page }) => {
  // Catches a permission that hides whose it is, what it is for, or what exactly runs.
  const { answers } = await open(page, ledger([asker({ stage: "working", subagents: [implementer] })], [
    permission({ command: "git push origin feature/csv-export", description: "Push the branch to GitHub" }, { level: "high", reason: "Funtown's rule: git push leaves this Mac", source: "rule" }),
  ]));
  const brief = await cardIn(page, "implementer-1");
  await expect(brief).toContainText("implementer-1 (implementer) · ledgerline · under csv-export · waiting 1m");
  await expect(brief.getByRole("heading", { name: "Push the branch to GitHub" })).toBeVisible();
  const stakes = brief.locator(".stakes");
  await expect(stakes).toContainText("High: git push leaves this Mac.");
  // the agent's own words: Bash's description
  await expect(stakes.locator(".words")).toHaveText("Push the branch to GitHub");
  await expect(stakes.locator("pre")).toHaveText("git push origin feature/csv-export");
  await expect(stakes).toContainText("Last step: Bash: npm test");
  await expect(brief).toContainText("Click to answer");
  await brief.getByRole("button", { name: "Allow once" }).click();
  await expect.poll(() => answers).toEqual([{ card: "c1", decision: "allow" }]);
});

test("a_medium_permission_shows_its_command_without_a_stakes_box", async ({ page }) => {
  // Catches every permission shouting like a high one.
  await open(page, ledger([asker({ stage: "working", subagents: [implementer] })], [
    permission({ command: "npm install papaparse@5.4.1", description: "Install the CSV parser" }, { level: "medium", reason: "Funtown's rule: not on the high or low list", source: "rule" }),
  ]));
  const brief = await cardIn(page, "implementer-1");
  await expect(brief.locator(".stakes")).toHaveCount(0);
  await expect(brief.locator("pre")).toHaveText("npm install papaparse@5.4.1");
  await expect(brief.getByRole("button", { name: "Allow", exact: true })).toBeVisible();
});

test("a_project_without_a_phase_file_shows_no_goal_line", async ({ page }) => {
  // Catches a card that guesses a goal.
  await open(page, ledger([asker()], [asks([MEDIUM], ["medium"], [0])], null));
  const brief = await cardIn(page, "csv-export");
  await expect(brief.getByRole("heading", { name: MEDIUM.question })).toBeVisible();
  await expect(brief).not.toContainText(/For |Spec:|step \d+ of/);
});

const LONG: Q = {
  question:
    "Should the first version of the CSV export stream rows to the file as it reads them, which keeps memory flat even for the largest customer's 1.2 million rows, or build the whole file in memory the way the PDF export does today, which is simpler to test but needs about 900 MB at the top end?",
  header: "medium: memory", multiSelect: false,
  options: [
    { label: "Stream the rows (Recommended)", description: "Memory stays under 50 MB for every customer. Needs a streaming CSV writer (papaparse has one) and a test that reads the file back in chunks; about half a day more than building in memory, and the PDF path stays as it is." },
    { label: "Build in memory", description: "The simplest code and the same shape as the PDF path, so one test helper covers both. The largest customer's export needs about 900 MB and would fail on the 512 MB worker until it is moved to a bigger one." },
  ],
};
const LONG_GOAL = { ...PHASE, goal: "Invoices export from one button for every customer, including the biggest one with about 1.2 million invoice rows a year, without new infrastructure and without breaking the nightly report" };

test("a_long_ask_and_long_consequences_are_cut_at_three_lines_with_more_in_place_but_never_on_a_heavy_card", async ({ page }) => {
  // Catches a long medium card that pushes its options off screen, or a heavy one that hides part of a consequence.
  const { send } = await open(page, ledger([asker()], [asks([LONG], ["medium"], [0])], LONG_GOAL));
  const brief = await cardIn(page, "csv-export");
  const ask = brief.getByRole("heading", { name: LONG.question });
  const lines = async (el: Locator) => el.evaluate((e) => Math.round(e.clientHeight / parseFloat(getComputedStyle(e).lineHeight)));
  expect(await lines(ask)).toBe(3);
  expect(await lines(brief.locator(".goal").first())).toBe(2);
  // one "more" for the ask, one for the goal and one per long consequence
  await expect(brief.getByRole("button", { name: "more" })).toHaveCount(4);
  await brief.getByRole("button", { name: "more" }).first().click();
  expect(await lines(ask)).toBeGreaterThan(3);
  await expect(brief.getByRole("button", { name: "less" })).toHaveCount(1);

  send(ledger([asker()], [asks([{ ...LONG, header: "high: memory" }], ["high"], [0])], LONG_GOAL));
  await page.reload();
  const heavy = await cardIn(page, "csv-export");
  await expect(heavy.locator(".stakes")).toBeVisible();
  // only the goal words are cut on a heavy card
  await expect(heavy.getByRole("button", { name: "more" })).toHaveCount(1);
});

test("raw_detail_shows_the_whole_tool_input_as_sent", async ({ page }) => {
  // Catches a brief that hides the real request: the label as sent, an option's preview, the plan's file path.
  const previewed = { ...MEDIUM, options: MEDIUM.options.map((o, i) => (i === 0 ? { ...o, preview: "CREATE TABLE invoices_v2 (...)" } : o)) };
  await open(page, ledger([asker()], [asks([previewed], ["medium"], [0])]));
  const brief = await cardIn(page, "csv-export");
  await expect(brief.locator("pre")).toHaveCount(0);
  await brief.getByRole("button", { name: "Raw detail" }).click();
  const raw = brief.locator("pre.raw");
  await expect(raw).toContainText('"label": "Keep both (Recommended)"');
  await expect(raw).toContainText('"preview": "CREATE TABLE invoices_v2 (...)"');
  await brief.getByRole("button", { name: "Hide raw detail" }).click();
  await expect(raw).toHaveCount(0);
});

test("raw_detail_on_a_permission_shows_its_suggestions_as_sent", async ({ page }) => {
  // Catches a permission whose "always allow" rules from Claude Code are hidden (story 15).
  const suggestions = [{ type: "addRules", rules: [{ toolName: "Bash", ruleContent: "npm install:*" }], behavior: "allow", destination: "localSettings" }];
  await open(page, ledger([asker({ stage: "working", subagents: [implementer] })], [
    { ...permission({ command: "npm install papaparse@5.4.1" }, { level: "medium", reason: "Funtown's rule: not on the high or low list", source: "rule" }), suggestions },
  ]));
  const brief = await cardIn(page, "implementer-1");
  await brief.getByRole("button", { name: "Raw detail" }).click();
  await expect(brief.locator("pre.raw")).toContainText('"command": "npm install papaparse@5.4.1"');
  await expect(brief.locator("pre.raw")).toContainText('"ruleContent": "npm install:*"');
});

test("a_card_open_in_the_pane_is_one_line_in_the_list_so_one_card_never_shows_two_choices", async ({ page }) => {
  // Catches the list row offering "Keep both" while the pane beside it says "New table only".
  await open(page, ledger([asker()], [asks([MEDIUM], ["medium"], [0])]));
  const list = page.locator('section[aria-label="ledgerline"]');
  await expect(list.getByRole("group", { name: "question request" })).toBeVisible();
  const brief = await cardIn(page, "csv-export");
  await tile(brief, "New table only").click();
  await expect(page.getByRole("group", { name: "question request" })).toHaveCount(1);
  await expect(list).toContainText(`csv-export: ${MEDIUM.question} · open in the panel`);
  await expect(list.getByRole("button", { name: /^Send: / })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(list.getByRole("group", { name: "question request" })).toBeVisible();
});

test("enter_in_a_cards_text_box_or_on_an_option_sends_nothing", async ({ page }) => {
  // Catches a form's implicit submission answering the card behind the user's back.
  const { answers } = await open(page, ledger([asker()], [asks([MEDIUM], ["medium"], [0])]));
  const brief = await cardIn(page, "csv-export");
  const other = brief.getByRole("textbox", { name: `Other: ${MEDIUM.question}` });
  await other.fill("Drop it");
  await other.press("Enter");
  await brief.getByRole("radio", { name: "New table only" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  expect(answers).toEqual([]);
});

test("the_newest_letter_is_one_button_away_from_a_card_in_the_plain_list", async ({ page }) => {
  // Catches a card that leaves its context in the terminal.
  await open(page, ledger([asker({ letter: NOW - MIN })], [asks([MEDIUM], ["medium"], [0])]));
  const letter = { id: "L1", from: "s1", name: "csv-export", text: "Built the export; the nightly report still reads invoices_v1.", at: NOW - MIN };
  await page.route("**/letters?*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([letter]) }));
  const inList = page.locator('section[aria-label="ledgerline"]').getByRole("group", { name: "question request" });
  await inList.getByRole("button", { name: "Newest letter" }).click();
  await expect(page.getByRole("dialog", { name: "csv-export details" }).getByRole("region", { name: "Letters" })).toContainText(letter.text);
});
