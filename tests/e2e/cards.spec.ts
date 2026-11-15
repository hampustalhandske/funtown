import { expect, test, type Page } from "@playwright/test";

const QUESTIONS = {
  questions: [
    { question: "Which db?", header: "DB", multiSelect: false, options: [{ label: "Postgres", description: "" }, { label: "SQLite", description: "" }] },
    { question: "Which extras?", header: "X", multiSelect: true, options: [{ label: "Alpha", description: "" }, { label: "Beta", description: "" }] },
  ],
};
const lead = (over: Record<string, unknown>) => ({
  id: "s1", name: "lead-1", stage: "needs_you", activity: null, step: null, needs: "permission", tty: "ttys001", termProgram: "TestTerm",
  kind: "terminal", shortId: null, subagents: [], ...over,
});
const card = (over: Record<string, unknown>) => ({
  id: "c1", lead: "s1", agent: null, kind: "permission", tool: "Bash", input: { command: "rm -rf /work/demo-app/build" }, cwd: "/work/demo-app", at: 1, ...over,
});
const town = (leads: unknown[], cards: unknown[]) => ({
  claude: { version: "2.1.325", problems: [] },
  houses: [{ project: "demo-app", cwd: "/work/demo-app", leads }],
  cards,
});
const bg = lead({ id: "b1", name: "bg-1", kind: "background", shortId: "b1b1b1b1", needs: "question" });

const sse = (t: unknown) => `retry: 50\nevent: state\ndata: ${JSON.stringify(t)}\n\n`;

/** Opens the page on a stubbed stream; records each POST /answer body and replies with `reply`. */
async function open(page: Page, initial: unknown, reply: { status: number; body?: string } = { status: 204 }) {
  const answers: unknown[] = [];
  let current = initial;
  await page.route("**/stream", (r) =>
    r.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache" }, body: sse(current) }),
  );
  await page.route("**/answer", (r) => {
    answers.push(r.request().postDataJSON());
    return r.fulfill({ status: reply.status, contentType: "text/plain", body: reply.body ?? "" });
  });
  await page.goto("/");
  return { answers, send: (t: unknown) => void (current = t) };
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
  await under.getByRole("button", { name: "Allow" }).click();
  await expect.poll(() => answers).toEqual([{ card: "c1", decision: "deny" }, { card: "c1", decision: "allow" }]);
});

test("an_edit_card_shows_the_file_path_and_the_same_card_is_in_the_leads_panel", async ({ page }) => {
  await open(page, town([lead({})], [card({ tool: "Edit", input: { file_path: "/work/demo-app/src/a.ts", old_string: "x", new_string: "y" } })]));
  await house(page).locator(".character").filter({ hasText: "lead-1" }).first().click({ position: { x: 5, y: 5 } });
  const panel = page.getByRole("dialog", { name: "lead-1 details" });
  await expect(panel).toContainText("/work/demo-app/src/a.ts");
  await expect(panel).toContainText("/work/demo-app");
  await expect(panel.getByRole("button", { name: "Allow" })).toBeVisible();
});

test("a_question_card_lists_every_question_and_option_and_send_posts_labels_or_the_typed_text", async ({ page }) => {
  const { answers } = await open(page, town([bg], [card({ id: "q1", lead: "b1", kind: "question", tool: "AskUserQuestion", input: QUESTIONS })]));
  const under = house(page);
  for (const text of ["Which db?", "Which extras?", "Postgres", "SQLite", "Alpha", "Beta"]) await expect(under).toContainText(text);
  await under.getByLabel("Postgres").check();
  await under.getByLabel("Alpha").check();
  await under.getByLabel("Beta").check();
  await under.getByRole("button", { name: "Send" }).click();
  await expect.poll(() => answers).toEqual([{ card: "q1", decision: "allow", answers: { "Which db?": "Postgres", "Which extras?": "Alpha, Beta" } }]);

  await under.getByRole("textbox", { name: /other/i }).first().fill("MySQL");
  await under.getByRole("button", { name: "Send" }).click();
  await expect.poll(() => answers.length).toBe(2);
  expect((answers[1] as { answers: Record<string, string> }).answers["Which db?"]).toBe("MySQL");
});

test("a_plan_card_shows_the_plan_in_a_pre_and_approve_and_keep_planning_post_the_right_bodies", async ({ page }) => {
  const { answers } = await open(page, town([{ ...bg, needs: "plan" }], [card({ id: "p1", lead: "b1", kind: "plan", tool: "ExitPlanMode", input: { plan: "1. Add the table\n2. Migrate" } })]));
  const under = house(page);
  await expect(under.locator("pre")).toContainText("1. Add the table");
  await under.getByRole("textbox").first().fill("Split step 2");
  await under.getByRole("button", { name: "Keep planning" }).click();
  await expect.poll(() => answers).toEqual([{ card: "p1", decision: "deny", feedback: "Split step 2" }]);
  await under.getByRole("button", { name: "Approve" }).click();
  await expect.poll(() => answers.length).toBe(2);
  expect(answers[1]).toEqual({ card: "p1", decision: "allow" });
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

test("a_refused_answer_shows_the_servers_reply_text_on_the_card", async ({ page }) => {
  await open(page, town([lead({})], [card({})]), { status: 404, body: "That card is already closed." });
  await house(page).getByRole("button", { name: "Allow" }).click();
  await expect(house(page)).toContainText("That card is already closed.");
});
