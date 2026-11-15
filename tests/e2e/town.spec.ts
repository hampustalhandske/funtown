import { expect, test } from "@playwright/test";

const town = {
  houses: [
    {
      project: "demo-app",
      cwd: "/work/demo-app",
      leads: [
        {
          id: "s1", name: "lead-1", stage: "needs_you", activity: null, needs: "permission",
          tty: "ttys001", termProgram: "TestTerm",
          subagents: [{ id: "x1", name: "Explore-1", stage: "working", activity: "Bash: npm test" }],
        },
      ],
    },
    {
      project: "other-app",
      cwd: "/work/other-app",
      leads: [
        { id: "s2", name: "lead-2", stage: "working", activity: "Edit", tty: null, termProgram: null, subagents: [] },
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
  await page.goto("/");

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
