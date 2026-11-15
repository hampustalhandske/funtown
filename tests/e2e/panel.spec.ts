import { expect, test, type Page } from "@playwright/test";

const town = {
  houses: [
    {
      project: "demo-app",
      cwd: "/work/demo-app",
      leads: [
        {
          id: "s1", name: "lead-1", stage: "needs_you", activity: null, step: "Bash: npm test", needs: "permission",
          tty: "ttys001", termProgram: "TestTerm",
          subagents: [{ id: "x1", name: "Explore-1", stage: "working", activity: "Read", step: "Read" }],
        },
      ],
    },
    {
      project: "other-app",
      cwd: "/work/other-app",
      leads: [
        { id: "s2", name: "lead-2", stage: "working", activity: null, step: null, tty: null, termProgram: null, subagents: [] },
      ],
    },
  ],
};

const sse = (t: unknown) => `event: state\ndata: ${JSON.stringify(t)}\n\n`;

async function open(page: Page, jumpReply: { status: number; body?: string } = { status: 204 }) {
  const jumps: unknown[] = [];
  await page.route("**/stream", (r) =>
    r.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache" }, body: sse(town) }),
  );
  await page.route("**/jump", (r) => {
    jumps.push(r.request().postDataJSON());
    return r.fulfill({ status: jumpReply.status, contentType: "text/plain", body: jumpReply.body ?? "" });
  });
  await page.goto("/");
  return jumps;
}

test("clicking_a_lead_opens_a_panel_with_stage_step_need_and_its_subagents_and_escape_closes_it", async ({ page }) => {
  await open(page);
  await page.locator('section[aria-label="demo-app"] .character').filter({ hasText: "lead-1" }).first().click({ position: { x: 5, y: 5 } });
  const panel = page.getByRole("dialog", { name: "lead-1 details" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("needs_you".replace("_", " "), { ignoreCase: true });
  await expect(panel).toContainText("Bash: npm test");
  await expect(panel).toContainText("waiting for you: permission");
  await expect(panel).toContainText("Explore-1");
  await expect(panel).toContainText(/working/i);
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
  const jumps = await open(page);
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
