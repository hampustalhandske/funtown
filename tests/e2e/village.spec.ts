import { expect, test, type Page } from "@playwright/test";
import { E2E_URL } from "../fake-claude.ts";
import { stubStream } from "./stream.ts";

const claude = { version: "2.1.325", problems: [] };
const lead = (id: string, name: string, over: Record<string, unknown> = {}, subagents: unknown[] = []) => ({
  id, name, stage: "working", activity: null, step: null, tty: null, termProgram: null, kind: "terminal", shortId: null, subagents, ...over,
});
const sub = (id: string, name: string, role: string, over: Record<string, unknown> = {}) => ({ id, name, stage: "working", activity: null, step: null, role, ...over });
const PR_URL = "https://example.test/pull/4217";
const state = (over: { houses?: unknown[] } = {}) => ({
  claude,
  cards: [],
  houses: over.houses ?? [
    {
      project: "demo-app",
      cwd: "/work/demo-app",
      added: true,
      leads: [
        lead("s1", "lead-1", { stage: "needs_you", needs: "permission", since: 5 }, [
          sub("x1", "Explore-1", "implementer"),
          sub("x2", "Finished-1", "Plan", { stage: "done" }),
        ]),
        lead("s3", "lead-3", { stage: "needs_you", needs: "stuck", reason: "rate limit", since: 9 }),
      ],
      parcels: [
        { number: 4217, title: "Open PR", url: PR_URL, draft: false, review: { state: "idle" } },
        { number: 4218, title: "Reviewed PR", url: "https://example.test/pull/4218", draft: false, review: { state: "ready", steward: "st1", letter: "L1" } },
      ],
    },
    { project: "other-app", cwd: "/work/other-app", added: true, leads: [lead("s2", "lead-2")] },
    { project: "steward", cwd: "/home/me/.funtown/steward", leads: [lead("st1", "steward", { kind: "background", shortId: "st1short" })] },
  ],
});

/** Opens the town on a stubbed stream; nothing the page asks for may leave the server. */
async function openTown(page: Page, initial: unknown = state()) {
  const stream = await stubStream(page, initial);
  await page.route("**/letters?*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  return stream;
}
/** An entry of the visually hidden list; clicked like any button. */
const item = (page: Page, name: RegExp) => page.getByRole("button", { name });

test("the_hidden_list_names_every_character_hat_and_parcel_with_project_role_and_stage_and_omits_the_done_agent", async ({ page }) => {
  await openTown(page);
  const lead1 = item(page, /lead-1/);
  await expect(lead1).toHaveCount(1);
  await expect(lead1).toHaveAccessibleName(/demo-app/);
  await expect(lead1).toHaveAccessibleName(/needs.?you/i);
  await expect(item(page, /lead-3/)).toHaveAccessibleName(/stuck/i);
  await expect(item(page, /lead-2/)).toHaveAccessibleName(/other-app/);
  await expect(item(page, /lead-2/)).toHaveAccessibleName(/working/i);
  const hat = item(page, /Explore-1/);
  await expect(hat).toHaveCount(1);
  await expect(hat).toHaveAccessibleName(/implementer/);
  await expect(hat).toHaveAccessibleName(/demo-app/);
  await expect(item(page, /4217/)).toHaveCount(1);
  await expect(item(page, /4217/)).toHaveAccessibleName(/review not asked/);
  await expect(item(page, /4218/)).toHaveCount(1);
  await expect(item(page, /Finished-1/)).toHaveCount(0);
});

test("an_agent_that_finishes_or_a_lead_that_is_unlisted_leaves_the_town_within_5_seconds", async ({ page }) => {
  const stream = await openTown(page);
  await expect(item(page, /Explore-1/)).toHaveCount(1);
  await expect(item(page, /lead-2/)).toHaveCount(1);
  const next = state() as { houses: { leads: { subagents: { stage: string }[] }[] }[] };
  next.houses[0].leads[0].subagents[0].stage = "done";
  next.houses.splice(1, 1);
  stream.send(next);
  await expect(item(page, /Explore-1/)).toHaveCount(0, { timeout: 5000 });
  await expect(item(page, /lead-2/)).toHaveCount(0, { timeout: 5000 });
  await expect(item(page, /lead-1/)).toHaveCount(1);
});

test("clicking_a_lead_or_a_hat_opens_that_characters_panel", async ({ page }) => {
  await openTown(page);
  await item(page, /lead-2/).click();
  await expect(page.getByRole("dialog", { name: "lead-2 details" })).toBeVisible();
  await page.keyboard.press("Escape");
  await item(page, /Explore-1/).click();
  await expect(page.getByRole("dialog", { name: "Explore-1 details" })).toBeVisible();
});

test("a_ready_parcel_opens_the_stewards_panel_and_an_unasked_one_a_panel_that_asks_only_on_its_button", async ({ page }) => {
  await openTown(page);
  const requested: string[] = [];
  await page.context().route("https://example.test/**", (r) => {
    requested.push(r.request().url());
    return r.fulfill({ status: 200, contentType: "text/html", body: "<title>pr</title>" });
  });
  const asked: { body: unknown; token: string | undefined; origin: string | undefined }[] = [];
  await page.route("**/review", (r) => {
    const req = r.request();
    asked.push({ body: req.postDataJSON(), token: req.headers()["x-funtown-token"], origin: req.headers()["origin"] });
    return r.fulfill({ status: 204 });
  });
  await item(page, /4218/).click();
  await expect(page.getByRole("dialog", { name: "steward details" })).toBeVisible();
  expect(requested).toEqual([]);
  await page.keyboard.press("Escape");

  // An unasked parcel opens its panel: nothing is asked and no PR is opened until a button is chosen.
  await item(page, /4217/).click();
  const ask = page.getByRole("button", { name: "Ask steward to review" });
  const open = page.getByRole("link", { name: "Open PR", exact: true }).or(page.getByRole("button", { name: "Open PR", exact: true }));
  await expect(ask).toBeVisible();
  await expect(open).toBeVisible();
  await page.waitForTimeout(300);
  expect(asked).toEqual([]);
  expect(requested).toEqual([]);

  await ask.click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0].body).toEqual({ cwd: "/work/demo-app", number: 4217 });
  expect(asked[0].token).toBeTruthy();
  expect(asked[0].origin).toBeTruthy();
  expect(requested).toEqual([]);
});

