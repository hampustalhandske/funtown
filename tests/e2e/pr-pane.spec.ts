import { expect, test, type Page } from "@playwright/test";
import { alertStubs, house, lead, pr, prUrl, red, stubStream, town, waiting, withPrs } from "./stream.ts";

const NOW = Date.now();
/** Alpha burns (#12 failed) with a green draft #13 beside it; beta holds a green #21 nobody has reviewed. Alpha's lead rests. */
const burning = (beta: Record<string, unknown> = {}) =>
  town([
    withPrs("alpha", [waiting("s1", "rester", NOW - 1000, { needs: "turn ended" })], [red(12), pr(13, { draft: true, title: "Draft work" })]),
    withPrs("beta", [], [pr(21, { review: { state: "idle" }, ...beta })]),
  ]);

/** Opens `path` on a stubbed stream; every request for GitHub is recorded and answered with a bare page. */
async function open(page: Page, path: string, initial: unknown) {
  const requested: string[] = [];
  await page.context().route("https://example.test/**", (r) => {
    requested.push(r.request().url());
    return r.fulfill({ status: 200, contentType: "text/html", body: "<title>pr</title>" });
  });
  await page.addInitScript(alertStubs);
  await page.route("**/letters?*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  const stream = await stubStream(page, initial);
  await page.goto(path);
  if (path === "/") {
    await expect(page.locator("ul.town-list button").first()).toBeAttached();
    await expect(page.locator("canvas")).toHaveCount(1);
  } else {
    await expect(page.locator("section.house").first()).toBeVisible();
  }
  return { stream, requested };
}
const pane = (page: Page, n: number) => page.getByRole("dialog", { name: `Pull request ${n}` });
const plate = (page: Page) => page.locator(".plate");

for (const [path, where] of [["/work.html", "the work view"], ["/", "the town"]] as const) {
  test(`${where}: space_and_shift_space_walk_to_a_burning_house_and_a_waiting_pr_and_open_the_pane_never_github`, async ({ page }) => {
    // Catches Space skipping a PR entry, Space opening GitHub, and (in the town) the house not being marked.
    const { requested } = await open(page, path, burning());
    const popups: unknown[] = [];
    page.context().on("page", (p) => popups.push(p));
    await page.keyboard.press("Space");
    await expect(pane(page, 12)).toBeVisible();
    if (path === "/") await expect(plate(page)).toHaveText("alpha");
    await page.keyboard.press("Space");
    await expect(pane(page, 13)).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await page.keyboard.press("Space");
    await expect(pane(page, 21)).toBeVisible();
    if (path === "/") await expect(plate(page)).toHaveText("beta");
    // The resting lead is the last entry: its panel replaces the PR pane.
    await page.keyboard.press("Space");
    await expect(page.getByRole("dialog", { name: "rester details" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await page.keyboard.press("Shift+Space");
    await expect(pane(page, 21)).toBeVisible();
    await page.keyboard.press("Shift+Space");
    await expect(pane(page, 13)).toBeVisible();
    await page.waitForTimeout(300);
    expect(requested).toEqual([]);
    expect(popups).toEqual([]);
  });

  test(`${where}: the_pane_has_the_number_title_draft_checks_house_word_and_an_open_pr_link_that_only_a_click_follows`, async ({ page }) => {
    // Catches a missing part, and "Open PR" followed by Space or Enter.
    const { requested } = await open(page, path, burning());
    await page.keyboard.press("Space");
    const p = pane(page, 12);
    await expect(p.getByRole("heading")).toHaveText("#12 Broken build");
    await expect(p).toContainText(/checks failed 12\s?m ago/);
    await expect(p).toContainText("burning");
    await expect(p).not.toContainText("draft");
    await expect(p.getByRole("link", { name: "Open PR" })).toHaveAttribute("href", prUrl(12));

    await page.keyboard.press("Space");
    const q = pane(page, 13);
    await expect(q).toContainText("draft");
    await expect(q).toContainText("checks passed");
    await expect(q).toContainText("waits for you");

    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);
    expect(requested, "no key opens GitHub").toEqual([]);
    await page.getByRole("dialog").getByRole("link", { name: "Open PR" }).click();
    await expect.poll(() => requested.length).toBeGreaterThan(0);
  });

  test(`${where}: the_pane_says_the_houses_word_naming_the_project_and_the_prs_own_word_on_its_own_line`, async ({ page }) => {
    // Catches "burning, waits for you" on a green PR in a burning house, as if that PR burned.
    await open(page, path, burning());
    await page.keyboard.press("Space");
    const failed = pane(page, 12);
    await expect(failed.getByText("alpha is burning", { exact: true })).toBeVisible();
    await expect(failed.getByText("waits for you")).toHaveCount(0);
    await page.keyboard.press("Space");
    const green = pane(page, 13);
    await expect(green.getByText("alpha is burning", { exact: true })).toBeVisible();
    await expect(green.getByText("waits for you", { exact: true })).toBeVisible();
    await expect(green).not.toContainText("burning, waits");
  });

  test(`${where}: the_panes_review_part_asks_when_idle_says_its_state_and_reads_her_review_when_ready`, async ({ page }) => {
    const asked: unknown[] = [];
    await page.route("**/review", (r) => {
      asked.push(r.request().postDataJSON());
      return r.fulfill({ status: 204 });
    });
    const steward = lead({ id: "st1", name: "steward", kind: "background", shortId: "st1short", steward: true });
    const withSteward = (beta: Record<string, unknown>) => {
      const t = burning(beta) as { houses: unknown[] };
      return { ...t, houses: [...t.houses, house("steward", [steward])] };
    };
    const { stream } = await open(page, path, withSteward({}));
    // After `open`, so it wins over open's catch-all for letters.
    await page.route("**/letters?lead=st1&id=L1", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "L1", from: "st1", name: "steward", text: "Squash title: fix(x): y", at: 1 }]) }),
    );
    await page.keyboard.press("Space");
    await page.keyboard.press("Space");
    await page.keyboard.press("Space");
    const p = pane(page, 21);
    await expect(p).toBeVisible();
    await page.waitForTimeout(300);
    expect(asked, "opening the pane asks nothing").toEqual([]);
    await p.getByRole("button", { name: "Ask steward to review" }).click();
    await expect.poll(() => asked).toEqual([{ cwd: "/work/beta", number: 21 }]);

    stream.send(withSteward({ review: { state: "queued" } }));
    await expect(p).toContainText("queued");
    await expect(p.getByRole("button", { name: "Ask steward to review" })).toHaveCount(0);
    stream.send(withSteward({ review: { state: "reviewing" } }));
    await expect(p).toContainText("reviewing");
    stream.send(withSteward({ review: { state: "ready", steward: "st1", letter: "L1" } }));
    await p.getByRole("button", { name: "Read her review" }).click();
    await expect(page.getByRole("dialog", { name: "steward details" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Review of #21" })).toContainText("Squash title: fix(x): y");
    await expect(pane(page, 21)).toHaveCount(0);
  });

  test(`${where}: esc_closes_one_layer_per_press_the_key_sheet_then_the_pane`, async ({ page }) => {
    await open(page, path, burning());
    await page.keyboard.press("Space");
    await expect(pane(page, 12)).toBeVisible();
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: /key/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /key/i })).toHaveCount(0);
    await expect(pane(page, 12)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test(`${where}: a_burning_houses_toast_and_notification_open_its_pane_and_a_waiting_pr_has_none`, async ({ page }) => {
    const working = town([
      withPrs("alpha", [lead({})], [red(12)]),
      withPrs("beta", [lead({ id: "s2", name: "lead-2" })], [pr(21)]),
    ]);
    const { stream } = await open(page, path, working);
    await page.waitForTimeout(400);
    stream.send(
      town([
        withPrs("alpha", [waiting("s1", "lead-1", NOW, { needs: "turn ended" })], [red(12)]),
        withPrs("beta", [waiting("s2", "lead-2", NOW, { needs: "turn ended" })], [pr(21)]),
      ]),
    );
    const toast = page.getByRole("status").getByText("alpha is burning: #12 checks failed");
    await expect(toast).toBeVisible();
    await expect(page.getByRole("status")).not.toContainText("beta");
    await toast.click();
    await expect(pane(page, 12)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.evaluate(() => (window as unknown as { __notes: { onclick: () => void }[] }).__notes[0].onclick());
    await expect(pane(page, 12)).toBeVisible();
  });
}

for (const [path, where] of [["/work.html", "the work view"], ["/", "the town"]] as const) {
  test(`${where}: a_fire_under_fog_opens_a_pane_that_says_it_failed_when_last_read_and_not_burning`, async ({ page }) => {
    // Catches the pane calling a fire Funtown can't be sure of "burning", and the fog words missing from it.
    await open(page, path, town([withPrs("gamma", [waiting("s1", "rester", NOW - 1000, { needs: "turn ended" })], [red(31)], { parcelsAt: Date.now() - 10 * 60_000 })]));
    await page.keyboard.press("Space");
    const p = pane(page, 31);
    await expect(p).toBeVisible();
    await expect(p).toContainText("failed when last read");
    await expect(p).toContainText(/PRs last read \d\d:\d\d/);
    await expect(p).not.toContainText("burning");
  });
}

test("a_town_parcel_in_a_house_never_read_says_so_and_does_not_wait_for_you", async ({ page }) => {
  await open(page, "/", town([withPrs("delta", [], [pr(41)], { parcelsAt: undefined })]));
  await page.getByRole("button", { name: /#41/ }).click();
  const p = pane(page, 41);
  await expect(p).toContainText("PRs not read yet");
  await expect(p).not.toContainText("waits for you");
});

test("the_work_views_parcel_rows_stay_links_to_github", async ({ page }) => {
  // Catches a click on a work-view parcel row opening the pane instead of the link.
  await open(page, "/work.html", burning());
  const link = page.locator("section.house", { hasText: "alpha" }).getByRole("link", { name: /#12 Broken build/ });
  await expect(link).toHaveAttribute("href", prUrl(12));
  await expect(link).toHaveAttribute("target", "_blank");
});

test("a_town_parcel_click_opens_the_pane_and_a_ready_review_opens_the_queens_review", async ({ page }) => {
  // Catches the click opening GitHub, and the ready review losing its panel.
  const steward = lead({ id: "st1", name: "steward", kind: "background", shortId: "st1short", steward: true });
  const t = burning({ review: { state: "ready", steward: "st1", letter: "L1" } }) as { houses: unknown[] };
  const { requested } = await open(page, "/", { ...t, houses: [...t.houses, house("steward", [steward])] });
  await page.route("**/letters?lead=st1&id=L1", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "L1", from: "st1", name: "steward", text: "Looks fine", at: 1 }]) }),
  );
  await page.getByRole("button", { name: /#12 Broken build/ }).click();
  await expect(pane(page, 12)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /#21/ }).click();
  await expect(page.getByRole("dialog", { name: "steward details" })).toBeVisible();
  await expect(pane(page, 21)).toHaveCount(0);
  expect(requested).toEqual([]);
});

test("in_the_town_the_arrows_and_enter_are_off_while_the_pane_is_open", async ({ page }) => {
  await open(page, "/", burning());
  await page.waitForTimeout(1200); // the camera settles on the scene it fits
  await page.keyboard.press("Space");
  await expect(pane(page, 12)).toBeVisible();
  await expect(plate(page)).toHaveText("alpha");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowDown");
  await expect(plate(page)).toHaveText("alpha");
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => location.hash)).toBe("");
});

test("the_towns_hidden_list_gives_each_house_its_state_words", async ({ page }) => {
  // Catches a house with no word for its fire or its waiting PRs.
  await open(
    page,
    "/",
    town([
      withPrs("alpha", [waiting("s1", "rester", NOW - 1000, { needs: "turn ended" })], [red(12)]),
      withPrs("beta", [lead({ id: "s2", name: "fixer" })], [red(20)]),
      withPrs("gamma", [], [pr(31), pr(32)]),
      withPrs("delta", [], [pr(41)]),
      withPrs("epsilon", [lead({ id: "s3", name: "busy" })], [pr(51)]),
    ]),
  );
  const label = (project: string) => page.getByRole("button", { name: new RegExp(`${project}, house`) });
  await expect(label("alpha")).toHaveAccessibleName("alpha, house, burning");
  await expect(label("beta")).toHaveAccessibleName("beta, house, handled");
  await expect(label("gamma")).toHaveAccessibleName("gamma, house, 2 PRs waiting");
  await expect(label("delta")).toHaveAccessibleName("delta, house, 1 PR waiting");
  await expect(label("epsilon")).toHaveAccessibleName("epsilon, house");
});

test("the_towns_hidden_list_gives_each_pr_its_check_words", async ({ page }) => {
  // Catches a PR label with no word on whether its checks failed, passed or never ran.
  await open(page, "/", town([withPrs("alpha", [], [red(12), pr(13), pr(14, { checks: "running" }), pr(15, { checks: "none" })])]));
  const label = (n: number) => page.getByRole("button", { name: new RegExp(`^#${n} `) });
  await expect(label(12)).toHaveAccessibleName(/^#12 Broken build, alpha, pull request, open, checks failed 1\dm ago$/);
  await expect(label(13)).toHaveAccessibleName("#13 PR 13, alpha, pull request, open, checks passed");
  await expect(label(14)).toHaveAccessibleName("#14 PR 14, alpha, pull request, open, checks running");
  await expect(label(15)).toHaveAccessibleName("#15 PR 15, alpha, pull request, open, no checks");
});
