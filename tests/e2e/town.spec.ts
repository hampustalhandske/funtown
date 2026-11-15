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

  await expect(page.getByText("demo-app").first()).toBeVisible();
  await expect(page.getByText("other-app").first()).toBeVisible();
  await expect(page.getByText("lead-1").first()).toBeVisible();
  await expect(page.getByText("Explore-1").first()).toBeVisible();
  await expect(page.getByText("Bash: npm test").first()).toBeVisible();
  await expect(page.getByText("lead-2").first()).toBeVisible();
  await expect(page.getByText(/needs you/i).first()).toBeVisible();
});
