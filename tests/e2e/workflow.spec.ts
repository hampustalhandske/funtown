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
        { number: 8, title: "Not asked yet", url: url(8), draft: false, review: { state: "idle" } },
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
  await page.goto("/work.html");
  await expect(house(page)).toBeVisible();
});

test("the_phase_shows_on_the_project_heading_with_its_note", async ({ page }) => {
  await expect(house(page).getByRole("heading")).toContainText("build");
  await expect(house(page)).toContainText("tests first");
});

test("the_goal_and_spec_show_beside_the_phase_and_note_as_text", async ({ page }) => {
  const goal = "Every ask comes with its brief";
  const spec = "desk-brief";
  await stubStream(page, { ...town, houses: [{ ...town.houses[0], phase: { phase: "build", note: "tests first", goal, spec } }, town.houses[1]] });
  await page.reload();
  await expect(house(page).getByRole("heading")).toContainText("tests first");
  await expect(house(page).getByRole("heading")).toContainText(goal);
  await expect(house(page).getByRole("heading")).toContainText(spec);
});

test("a_long_goal_wraps_within_the_houses_own_width_and_shows_in_full_without_a_hover", async ({ page }) => {
  // Catches a goal that stretches its house across the row, or one cut short with the rest only in a hover title.
  const goal = "Invoices export from one button for every customer, including the biggest one with about 1.2 million invoice rows a year, without new infrastructure and without breaking the nightly report";
  const width = async () => (await house(page).boundingBox())!.width;
  const plain = await width();
  await stubStream(page, { ...town, houses: [{ ...town.houses[0], phase: { phase: "build", note: "tests first", goal } }, town.houses[1]] });
  await page.reload();
  const line = house(page).locator(".phase-line");
  await expect(line).toContainText(goal);
  expect(await width()).toBe(plain);
  expect(await line.evaluate((e) => e.scrollWidth <= e.clientWidth && e.getClientRects().length > 0)).toBe(true);
  await expect(line).toBeInViewport({ ratio: 1 });
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

test("each_parcel_row_says_its_checks_in_words_failed_with_how_long_ago_running_passed_or_none", async ({ page }) => {
  // Catches a red PR that looks like a green one, and "no checks" shown as passed.
  const parcels = [
    { number: 21, title: "Red since", url: url(21), draft: false, checks: "red", redAt: Date.now() - 12 * 60_000 },
    { number: 22, title: "Red unknown time", url: url(22), draft: false, checks: "red" },
    { number: 23, title: "Still going", url: url(23), draft: false, checks: "running" },
    { number: 24, title: "All clear", url: url(24), draft: false, checks: "green" },
    { number: 25, title: "Nothing ran", url: url(25), draft: false, checks: "none" },
  ];
  await stubStream(page, { ...town, houses: [{ ...town.houses[0], parcels }, town.houses[1]] });
  await page.reload();
  // The title and the words keep a gap: toContainText reads the text as it is, so "Red sincechecks failed" would not match.
  await expect(parcel(page, 21)).toContainText("Red since checks failed 12m ago");
  await expect(parcel(page, 22)).toContainText(/Red unknown time checks failed$/);
  await expect(parcel(page, 23)).toContainText("Still going checks running");
  await expect(parcel(page, 24)).toContainText("All clear checks passed");
  await expect(parcel(page, 25)).toContainText("Nothing ran no checks");
  await expect(parcel(page, 25)).not.toContainText("passed");
});

test("only_an_idle_parcel_has_an_ask_for_review_button_and_it_asks_only_when_clicked", async ({ page }) => {
  const asked: { body: unknown; token: string | undefined; origin: string | undefined }[] = [];
  await page.route("**/review", (r) => {
    const req = r.request();
    asked.push({ body: req.postDataJSON(), token: req.headers()["x-funtown-token"], origin: req.headers()["origin"] });
    return r.fulfill({ status: 204 });
  });
  const button = (n: number) => parcel(page, n).getByRole("button", { name: "Ask steward to review" });
  await expect(button(8)).toBeVisible();
  for (const n of [9, 10, 11, 12]) await expect(button(n)).toHaveCount(0);
  await expect(parcel(page, 8)).not.toContainText("draft");
  expect(asked).toEqual([]);

  await button(8).click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0].body).toEqual({ cwd: "/work/demo-app", number: 8 });
  expect(asked[0].token).toBeTruthy();
  expect(asked[0].origin).toBeTruthy();
});

test("clicking_a_ready_review_opens_the_stewards_panel_with_the_review_fetched_by_its_letter_id_though_a_later_word_is_her_newest", async ({ page }) => {
  // Catches a review pushed out of reach by her word on a card that came after it (story 42).
  const ids: (string | null)[] = [];
  await page.route("**/letters?*", (r) => {
    const id = new URL(r.request().url()).searchParams.get("id");
    ids.push(id);
    const letter = id === "L1" ? { id: "L1", from: "st1", name: "steward", text: REVIEW, at: 2 } : { id: "W2", from: "st1", name: "steward", text: "Pick: Keep both", at: 3 };
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([letter]) });
  });
  await parcel(page, 12).getByText("review ready ✉").click();
  const review = panel(page, "steward").getByRole("region", { name: "Review of #12" });
  await expect(review).toContainText("Squash: Fix the parser");
  await expect(review).toContainText("Check the parser tests before merging.");
  expect(ids).toContain("L1");
});

test("at_390_px_a_long_parcel_title_note_and_overlap_file_do_not_widen_the_page", async ({ page }) => {
  // One word with no break opportunity (no slash, hyphen or space), as a long file name can be.
  const long = "steward_review_requests_and_their_journal_entries_for_every_open_pull_request.ts";
  // The town above with the parcel title, the note and the overlapping file made long.
  const wide = JSON.parse(JSON.stringify(town).replace("Fix the parser", `Fix ${long}`).replace("tests first", `tests first for ${long}`).replaceAll("src/a.ts", long));
  await stubStream(page, wide); // the later route answers first
  await page.setViewportSize({ width: 390, height: 800 });
  await page.reload();
  await expect(parcel(page, 12)).toContainText(long);
  await expect(row(page, "alpha")).toContainText(long);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
