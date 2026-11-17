import { expect, test, type Page } from "@playwright/test";
import { E2E_URL } from "../fake-claude.ts";
import { stubStream, visibleWords } from "./stream.ts";

const claude = { version: "2.1.325", problems: [] };
const lead = (id: string, name: string, over: Record<string, unknown> = {}, subagents: unknown[] = []) => ({
  id, name, stage: "working", activity: null, step: null, tty: null, termProgram: null, kind: "terminal", shortId: null, subagents, ...over,
});
const sub = (id: string, name: string, role: string, over: Record<string, unknown> = {}) => ({ id, name, stage: "working", activity: null, step: null, role, ...over });

const DEMO = "/work/demo-app";
/** A cwd whose encoding differs from its text in three ways: a space, a percent sign and a hash. */
const ODD = "/work/a b%41#c";
const STEPS = ["plan", "build", "review", "ship"];
type Phase = { phase: string; note?: string; steps?: string[] } | null;

/** The town; `phase` is the demo house's phase file, null for none. */
const state = (phase: Phase = { phase: "build", note: "tests first", steps: STEPS }) => ({
  claude,
  cards: [],
  houses: [
    {
      project: "demo-app",
      cwd: DEMO,
      added: true,
      ...(phase ? { phase } : {}),
      leads: [
        lead("s1", "lead-1", {}, [sub("x1", "Explore-1", "implementer"), sub("x2", "Finished-1", "Plan", { stage: "done" })]),
        lead("s3", "lead-3", { stage: "needs_you", needs: "stuck", reason: "rate limit", since: 9 }),
      ],
      parcels: [
        { number: 4217, title: "Open PR", url: "https://example.test/pull/4217", draft: false, review: { state: "idle" } },
        { number: 4218, title: "Reviewed PR", url: "https://example.test/pull/4218", draft: false, review: { state: "ready", steward: "st1", letter: "L1" } },
      ],
    },
    { project: "other-app", cwd: "/work/other-app", added: true, leads: [lead("s2", "lead-2")] },
    { project: "odd-app", cwd: ODD, added: true, leads: [lead("s4", "lead-4")] },
    { project: "steward", cwd: "/home/me/.funtown/steward", leads: [lead("st1", "steward", { kind: "background", shortId: "st1short" })] },
  ],
});