test("an_unasked_parcels_panel_opens_the_pr_from_open_pr_and_asks_nothing", async ({ page }) => {
  await openTown(page);
  const requested: string[] = [];
  await page.context().route("https://example.test/**", (r) => {
    requested.push(r.request().url());
    return r.fulfill({ status: 200, contentType: "text/html", body: "<title>pr</title>" });
  });
  let asked = 0;
  await page.route("**/review", (r) => {
    asked++;
    return r.fulfill({ status: 204 });
  });
  await item(page, /4217/).click();
  await page.getByRole("link", { name: "Open PR", exact: true }).or(page.getByRole("button", { name: "Open PR", exact: true })).click();
  await expect.poll(() => requested).toContain(PR_URL);
  expect(asked).toBe(0);
});

test("the_town_page_shows_no_words_outside_panels_and_has_a_full_window_canvas_with_labelled_icon_buttons", async ({ page }) => {
  await openTown(page);
  await expect(page.locator("canvas")).toHaveCount(1);
  const view = page.viewportSize()!;
  await expect.poll(async () => (await page.locator("canvas").boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(view.width - 1);
  expect((await page.locator("canvas").boundingBox())!.height).toBeGreaterThanOrEqual(view.height - 1);
  for (const label of [/^settings$/i, /^work view$/i]) {
    await expect(page.getByRole("button", { name: label }).or(page.getByRole("link", { name: label })).first()).toBeAttached();
  }
  await expect(page.getByRole("navigation", { name: "Controls" }).locator('button[aria-label="Morning"]')).toHaveCount(1);
  const words = await page.evaluate(() => {
    const seen: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent?.trim();
      if (!text) continue;
      let hidden = false;
      for (let el = n.parentElement; el && !hidden; el = el.parentElement) {
        const r = el.getBoundingClientRect();
        const css = getComputedStyle(el);
        hidden = css.fontSize === "0px" || /, 0\)$/.test(css.color) || r.width <= 2 || r.height <= 2 || css.visibility === "hidden" || css.display === "none" || css.opacity === "0";
      }
      if (!hidden && !["SCRIPT", "STYLE", "NOSCRIPT"].includes(n.parentElement!.tagName)) seen.push(text);
    }
    return seen;
  });
  expect(words).toEqual([]);
});

