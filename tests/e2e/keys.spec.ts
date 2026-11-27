import { expect, test, type Page } from "@playwright/test";
import { house, keydown, lead, noDialog, panel, stubStream, town, waiting } from "./stream.ts";

const NOW = Date.now();

/** Three asks in urgency order: lead-1 (permission), lead-2 (waiting), lead-3 (stuck). */
const three = () =>
  town([
    house("zeta", [waiting("s1", "lead-1", NOW - 300_000, { needs: "permission" })]),
    house("alpha", [waiting("s2", "lead-2", NOW - 200_000), waiting("s3", "lead-3", NOW - 100_000, { needs: "stuck", reason: "error" })]),
  ]);

/** A background lead asking for a plan, with its reply box in its panel. */
const reply = () =>
  town(
    [house("alpha", [waiting("b1", "bg-1", NOW - 1000, { kind: "background", shortId: "b1b1b1b1", needs: "plan", tty: null, termProgram: null })])],
    [{
      id: "p1", lead: "b1", agent: null, kind: "plan", tool: "ExitPlanMode", input: { plan: "1. Do it" }, cwd: "/work/alpha", at: NOW - 1000,
      severity: { level: "medium", reason: "Funtown's rule: every plan is medium", source: "kind" },
    }],
  );

async function open(page: Page, initial: unknown, path = "/work.html") {
  await stubStream(page, initial);
  await page.route("**/letters?*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto(path);
  if (path === "/work.html") await expect(page.locator("section[aria-label]").first()).toBeVisible();
  else await expect(page.locator("ul.town-list button").first()).toBeAttached(); // the first state is in before a test presses a key
}

test("space_opens_the_next_ask_in_urgency_order_and_wraps_and_shift_space_goes_back", async ({ page }) => {
  await open(page, three());
  await page.keyboard.press("Space");
  await expect(panel(page, "lead-1")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(panel(page, "lead-2")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(panel(page, "lead-3")).toBeVisible();
  // Catches a walk that stops at the end of the list.
  await page.keyboard.press("Space");
  await expect(panel(page, "lead-1")).toBeVisible();
  await page.keyboard.press("Shift+Space");
  await expect(panel(page, "lead-3")).toBeVisible();
  await page.keyboard.press("Shift+Space");
  await expect(panel(page, "lead-2")).toBeVisible();
});

test("shift_space_with_nothing_open_opens_the_last_ask", async ({ page }) => {
  await open(page, three());
  await page.keyboard.press("Shift+Space");
  await expect(panel(page, "lead-3")).toBeVisible();
});

test("space_with_nothing_waiting_does_nothing_and_never_scrolls_the_page", async ({ page }) => {
  await open(page, town(Array.from({ length: 300 }, (_, i) => house(`project-${i}`, [lead({ id: `w${i}`, name: `worker-${i}` })]))));
  expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight), "the page must be tall enough to scroll").toBe(true);
  await page.keyboard.press("Space");
  await noDialog(page);
  await page.waitForTimeout(300); // the browser scrolls a moment after the key
  // Catches the browser's own Space scrolling the page down.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("option_n_is_retired_and_the_plain_list_hint_says_space", async ({ page }) => {
  await open(page, three());
  await expect(page.getByRole("region", { name: "Needs you" })).toContainText("Space: next");
  await expect(page.getByRole("region", { name: "Needs you" })).not.toContainText("⌥N");
  await page.keyboard.press("Alt+KeyN");
  await noDialog(page);
});

test("keys_with_cmd_ctrl_or_option_held_are_the_browsers_and_do_nothing", async ({ page }) => {
  await open(page, three());
  for (const combo of ["Meta+Space", "Control+Space", "Alt+Space"]) {
    await page.keyboard.press(combo);
    await noDialog(page);
  }
});

test("a_held_space_walks_one_step_not_the_whole_list", async ({ page }) => {
  await open(page, three());
  await page.keyboard.down("Space");
  await page.keyboard.down("Space"); // a second down with no up is a repeat
  await page.keyboard.down("Space");
  await page.keyboard.up("Space");
  await expect(panel(page, "lead-1")).toBeVisible();
});

test("space_during_an_ime_composition_or_a_dead_key_does_nothing", async ({ page }) => {
  await open(page, three());
  await keydown(page, { key: " ", code: "Space", isComposing: true });
  await keydown(page, { key: "Dead", code: "Space" });
  await noDialog(page);
});

test("space_is_text_in_a_text_box_and_walks_nothing", async ({ page }) => {
  await open(page, reply());
  await page.getByRole("region", { name: "Needs you" }).getByRole("button").click();
  const box = page.getByRole("textbox", { name: "Reply" });
  await box.click();
  await page.keyboard.type("a b");
  await expect(box).toHaveValue("a b");
  await expect(panel(page, "bg-1")).toBeVisible();
});

test("esc_in_a_text_box_leaves_the_box_and_keeps_the_typed_reply_then_the_next_esc_closes_the_pane", async ({ page }) => {
  await open(page, reply());
  await page.getByRole("region", { name: "Needs you" }).getByRole("button").click();
  const box = page.getByRole("textbox", { name: "Reply" });
  await box.click();
  await page.keyboard.type("my answer");
  await page.keyboard.press("Escape");
  await expect(panel(page, "bg-1")).toBeVisible();
  await expect(box).not.toBeFocused();
  await expect(box).toHaveValue("my answer");
  await page.keyboard.press("Escape");
  await noDialog(page);
});

test("esc_closes_one_layer_per_press_a_pane_then_the_classroom", async ({ page }) => {
  await open(page, three(), `/#in=${encodeURIComponent("/work/zeta")}`);
  await page.keyboard.press("Space");
  await expect(panel(page, "lead-1")).toBeVisible();
  await page.keyboard.press("Escape");
  await noDialog(page);
  await expect(page).toHaveURL(/#in=/);
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/#in=/);
});

test("a_click_leaves_no_button_focused_so_space_walks_instead_of_pressing_it", async ({ page }) => {
  await open(page, three());
  const mute = page.getByRole("button", { name: "Mute" });
  await mute.click();
  await expect(mute).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("BODY");
  await page.keyboard.press("Space");
  await expect(mute).toHaveAttribute("aria-pressed", "true");
  await expect(panel(page, "lead-1")).toBeVisible();
});

test("a_tab_focused_button_takes_enter_but_space_stays_funtowns", async ({ page }) => {
  await open(page, three());
  const mute = page.getByRole("button", { name: "Mute" });
  await mute.focus();
  await page.keyboard.press("Space");
  await expect(mute).toHaveAttribute("aria-pressed", "false");
  await expect(panel(page, "lead-1")).toBeVisible();
  await mute.focus();
  await page.keyboard.press("Enter");
  await expect(mute).toHaveAttribute("aria-pressed", "true");
});

test("in_the_town_space_opens_the_pane_and_marks_its_house_with_its_name_plate", async ({ page }) => {
  await open(page, three(), "/");
  await expect(page.locator(".plate")).toHaveCount(0);
  await page.keyboard.press("Space");
  await expect(panel(page, "lead-1")).toBeVisible();
  await expect(page.locator(".plate")).toHaveText("zeta");
  await page.keyboard.press("Space");
  await expect(panel(page, "lead-2")).toBeVisible();
  await expect(page.locator(".plate")).toHaveText("alpha");
});