/** Opens `path` on a stubbed stream; the only requests the page may make are to the server itself. */
async function open(page: Page, path = "/", initial: unknown = state()) {
  const stream = await stubStream(page, initial);
  await page.route("**/letters?*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto(path);
  await expect(page.locator("canvas")).toHaveCount(1);
  return stream;
}
const item = (page: Page, name: RegExp | string) => page.getByRole("button", { name });
const building = (page: Page, project: string) => item(page, `${project}, house`);
const hash = (page: Page) => new URL(page.url()).hash;
const inClassroom = (page: Page, cwd = DEMO) => expect.poll(() => hash(page)).toBe(`#in=${encodeURIComponent(cwd)}`);
const inTown = async (page: Page) => {
  await expect(building(page, "demo-app")).toBeAttached();
  await expect.poll(() => hash(page)).toBe("");
};
const TICK = /[\u2713\u2714\u2611]/;
/**
 * How the board marks the step `label`: the board's line for it is an item of its ordered list: its mark then its label. A tick is done, the words next and later are themselves, any other mark is now.
 */
const markOf = async (page: Page, label: string) => {
  const line = new RegExp(`^(.*?)\\s*${label}$`, "i");
  const marks = (await page.locator("ol > li").allInnerTexts()).map((t) => line.exec(t.trim())?.[1].trim()).filter((m): m is string => m !== undefined);
  const kinds = marks.map((m) => (TICK.test(m) ? "done" : /^next$/i.test(m) ? "next" : /^later$/i.test(m) ? "later" : m === "" ? "plain" : "now"));
  return kinds.length === 1 ? kinds[0] : `${kinds.length} lines: ${kinds.join(",")}`;
};
const drawn = (page: Page, text: string) =>
  page.getByText(text).evaluateAll((els) =>
    els.some((e) => {
      let el: Element | null = e;
      for (; el; el = el.parentElement) if (getComputedStyle(el).opacity === "0" || getComputedStyle(el).visibility === "hidden") return false;
      return e.getBoundingClientRect().width > 40 && e.getBoundingClientRect().height > 8;
    }),
  );

test("a_click_on_a_building_opens_its_classroom_and_sets_the_hash_to_the_encoded_cwd", async ({ page }) => {
  await open(page);
  await building(page, "odd-app").click();
  await inClassroom(page, ODD);
  await expect(item(page, /lead-4/)).toHaveCount(1);
  await expect(item(page, /lead-1/)).toHaveCount(0);
  await expect(building(page, "odd-app")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("a_reload_and_a_pasted_link_land_in_the_same_classroom_and_back_from_the_work_view_returns_to_it", async ({ page }) => {
  await open(page, `/#in=${encodeURIComponent(ODD)}`);
  await expect(item(page, /lead-4/)).toHaveCount(1);
  await expect(item(page, /lead-1/)).toHaveCount(0);
  await page.reload();
  await expect(item(page, /lead-4/)).toHaveCount(1);
  expect(hash(page)).toBe(`#in=${encodeURIComponent(ODD)}`);

  await page.getByRole("link", { name: /^work view$/i }).click();
  await expect(page).toHaveURL(new RegExp("/work\\.html#"));
  await page.goBack();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(item(page, /lead-4/)).toHaveCount(1);
  expect(hash(page)).toBe(`#in=${encodeURIComponent(ODD)}`);
});

test("a_house_that_does_not_exist_or_stops_existing_falls_back_to_the_town", async ({ page }) => {
  const stream = await open(page, `/#in=${encodeURIComponent("/work/gone")}`);
  await inTown(page);
  await expect(building(page, "other-app")).toBeAttached();
  await building(page, "other-app").click();
  await inClassroom(page, "/work/other-app");
  const next = state() as { houses: { cwd: string }[] };
  next.houses = next.houses.filter((h) => h.cwd !== "/work/other-app");
  stream.send(next);
  await inTown(page);
});

test("escape_closes_an_open_panel_first_then_leaves_the_classroom_and_the_back_icon_leaves_at_once", async ({ page }) => {
  await open(page, `/#in=${encodeURIComponent(DEMO)}`);
  await item(page, /lead-1/).click();
  await expect(page.getByRole("dialog", { name: "lead-1 details" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await inClassroom(page);
  await page.keyboard.press("Escape");
  await inTown(page);

  await building(page, "demo-app").click();
  await inClassroom(page);
  await page.getByRole("button", { name: /back/i }).or(page.getByRole("link", { name: /back/i })).first().click();
  await inTown(page);
  await expect(item(page, /lead-1/)).toHaveCount(1);
});

test("the_work_view_icon_in_the_classroom_goes_to_that_houses_work_view_and_the_towns_icon_stays_plain", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("link", { name: /^work view$/i })).toHaveAttribute("href", "/work.html");
  await building(page, "demo-app").click();
  await inClassroom(page);
  const icon = page.getByRole("link", { name: /^work view$/i });
  await expect(icon).toHaveAttribute("href", `/work.html#${encodeURIComponent(DEMO)}`);
  await icon.click();
  await expect(page).toHaveURL(`${E2E_URL}/work.html#${encodeURIComponent(DEMO)}`);
});

test("the_classroom_holds_this_houses_leads_working_subagents_and_parcels_and_nothing_from_other_houses", async ({ page }) => {
  await open(page, `/#in=${encodeURIComponent(DEMO)}`);
  await expect(item(page, /lead-1/)).toHaveAccessibleName(/demo-app/);
  await expect(item(page, /lead-3/)).toHaveAccessibleName(/stuck/i);
  const hat = item(page, /Explore-1/);
  await expect(hat).toHaveCount(1);
  await expect(hat).toHaveAccessibleName(/implementer/);
  await expect(item(page, /4217/)).toHaveCount(1);
  await expect(item(page, /4218/)).toHaveCount(1);
  await expect(item(page, /Finished-1/)).toHaveCount(0);
  await expect(item(page, /lead-2/)).toHaveCount(0);
  await expect(item(page, /lead-4/)).toHaveCount(0);
});

test("an_empty_classroom_still_opens_with_a_canvas_and_offers_nothing_to_click_because_the_observer_is_not_a_button", async ({ page }) => {
  const empty = state();
  empty.houses[0].leads = [];
  delete (empty.houses[0] as { parcels?: unknown }).parcels;
  await open(page, `/#in=${encodeURIComponent(DEMO)}`, empty);
  await inClassroom(page);
  await expect(page.getByRole("list", { name: "Town" }).getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("listitem").first()).toBeAttached();
});

test("a_done_subagent_and_an_unlisted_lead_leave_the_classroom_within_5_seconds", async ({ page }) => {
  const stream = await open(page, `/#in=${encodeURIComponent(DEMO)}`);
  await expect(item(page, /lead-2/), "only this house is in the room").toHaveCount(0);
  await expect(item(page, /Explore-1/)).toHaveCount(1);
  await expect(item(page, /lead-3/)).toHaveCount(1);
  const next = state() as { houses: { leads: { subagents: { stage: string }[] }[] }[] };
  next.houses[0].leads[0].subagents[0].stage = "done";
  next.houses[0].leads.splice(1, 1);
  stream.send(next);
  await expect(item(page, /Explore-1/)).toHaveCount(0, { timeout: 5000 });
  await expect(item(page, /lead-3/)).toHaveCount(0, { timeout: 5000 });
  await expect(item(page, /lead-1/)).toHaveCount(1);
});

test("clicking_a_lead_a_subagent_or_a_parcel_in_the_classroom_opens_the_same_panels_as_the_town", async ({ page }) => {
  await open(page, `/#in=${encodeURIComponent(DEMO)}`);
  await expect(item(page, /lead-2/), "only this house is in the room").toHaveCount(0);
  await item(page, /lead-1/).click();
  await expect(page.getByRole("dialog", { name: "lead-1 details" })).toBeVisible();
  await page.keyboard.press("Escape");
  await item(page, /Explore-1/).click();
  await expect(page.getByRole("dialog", { name: "Explore-1 details" })).toBeVisible();
  await page.keyboard.press("Escape");
  await item(page, /4218/).click();
  await expect(page.getByRole("dialog", { name: "steward details" })).toBeVisible();
  await page.keyboard.press("Escape");
  await item(page, /4217/).click();
  await expect(page.getByRole("dialog", { name: "Pull request 4217" })).toBeVisible();
  await inClassroom(page);
});

test("the_whiteboard_shows_the_project_phase_note_and_marks_each_step_and_follows_a_phase_change", async ({ page }) => {
  const stream = await open(page, `/#in=${encodeURIComponent(DEMO)}`);
  await expect.poll(() => drawn(page, "tests first")).toBe(true);
  expect(await drawn(page, "demo-app")).toBe(true);
  expect(await drawn(page, "build")).toBe(true);
  await expect(page.getByText("build").first()).toHaveCSS("font-family", /Recursive Variable/);

  // The phase is `build`: plan is done (ticked), build is now (marked, not ticked), review is next, ship is later.
  const marks = async () => Object.fromEntries(await Promise.all(STEPS.map(async (s) => [s, await markOf(page, s)])));
  await expect.poll(marks).toEqual({ plan: "done", build: "now", review: "next", ship: "later" });

  stream.send(state({ phase: "review", steps: STEPS }));
  await expect.poll(marks, { timeout: 5000 }).toEqual({ plan: "done", build: "done", review: "now", ship: "next" });
  await expect.poll(() => drawn(page, "tests first"), { timeout: 5000 }).toBe(false);

  stream.send(state({ phase: "polish", note: "off the list", steps: STEPS }));
  await expect.poll(marks, { timeout: 5000 }).toEqual({ plan: "later", build: "later", review: "later", ship: "later" });
  await expect.poll(() => drawn(page, "off the list"), { timeout: 5000 }).toBe(true);
});

/** The board's line for step `label`: an item of the board's ordered list (the hidden list is unordered). */
const boardLine = (page: Page, label: string) => page.locator("ol > li").filter({ hasText: new RegExp(`^\\S*\\s*${label}$`) });

test("a_board_with_24_steps_draws_every_one_inside_the_board_card_with_nothing_clipped", async ({ page }) => {
  const many = Array.from({ length: 24 }, (_, i) => `step ${String(i + 1).padStart(2, "0")}`);
  await open(page, `/#in=${encodeURIComponent(DEMO)}`, state({ phase: many[11], note: "a long plan", steps: many }));
  await expect.poll(() => drawn(page, "a long plan")).toBe(true);
  for (const label of many) await expect(boardLine(page, label), label).toHaveCount(1);
  // The card is the nearest ancestor of a step's line that also holds the project heading.
  const edges = await Promise.all(
    many.map((label) =>
      boardLine(page, label).evaluate((li) => {
        let card: Element | null = li;
        while (card && ![...card.querySelectorAll("h2")].some((h) => h.textContent === "demo-app")) card = card.parentElement;
        const [c, b] = [card!.getBoundingClientRect(), li.getBoundingClientRect()];
        return { label: li.textContent, top: b.top - c.top, bottom: c.bottom - b.bottom, left: b.left - c.left, right: c.right - b.right, height: b.height, inView: b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth };
      }),
    ),
  );
  for (const e of edges) {
    expect(Math.min(e.top, e.bottom, e.left, e.right), `${e.label} lies inside the card`).toBeGreaterThanOrEqual(-1);
    expect(e.height, `${e.label} is tall enough to read`).toBeGreaterThan(4);
    expect(e.inView, `${e.label} is on screen`).toBe(true);
  }
});

test("a_board_whose_steps_repeat_a_label_draws_every_line_through_a_phase_change", async ({ page }) => {
  const steps = ["plan", "review", "review", "ship"];
  const stream = await open(page, `/#in=${encodeURIComponent(DEMO)}`, state({ phase: "plan", steps }));
  await expect(boardLine(page, "review")).toHaveCount(2);
  stream.send(state({ phase: "ship", steps }));
  await expect.poll(() => markOf(page, "plan"), { timeout: 5000 }).toBe("done");
  await expect(boardLine(page, "review")).toHaveCount(2);
  await expect(boardLine(page, "ship")).toHaveCount(1);
});

test("a_whiteboard_without_steps_shows_the_phase_and_note_only_and_without_a_phase_file_shows_neither", async ({ page }) => {
  const stream = await open(page, `/#in=${encodeURIComponent(DEMO)}`, state({ phase: "build", note: "tests first" }));
  await expect.poll(() => drawn(page, "tests first")).toBe(true);
  expect(await drawn(page, "build")).toBe(true);
  await expect(page.getByRole("listitem").filter({ hasText: /\b(next|later)\b/ })).toHaveCount(0);

  stream.send(state(null));
  await expect.poll(() => drawn(page, "tests first"), { timeout: 5000 }).toBe(false);
  expect(await drawn(page, "build")).toBe(false);
});

test("the_town_view_shows_no_words_before_and_after_a_visit_to_a_classroom", async ({ page }) => {
  await open(page);
  expect(await visibleWords(page)).toEqual([]);
  await building(page, "demo-app").click();
  await inClassroom(page);
  await expect.poll(() => drawn(page, "tests first")).toBe(true);
  await page.keyboard.press("Escape");
  await inTown(page);
  await expect.poll(() => visibleWords(page)).toEqual([]);
});

test("the_classroom_fetches_nothing_from_another_origin", async ({ page }) => {
  const outside: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(E2E_URL) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) outside.push(r.url());
  });
  await open(page, `/#in=${encodeURIComponent(DEMO)}`);
  await expect.poll(() => drawn(page, "tests first")).toBe(true);
  await page.waitForLoadState("networkidle");
  expect(outside).toEqual([]);
});
