import { expect, test, type Page } from "@playwright/test";
import { E2E_URL } from "../fake-claude.ts";
import { house, keydown, lead, noDialog, panel, stubStream, town } from "./stream.ts";

const NOW = Date.now();
const background = (id: string, name: string, over: Record<string, unknown> = {}) =>
  lead({ id, name, kind: "background", shortId: id.repeat(8).slice(0, 8), tty: null, termProgram: null, ...over });

/** Three leads with letters of different ages: lead-b is the newest, then lead-c, then lead-a; lead-d has none. */
const lettered = () =>
  town([
    house("alpha", [lead({ id: "a", name: "lead-a", letter: NOW - 3000 }), lead({ id: "d", name: "lead-d" })]),
    house("beta", [lead({ id: "b", name: "lead-b", letter: NOW - 1000 }), lead({ id: "c", name: "lead-c", letter: NOW - 2000 })]),
  ]);

/** One background lead, working, with its reply box in its panel. */
const bg = () => town([house("alpha", [background("b", "bg-1")])]);

/** A held-open `/term` socket, so a shown terminal stays up without a session behind it. */
const holdTerminal = (page: Page) => page.routeWebSocket(/\/term/, () => {});

async function open(page: Page, initial: unknown, path = "/work.html") {
  await stubStream(page, initial);
  await page.route("**/letters?*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto(path);
  if (path.startsWith("/work.html")) await expect(page.locator("header")).toBeVisible();
  else await expect(page.locator("ul.town-list")).toBeAttached();
  // the first state is in before a test presses a key
  await expect(page.locator("ul.town-list button, section.house").first()).toBeAttached();
}
const sheet = (page: Page) => page.getByRole("dialog", { name: "Key sheet" });
const focusedName = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName);

test("r_puts_the_cursor_in_the_reply_box_when_the_terminal_is_hidden_and_the_sheet_stays_closed", async ({ page }) => {
  await open(page, bg());
  await page.getByRole("button", { name: /^bg-1/ }).click();
  const p = panel(page, "bg-1");
  await expect(p).toBeVisible();
  expect(await focusedName(page)).toBe("BODY");
  await page.keyboard.press("r");
  await expect(p.getByRole("textbox", { name: "Reply" })).toBeFocused();
  // Catches an R that is also typed into the box it just focused.
  await page.keyboard.type("rr");
  await expect(p.getByRole("textbox", { name: "Reply" })).toHaveValue("rr");
  await expect(p).not.toHaveClass(/sheet/);
});

test("r_puts_the_cursor_in_the_terminal_when_it_is_shown", async ({ page }) => {
  await holdTerminal(page);
  await open(page, bg());
  await page.getByRole("button", { name: /^bg-1/ }).click();
  const p = panel(page, "bg-1");
  await p.getByRole("button", { name: "Show terminal" }).click();
  await expect(p.locator(".xterm-helper-textarea")).toBeFocused();
  await page.keyboard.press("Meta+Escape"); // leave the terminal: the keyboard goes back to the pane
  await expect(p.locator(".xterm-helper-textarea")).not.toBeFocused();
  await page.keyboard.press("r");
  await expect(p.locator(".xterm-helper-textarea")).toBeFocused();
  await expect(p).toHaveClass(/sheet/);
  // Hidden again, R goes back to the reply box.
  await p.getByRole("button", { name: "Hide terminal" }).click();
  await page.keyboard.press("r");
  await expect(p.getByRole("textbox", { name: "Reply" })).toBeFocused();
});

test("r_does_nothing_for_a_lead_in_the_users_own_terminal_app", async ({ page }) => {
  await open(page, town([house("alpha", [lead({ id: "t", name: "term-1" })])]));
  await page.getByRole("button", { name: /^term-1/ }).click();
  await expect(panel(page, "term-1")).toBeVisible();
  await page.keyboard.press("r");
  expect(await focusedName(page)).toBe("BODY");
  await expect(panel(page, "term-1").getByRole("textbox")).toHaveCount(0);
});