test("the_settings_pane_offers_add_project_and_a_remove_project_per_project", async ({ page }) => {
  await openTown(page);
  await page.getByRole("button", { name: /settings/i }).click();
  await expect(page.getByRole("textbox", { name: "Project folder" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add project" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^remove (demo|other)-app$/i })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Remove demo-app" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Remove other-app" })).toHaveCount(1);
});

test("i_had_to_switch_is_in_the_settings_pane_and_not_in_the_towns_icon_row", async ({ page }) => {
  await openTown(page);
  await expect(page.getByRole("navigation", { name: "Controls" }).getByRole("button", { name: /i had to switch/i })).toHaveCount(0);
  await page.getByRole("button", { name: /^settings$/i }).click();
  const button = page.getByRole("dialog", { name: "Settings" }).getByRole("button", { name: "I had to switch" });
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByRole("textbox", { name: "Why?" })).toBeVisible();
});

test("the_town_loads_three_and_work_html_neither_loads_it_nor_draws_a_canvas", async ({ page }) => {
  const scripts: Promise<string>[] = [];
  page.on("response", (r) => r.url().endsWith(".js") && scripts.push(r.text()));
  await openTown(page);
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.waitForLoadState("networkidle");
  expect((await Promise.all(scripts)).some((s) => s.includes("WebGLRenderer"))).toBe(true);

  const workScripts: Promise<string>[] = [];
  const work = await page.context().newPage();
  work.on("response", (r) => r.url().endsWith(".js") && workScripts.push(r.text()));
  await stubStream(work, state());
  await work.goto("/work.html");
  await expect(work.locator('section[aria-label="demo-app"]')).toBeVisible();
  await work.waitForLoadState("networkidle");
  expect(await work.locator("canvas").count()).toBe(0);
  expect((await Promise.all(workScripts)).filter((s) => s.includes("WebGLRenderer"))).toEqual([]);
  await expect(work.locator('a[href="/"]')).toHaveCount(1);
});

test("both_pages_use_the_bundled_recursive_font_and_fetch_nothing_from_another_origin", async ({ page }) => {
  const outside: string[] = [];
  const fonts: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(E2E_URL) && !r.url().startsWith("data:")) outside.push(r.url());
    if (/\.woff2?$/.test(r.url())) fonts.push(r.url());
  });
  for (const path of ["/", "/work.html"]) {
    await stubStream(page, state());
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily), path).toContain("Recursive Variable");
  }
  expect(fonts.filter((f) => /recursive/i.test(f)).length).toBeGreaterThan(0);
  expect(outside).toEqual([]);
});

test("a_building_links_to_its_house_in_the_work_view_and_the_link_scrolls_to_that_house", async ({ page }) => {
  const houses = Array.from({ length: 12 }, (_, i) => ({
    project: `proj-${i}`,
    cwd: `/work/proj-${i}`,
    leads: [0, 1, 2].map((j) => lead(`l${i}-${j}`, `lead-${i}-${j}`, {}, [sub(`h${i}-${j}`, `hat-${i}-${j}`, "Plan")])),
  }));
  await openTown(page, state({ houses }));
  const link = page.getByRole("link", { name: "proj-4, house" });
  await expect(link).toHaveAttribute("href", `/work.html#${encodeURIComponent("/work/proj-4")}`);
  await link.click();
  await expect(page).toHaveURL(/\/work\.html#/);
  const target = page.locator('section[aria-label="proj-4"]');
  await expect(target).toBeInViewport();
  await expect.poll(() => target.evaluate((el) => el.getBoundingClientRect().top)).toBeLessThan(page.viewportSize()!.height / 4);
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await expect(page.locator('section[aria-label="proj-0"]')).not.toBeInViewport();
});

test("a_cwd_with_percent_and_hash_links_to_its_own_house_and_the_work_page_does_not_blank", async ({ page }) => {
  const names = ["50%off", "a%41", "c#d"];
  const houses = [...names, ...Array.from({ length: 10 }, (_, i) => `fill-${i}`)].map((n) => ({
    project: n,
    cwd: `/work/${n}`,
    leads: [0, 1, 2].map((j) => lead(`l-${n}-${j}`, `lead-${n}-${j}`, {}, [sub(`h-${n}-${j}`, `hat-${n}-${j}`, "Plan")])),
  }));
  // The target is last in the work view, so reaching it takes a real scroll.
  const ordered = [...houses.filter((h) => !names.includes(h.project)), ...houses.filter((h) => names.includes(h.project))];
  for (const n of names) {
    await openTown(page, state({ houses: ordered }));
    await page.getByRole("link", { name: `${n}, house` }).click();
    await expect(page).toHaveURL(/\/work\.html#/);
    const target = page.locator(`section[aria-label="${n}"]`);
    await expect(target).toBeVisible();
    await expect(target).toBeInViewport();
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  }
});

test("a_malformed_hash_on_the_work_page_shows_the_houses_unscrolled", async ({ page }) => {
  await stubStream(page, state());
  await page.goto("/work.html#/work/50%off");
  await expect(page.locator('section[aria-label="demo-app"]')).toBeVisible();
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test("one_escape_closes_only_the_top_pane_when_settings_and_a_panel_are_both_open", async ({ page }) => {
  await openTown(page);
  await item(page, /lead-2/).click();
  await expect(page.getByRole("dialog", { name: "lead-2 details" })).toBeVisible();
  await page.getByRole("button", { name: /^settings$/i }).click();
  await expect(page.getByRole("dialog")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(1);
});
