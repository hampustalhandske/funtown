import { expect, test } from "@playwright/test";

const town = {
  claude: { version: "2.1.325", problems: [] },
  cards: [],
  houses: [
    {
      project: "demo-app",
      cwd: "/work/demo-app",
      leads: [
        {
          id: "s1", name: "lead-1", stage: "needs_you", activity: null, needs: "permission",
          tty: "ttys001", termProgram: "TestTerm", kind: "terminal", shortId: null,
          subagents: [{ id: "x1", name: "Explore-1", stage: "working", activity: "Bash: npm test" }],
        },
      ],
    },
    {
      project: "other-app",
      cwd: "/work/other-app",
      leads: [
        { id: "s2", name: "lead-2", stage: "working", activity: "Edit", tty: null, termProgram: null, kind: "terminal", shortId: null, subagents: [] },
      ],
    },
  ],
};

test("needs_you_lead_is_flagged_and_its_subagent_is_shown_with_its_command", async ({ page }) => {
  await page.route("**/stream", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: `event: state\ndata: ${JSON.stringify(town)}\n\n`,
    }),
  );
  await page.goto("/work.html");

  const demo = page.locator('section[aria-label="demo-app"]');
  const other = page.locator('section[aria-label="other-app"]');
  await expect(demo).toBeVisible();
  await expect(other).toBeVisible();

  // lead-1's own character, inside the demo-app house, is flagged.
  const lead1 = demo.locator('.character[data-stage="needs_you"]').filter({ hasText: "lead-1" });
  await expect(lead1).toHaveCount(1);
  await expect(lead1).toContainText(/needs you/i);

  // Explore-1 sits in lead-1's subagent list, working, with its command.
  const sub = demo.locator('ul[aria-label="lead-1 subagents"] .character[data-stage="working"]');
  await expect(sub).toHaveCount(1);
  await expect(sub).toContainText("Explore-1");
  await expect(sub).toContainText("Bash: npm test");

  // lead-2 is in the other house, working, and Explore-1 is not there.
  await expect(other.locator('.character[data-stage="working"]').filter({ hasText: "lead-2" })).toHaveCount(1);
  await expect(other.getByText("Explore-1")).toHaveCount(0);
  await expect(other.getByText(/needs you/i)).toHaveCount(0);
});

test("loading_the_page_logs_no_failed_requests_such_as_a_favicon_404", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  page.on("response", (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  await page.route("**/stream", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: `event: state\ndata: ${JSON.stringify({ claude: { version: "2.1.325", problems: [] }, houses: [], cards: [] })}\n\n`,
    }),
  );
  await page.goto("/work.html");
  await page.waitForLoadState("networkidle");
  // Headless Chromium never requests /favicon.ico, so check that the page declares its own icon.
  await expect(page.locator('link[rel="icon"]')).toHaveCount(1);
  expect(problems).toEqual([]);
});
