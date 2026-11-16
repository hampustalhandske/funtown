import { expect, test, type Page } from "@playwright/test";
import { stubStream } from "./stream.ts";

const town = {
  claude: { version: "2.1.325", problems: [] },
  cards: [],
  houses: [
    {
      project: "demo-app",
      cwd: "/work/demo-app",
      leads: [
        {
          id: "s1", name: "lead-1", stage: "needs_you", activity: null, step: "Bash: npm test", needs: "permission",
          tty: "ttys001", termProgram: "TestTerm", kind: "terminal", shortId: null,
          subagents: [{ id: "x1", name: "Explore-1", stage: "working", activity: "Read", step: "Read" }],
        },
      ],
    },
    {
      project: "other-app",
      cwd: "/work/other-app",
      leads: [
        { id: "s2", name: "lead-2", stage: "working", activity: null, step: null, tty: null, termProgram: null, kind: "terminal", shortId: null, subagents: [] },
      ],
    },
  ],
};

async function open(
  page: Page,
  jumpReply: { status: number; body?: string; delayMs?: number } = { status: 204 },
  initial: unknown = town,
) {
  const jumps: unknown[] = [];
  const stream = await stubStream(page, initial);
  await page.route("**/jump", async (r) => {
    jumps.push(r.request().postDataJSON());
    if (jumpReply.delayMs) await new Promise((done) => setTimeout(done, jumpReply.delayMs));
    return r.fulfill({ status: jumpReply.status, contentType: "text/plain", body: jumpReply.body ?? "" });
  });
  await page.goto("/");
  /** Sets the state the stream sends on its next (quick) reconnect. */
  return { jumps, send: stream.send };
}

test("clicking_a_lead_opens_a_panel_with_stage_step_need_and_its_subagents_and_escape_closes_it", async ({ page }) => {
  await open(page);
  await page.locator('section[aria-label="demo-app"] .character').filter({ hasText: "lead-1" }).first().click({ position: { x: 5, y: 5 } });
  const panel = page.getByRole("dialog", { name: "lead-1 details" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("needs_you".replace("_", " "), { ignoreCase: true });
  await expect(panel).toContainText("Bash: npm test");
  await expect(panel).toContainText("waiting for you: permission");
  await expect(panel.getByRole("list", { name: "Subagents" })).toHaveText("Explore-1 🟢 working");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});

test("a_lead_without_a_step_shows_nothing_yet_and_the_x_button_closes_the_panel", async ({ page }) => {
  await open(page);
  await page.locator('section[aria-label="other-app"] .character').filter({ hasText: "lead-2" }).click();
  const panel = page.getByRole("dialog", { name: "lead-2 details" });
  await expect(panel).toContainText("nothing yet");
  await panel.getByRole("button", { name: /✕|close/i }).click();
  await expect(panel).toHaveCount(0);
});

test("a_subagent_panel_jumps_to_its_leads_id_not_its_own", async ({ page }) => {
  const { jumps } = await open(page);
  await page.locator('ul[aria-label="lead-1 subagents"] .character').filter({ hasText: "Explore-1" }).click();
  const panel = page.getByRole("dialog", { name: "Explore-1 details" });
  await expect(panel).toContainText("Read");
  await panel.getByRole("button", { name: "Go to terminal" }).click();
  await expect.poll(() => jumps).toEqual([{ lead: "s1" }]);
});

test("a_refused_jump_shows_the_servers_reply_text_in_the_panel", async ({ page }) => {
  const msg = "Funtown doesn't know how to open this session's terminal.";
  await open(page, { status: 409, body: msg });
  await page.locator('section[aria-label="demo-app"] .character').filter({ hasText: "lead-1" }).first().click({ position: { x: 5, y: 5 } });
  const panel = page.getByRole("dialog", { name: "lead-1 details" });
  await panel.getByRole("button", { name: "Go to terminal" }).click();
  await expect(panel).toContainText(msg);
});

test("an_open_panel_follows_new_states_and_closes_when_its_character_is_removed", async ({ page }) => {
  const stream = await open(page);
  await page.locator('section[aria-label="other-app"] .character').filter({ hasText: "lead-2" }).click();
  const panel = page.getByRole("dialog", { name: "lead-2 details" });
  await expect(panel).toContainText("nothing yet");
  const lead2 = town.houses[1].leads[0];
  stream.send({ claude: { version: "2.1.325", problems: [] }, cards: [], houses: [town.houses[0], { ...town.houses[1], leads: [{ ...lead2, step: "Edit: a.ts" }] }] });
  await expect(panel).toContainText("Edit: a.ts");
  stream.send({ claude: { version: "2.1.325", problems: [] }, cards: [], houses: [town.houses[0]] });
  await expect(panel).toHaveCount(0);
  stream.send(town);
  await expect(page.locator('section[aria-label="other-app"]')).toBeVisible();
  await expect(panel).toHaveCount(0);
});

test("a_second_click_while_a_jump_is_pending_posts_once", async ({ page }) => {
  const { jumps } = await open(page, { status: 204, delayMs: 500 });
  await page.locator('section[aria-label="other-app"] .character').filter({ hasText: "lead-2" }).click();
  const button = page.getByRole("dialog", { name: "lead-2 details" }).getByRole("button", { name: "Go to terminal" });
  await button.click();
  await expect(button).toBeDisabled();
  await button.click({ force: true });
  await expect(button).toBeEnabled();
  expect(jumps).toEqual([{ lead: "s2" }]);
});

test("equal_subagent_ids_under_two_leads_open_the_right_panel", async ({ page }) => {
  const sub = (name: string) => ({ id: "x1", name, stage: "working", activity: null, step: null });
  const lead = (id: string, name: string, subName: string) => ({
    id, name, stage: "working", activity: null, step: null, tty: null, termProgram: null, kind: "terminal", shortId: null, subagents: [sub(subName)],
  });
  const { jumps } = await open(page, { status: 204 }, {
    claude: { version: "2.1.325", problems: [] },
    cards: [],
    houses: [{ project: "demo-app", cwd: "/work/demo-app", leads: [lead("a", "lead-a", "Sub-A"), lead("b", "lead-b", "Sub-B")] }],
  });
  await page.locator('ul[aria-label="lead-b subagents"] .character').click();
  const panel = page.getByRole("dialog", { name: "Sub-B details" });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Go to terminal" }).click();
  await expect.poll(() => jumps).toEqual([{ lead: "b" }]);
});

test("a_new_session_does_not_take_over_a_panel_opened_after_it_was_started", async ({ page }) => {
  const claude = { version: "2.1.325", problems: [] };
  const stream = await open(page);
  await page.route("**/sessions", (r) => r.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "newbg001" }) }));
  await page.locator('section[aria-label="demo-app"]').getByRole("button", { name: /new session/i }).click();
  await page.locator('section[aria-label="other-app"] .character').filter({ hasText: "lead-2" }).click();
  const panel = page.getByRole("dialog", { name: "lead-2 details" });
  await expect(panel).toBeVisible();

  const fresh = { ...town.houses[0].leads[0], id: "s3", name: "fresh-one", kind: "background", shortId: "newbg001", subagents: [] };
  stream.send({ claude, cards: [], houses: [{ ...town.houses[0], leads: [...town.houses[0].leads, fresh] }, town.houses[1]] });
  await expect(page.locator('section[aria-label="demo-app"] .character').filter({ hasText: "fresh-one" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "fresh-one details" })).toHaveCount(0);
  await expect(panel).toBeVisible();
});