test("m_opens_the_newest_letters_pane_then_the_next_newest_and_wraps", async ({ page }) => {
  await open(page, lettered());
  await page.keyboard.press("m");
  await expect(panel(page, "lead-b")).toBeVisible();
  await page.keyboard.press("m");
  await expect(panel(page, "lead-c")).toBeVisible();
  await page.keyboard.press("m");
  await expect(panel(page, "lead-a")).toBeVisible();
  // Catches a walk that stops at the oldest, or one that visits a lead with no letter.
  await page.keyboard.press("m");
  await expect(panel(page, "lead-b")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
});

test("m_starts_at_the_newest_when_the_open_pane_has_no_letter_and_does_nothing_without_letters", async ({ page }) => {
  await open(page, lettered());
  await page.getByRole("button", { name: /^lead-d/ }).click();
  await expect(panel(page, "lead-d")).toBeVisible();
  await page.keyboard.press("m");
  await expect(panel(page, "lead-b")).toBeVisible();
  await page.keyboard.press("Escape");
  await open(page, bg());
  await page.keyboard.press("m");
  await noDialog(page);
});

test("m_works_in_the_town_and_marks_the_house_it_opens", async ({ page }) => {
  await open(page, lettered(), "/");
  await page.keyboard.press("m");
  await expect(panel(page, "lead-b")).toBeVisible();
  await expect(page.locator(".plate")).toHaveText("beta");
});

test("l_flips_from_the_town_to_the_plain_list_keeping_the_house_of_the_classroom", async ({ page }) => {
  await open(page, lettered(), `/#in=${encodeURIComponent("/work/beta")}`);
  await page.keyboard.press("l");
  await expect(page).toHaveURL(`${E2E_URL}/work.html#${encodeURIComponent("/work/beta")}`);
});

test("l_flips_from_the_town_keeping_the_marked_house_and_plain_without_one", async ({ page }) => {
  await open(page, lettered(), "/");
  await page.keyboard.press("m"); // opens lead-b's pane and marks its house
  await expect(page.locator(".plate")).toHaveText("beta");
  await page.keyboard.press("l");
  await expect(page).toHaveURL(`${E2E_URL}/work.html#${encodeURIComponent("/work/beta")}`);
  await open(page, lettered(), "/");
  await page.keyboard.press("l");
  await expect(page).toHaveURL(`${E2E_URL}/work.html`);
});

test("l_flips_from_the_plain_list_back_to_the_town", async ({ page }) => {
  await open(page, lettered(), `/work.html#${encodeURIComponent("/work/beta")}`);
  await page.keyboard.press("l");
  await expect(page).toHaveURL(`${E2E_URL}/`);
});

test("the_icon_titles_name_their_key", async ({ page }) => {
  await open(page, lettered(), "/");
  await expect(page.getByRole("link", { name: "Work view" })).toHaveAttribute("title", "Work view (L)");
  await expect(page.getByRole("button", { name: "Key sheet" })).toHaveAttribute("title", "Key sheet (?)");
  await open(page, lettered());
  await expect(page.getByRole("link", { name: "Town" })).toHaveAttribute("title", "Town (L)");
  await expect(page.getByRole("button", { name: "Key sheet" })).toHaveAttribute("title", "Key sheet (?)");
});

test("keys_are_matched_by_the_character_typed_so_another_layout_works", async ({ page }) => {
  await open(page, lettered());
  // On another layout the letter m sits where the US layout has Semicolon, and the US M key types another letter.
  await keydown(page, { key: "x", code: "KeyM" });
  await noDialog(page);
  await keydown(page, { key: "m", code: "Semicolon" });
  await expect(panel(page, "lead-b")).toBeVisible();
  await keydown(page, { key: "l", code: "KeyP" });
  await expect(page).toHaveURL(`${E2E_URL}/`);
});

test("the_letter_keys_are_not_funtowns_with_a_modifier_held_or_while_typing", async ({ page }) => {
  await open(page, bg());
  for (const combo of ["Meta+m", "Control+m", "Alt+m", "Shift+m", "Meta+l", "Control+l", "Alt+l", "Shift+l", "Meta+r", "Shift+r"]) {
    await page.keyboard.press(combo);
  }
  await noDialog(page);
  await expect(page).toHaveURL(`${E2E_URL}/work.html`);
  await page.getByRole("button", { name: /^bg-1/ }).click();
  await page.getByRole("textbox", { name: "Reply" }).click();
  await page.keyboard.type("mlr?");
  await expect(page.getByRole("textbox", { name: "Reply" })).toHaveValue("mlr?");
  await expect(page).toHaveURL(`${E2E_URL}/work.html`);
  await expect(sheet(page)).toHaveCount(0);
});

test("question_mark_opens_the_key_sheet_listing_every_key_and_where_it_works", async ({ page }) => {
  await open(page, lettered(), "/");
  await expect(sheet(page)).toHaveCount(0);
  await page.keyboard.press("?");
  await expect(sheet(page)).toBeVisible();
  // Catches a key left off the sheet: each row names its key and where it works.
  const row = (key: string, where: string) =>
    sheet(page).locator("tr").filter({ has: page.locator("td.key", { hasText: new RegExp(`^${key.replace(/[+?]/g, "\\$&")}$`) }) }).filter({ hasText: where }).first();
  for (const [key, where] of [
    ["Space", "any pane"], ["Shift+Space", "any pane"], ["Enter", "An open card"], ["Enter", "no pane open"], ["Esc", "terminal"],
    ["← → ↑ ↓", "no pane open"], ["1–4", "one question"], ["Q", "An open card"], ["D", "An open card"], ["R", "background lead"],
    ["Cmd+Enter", "reply box"], ["M", "typing places"], ["L", "typing places"], ["?", "typing places"], ["Cmd+Esc", "terminal"],
  ]) {
    await expect(row(key, where), `${key} (${where})`).toBeVisible();
  }
});

test("the_keyboard_icon_opens_the_key_sheet_on_the_town_and_the_work_view", async ({ page }) => {
  await open(page, lettered(), "/");
  await page.getByRole("button", { name: "Key sheet" }).click();
  await expect(sheet(page)).toBeVisible();
  await open(page, lettered());
  await page.getByRole("button", { name: "Key sheet" }).click();
  await expect(sheet(page)).toBeVisible();
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog")).toHaveCount(1);
});

test("esc_closes_the_key_sheet_first_and_the_pane_under_it_stays", async ({ page }) => {
  await open(page, lettered(), "/");
  await page.keyboard.press("m");
  await expect(panel(page, "lead-b")).toBeVisible();
  await page.keyboard.press("?");
  await expect(sheet(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  await expect(panel(page, "lead-b")).toBeVisible();
  await page.keyboard.press("Escape");
  await noDialog(page);
});

for (const path of ["/", "/work.html"]) {
  test(`at_390_px_the_key_sheet_on_${path === "/" ? "the_town" : "the_work_view"}_never_scrolls_sideways_or_breaks_a_word`, async ({ page }) => {
    // Catches a column cut at the sheet's edge, or one so narrow that "classroom" breaks into "clas sro om".
    await page.setViewportSize({ width: 390, height: 800 });
    await open(page, lettered(), path);
    await page.keyboard.press("?");
    await expect(sheet(page)).toBeVisible();
    const fits = await sheet(page).evaluate((s) => s.scrollWidth <= s.clientWidth);
    const broken = await sheet(page).locator("td").evaluateAll((cells) =>
      cells.flatMap((cell) => {
        const text = cell.firstChild;
        if (!(text instanceof Text)) return [];
        return [...text.data.matchAll(/\S+/g)].flatMap((m) => {
          const range = document.createRange();
          range.setStart(text, m.index);
          range.setEnd(text, m.index + m[0].length);
          return range.getClientRects().length > 1 ? [m[0]] : [];
        });
      }),
    );
    expect(fits).toBe(true);
    expect(broken).toEqual([]);
  });
}

test("the_key_sheet_opens_with_the_pointer_too_and_its_close_button_closes_it", async ({ page }) => {
  await open(page, lettered(), "/");
  await page.getByRole("button", { name: "Key sheet" }).click();
  await sheet(page).getByRole("button", { name: "Close key sheet" }).click();
  await expect(sheet(page)).toHaveCount(0);
});
