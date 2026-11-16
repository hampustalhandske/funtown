import { expect, test, type Page } from "@playwright/test";
import { stubStream } from "./stream.ts";

const lead = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, name, stage: "working", activity: "Edit", step: "Edit", tty: null, termProgram: null, kind: "terminal", shortId: null, subagents: [], ...over,
});
const url = (n: number) => `https://github.com/example/repo/pull/${n}`;
const REVIEW = "Squash: Fix the parser\n\nCheck the parser tests before merging.";

const town = {
  claude: { version: "2.1.325", problems: [] },
  cards: [],
  houses: [
    {
      project: "demo-app",
      cwd: "/work/demo-app",
      phase: { phase: "build", note: "tests first" },
      leads: [
        lead("s1", "alpha", {
          tags: ["owner"],
          overlaps: [{ file: "src/a.ts", with: "s2", withName: "beta" }],
          subagents: [{ id: "x1", name: "helper-1", stage: "working", activity: "Edit", step: "Edit", role: "implementer", tags: ["writes", "m13"] }],
        }),
        lead("s2", "beta", { overlaps: [{ file: "src/a.ts", with: "s1", withName: "alpha" }] }),
      ],
      parcels: [
        { number: 12, title: "Fix the parser", url: url(12), draft: false, review: { state: "ready", steward: "st1", letter: "L1" } },
        { number: 11, title: "Add docs", url: url(11), draft: false, review: { state: "reviewing", steward: "st1" } },
        { number: 10, title: "Try an idea", url: url(10), draft: true },
        { number: 9, title: "Wait in line", url: url(9), draft: false, review: { state: "queued" } },
      ],
    },
    {
      project: "steward",
      cwd: "/home/me/.funtown/steward",
      leads: [lead("st1", "steward", { stage: "needs_you", activity: null, needs: "turn ended", since: 1, letter: 2, kind: "background", shortId: "st1short" })],
    },
  ],
};

const house = (page: Page) => page.locator('section[aria-label="demo-app"]');
/** A lead's row, by the name its accessible name starts with (a warning's text may name the other lead). */
const row = (page: Page, name: string) => house(page).getByRole("button", { name: new RegExp(`^${name}, `) });
const panel = (page: Page, name: string) => page.getByRole("dialog", { name: `${name} details` });
const parcel = (page: Page, n: number) => house(page).getByRole("listitem").filter({ hasText: `#${n} ` });

test.beforeEach(async ({ page }) => {
  await stubStream(page, town);
  await page.route("**/letters?lead=st1", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "L1", from: "st1", name: "steward", text: REVIEW, at: 2 }]) }),
  );
  await page.goto("/");
  await expect(house(page)).toBeVisible();
});

test("the_phase_shows_on_the_project_heading_with_its_note", async ({ page }) => {
  await expect(house(page).getByRole("heading")).toContainText("build");
  await expect(house(page)).toContainText("tests first");
});

test("a_subagents_role_and_tags_and_a_leads_tags_show_on_their_rows_and_the_role_in_the_panel", async ({ page }) => {
  const sub = page.locator('ul[aria-label="alpha subagents"] .character').filter({ hasText: "helper-1" });
  await expect(sub).toContainText("implementer");
  await expect(sub).toContainText("writes");
  await expect(sub).toContainText("m13");
  await expect(row(page, "alpha")).toContainText("owner");
  await sub.click();
  await expect(panel(page, "helper-1")).toContainText("implementer");
});

test("both_leads_that_touched_one_file_warn_on_their_rows_and_in_the_panel", async ({ page }) => {
  await expect(row(page, "alpha")).toContainText("⚠ also editing src/a.ts with beta");
  await expect(row(page, "beta")).toContainText("⚠ also editing src/a.ts with alpha");
  await row(page, "beta").click({ position: { x: 5, y: 5 } });
  await expect(panel(page, "beta")).toContainText("⚠ also editing src/a.ts with alpha");
});

test("each_parcel_shows_number_title_a_link_its_draft_mark_or_review_state", async ({ page }) => {
  await expect(parcel(page, 12)).toContainText("#12 Fix the parser");
  await expect(parcel(page, 12).getByRole("link")).toHaveAttribute("href", url(12));
  await expect(parcel(page, 12)).toContainText("review ready ✉");
  await expect(parcel(page, 11)).toContainText("reviewing");
  await expect(parcel(page, 10)).toContainText("draft");
  await expect(parcel(page, 10)).not.toContainText(/queued|reviewing|review ready/);
  await expect(parcel(page, 9)).toContainText("queued");
  await expect(parcel(page, 9)).not.toContainText("draft");
});

test("clicking_a_ready_review_opens_the_stewards_panel_with_the_review_as_written", async ({ page }) => {
  await parcel(page, 12).getByText("review ready ✉").click();
  const letters = panel(page, "steward").getByRole("region", { name: "Letters" });
  await expect(letters).toContainText("Squash: Fix the parser");
  await expect(letters).toContainText("Check the parser tests before merging.");
});
