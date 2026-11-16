import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_FAKE_DIR, FakeClaude, listed, listedBg } from "../fake-claude.ts";
import { hook as postHook } from "./stream.ts";

const fake = FakeClaude.at(E2E_FAKE_DIR);
let cwd = "";
let project = "";
// A fresh session id per test, so letters a shared server still holds from another test never show.
let sid = "";

test.beforeEach(() => {
  cwd = realpathSync(mkdtempSync(join(tmpdir(), "funtown-e2e-proj-")));
  project = basename(cwd);
  sid = randomUUID();
  fake.reset();
});

const hook = (name: string, extra: Record<string, unknown> = {}) => postHook(sid, cwd, name, extra);
const letter = (text: string) => hook("Stop", { last_assistant_message: text });
const sub = { agent_id: "x1", agent_type: "Explore" };

const row = (page: Page, name: string) => page.locator(`section[aria-label="${project}"] .character`).filter({ hasText: name }).first();
const subRow = (page: Page) => page.locator('ul[aria-label="alpha subagents"] .character').filter({ hasText: "Explore-1" });
const panel = (page: Page, name: string) => page.getByRole("dialog", { name: `${name} details` });
const letters = (page: Page, name: string) => panel(page, name).getByRole("region", { name: "Letters" });

/** Lists `alpha` (a terminal lead, or a background one with `bg`), opens the page and waits for its row. */
async function openWith(page: Page, bg = false) {
  fake.list([bg ? listedBg(sid, cwd, { name: "alpha" }) : listed(sid, cwd, { name: "alpha" })]);
  await page.goto("/");
  await expect(row(page, "alpha")).toBeVisible();
}
async function openPanel(page: Page, name = "alpha") {
  await row(page, name).click({ position: { x: 5, y: 5 } });
  await expect(panel(page, name)).toBeVisible();
}

/** Passes the page's `/term` socket through to the server, returning every frame the page sends. */
async function recordTermFrames(page: Page): Promise<unknown[]> {
  const frames: unknown[] = [];
  await page.routeWebSocket(/\/term/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => {
      frames.push(JSON.parse(String(m)));
      server.send(m);
    });
    server.onMessage((m) => ws.send(m));
  });
  return frames;
}
/** The input chunks the fake `attach` echoed into the panel's terminal (as `got:<JSON string>`), joined. */
const echoed = (page: Page) => async () =>
  [...(await panel(page, "alpha").locator(".xterm-rows").innerText()).matchAll(/got:"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join("");

test("a_letter_renders_markdown_headings_gfm_tables_task_lists_highlighted_code_and_safe_links", async ({ page }) => {
  await openWith(page);
  await letter(
    [
      "# Release notes",
      "",
      "| file | lines |",
      "| --- | --- |",
      "| town.ts | 42 |",
      "",
      "- [x] tests pass",
      "- [ ] docs",
      "",
      "Run `npm test` first.",
      "",
      "```ts",
      "const answer: number = 42;",
      "```",
      "",
      "[the docs](https://example.com/docs)",
    ].join("\n"),
  );
  await openPanel(page);
  const box = letters(page, "alpha");
  await expect(box).toContainText("alpha");
  await expect(box.getByRole("heading", { name: "Release notes" })).toBeVisible();
  await expect(box.getByRole("table").getByRole("cell", { name: "town.ts" })).toBeVisible();
  await expect(box.getByRole("checkbox")).toHaveCount(2);
  await expect(box.getByRole("checkbox").first()).toBeChecked();
  await expect(box.locator("code", { hasText: "npm test" })).toBeVisible();
  // the letter is 16 lines, so its code block and link show only after "Show all"
  await box.getByRole("button", { name: "Show all" }).click();
  // rehype-highlight marks a highlighted block with `hljs` and wraps `const` in a keyword span
  await expect(box.locator("pre code.hljs .hljs-keyword", { hasText: "const" })).toBeVisible();
  const link = box.getByRole("link", { name: "the docs" });
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /\bnoreferrer\b/);
});

test("raw_html_in_a_letter_shows_as_text_and_an_image_shows_as_a_link_and_is_never_fetched", async ({ page }) => {
  const fetched: string[] = [];
  page.on("request", (r) => /pic\.png/.test(r.url()) && fetched.push(r.url()));
  const violations: string[] = [];
  page.on("console", (m) => /content security policy/i.test(m.text()) && violations.push(m.text()));
  await openWith(page);
  await letter(
    [
      "Before.",
      "",
      '<img src="/raw-pic.png" onerror="document.title=\'pwned-img\'">',
      "",
      "<script>document.title = 'pwned-script'</script>",
      "",
      "![a chart](/letter-pic.png)",
    ].join("\n"),
  );
  await openPanel(page);
  const box = letters(page, "alpha");
  await expect(box).toContainText("Before.");
  await expect(box).toContainText("<script>document.title = 'pwned-script'</script>");
  await expect(box).toContainText("onerror");
  await expect(box.locator("img, script")).toHaveCount(0);
  await expect(box.locator('a[href$="/letter-pic.png"]')).toHaveCount(1);
  await page.waitForTimeout(300); // give a wrongly rendered image or script time to load
  expect(fetched).toEqual([]);
  expect(await page.title()).not.toMatch(/pwned/);
  expect(violations).toEqual([]);
});

test("a_lead_panel_shows_its_subagents_letters_newest_first_and_a_subagent_panel_only_its_own", async ({ page }) => {
  await openWith(page);
  await hook("SubagentStart", sub);
  await expect(subRow(page)).toBeVisible();
  await openPanel(page);
  // the panel is open before the letters arrive, so it must pick them up as they come
  await hook("SubagentStop", { ...sub, last_assistant_message: "Subagent found three call sites." });
  await letter("Lead wrapped up the turn.");
  const box = letters(page, "alpha");
  await expect(box).toContainText("Lead wrapped up the turn.");
  await expect(box).toContainText("Subagent found three call sites.");
  await expect(box).toContainText("Explore-1");
  const text = await box.innerText();
  expect(text.indexOf("Lead wrapped up the turn.")).toBeLessThan(text.indexOf("Subagent found three call sites."));

  await page.keyboard.press("Escape");
  await subRow(page).click();
  const own = letters(page, "Explore-1");
  await expect(own).toContainText("Subagent found three call sites.");
  await expect(own).not.toContainText("Lead wrapped up the turn.");
});

test("a_letter_puts_a_mail_mark_on_its_writers_row_and_opens_no_panel", async ({ page }) => {
  await openWith(page);
  await hook("SubagentStart", sub);
  await expect(subRow(page)).toBeVisible();
  await expect(row(page, "alpha")).not.toContainText("✉");
  await hook("SubagentStop", { ...sub, last_assistant_message: "done" });
  await expect(subRow(page)).toContainText("✉");
  await letter("all done");
  await expect(row(page, "alpha")).toContainText("✉");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

for (const how of ["the Send button", "Meta+Enter"] as const) {
  test(`a_reply_sent_with_${how.replace(/\W+/g, "_")}_reaches_attach_as_one_bracketed_paste_then_enter_and_clears_the_box`, async ({ page }) => {
    const frames = await recordTermFrames(page);
    await openWith(page, true);
    await letter("Which branch should I use?");
    await openPanel(page);
    const p = panel(page, "alpha");
    await expect(p.locator(".xterm-rows")).toContainText(`attached ${sid.slice(0, 8)}`);
    const reply = p.getByRole("textbox", { name: "Reply" });
    await reply.fill("use main\nand rebase first");
    if (how === "Meta+Enter") await reply.press("Meta+Enter");
    else await p.getByRole("button", { name: "Send" }).click();

    const paste = { t: "in", d: "\x1b[200~use main\nand rebase first\x1b[201~" };
    await expect.poll(() => frames.filter((f) => (f as { t: string }).t === "in")).toEqual([paste, { t: "in", d: "\r" }]);
    await expect.poll(echoed(page)).toBe(JSON.stringify(paste.d + "\r").slice(1, -1));
    await expect(reply).toHaveValue("");
  });
}

test("a_terminal_lead_panel_shows_its_letters_and_the_hint_but_no_reply_box", async ({ page }) => {
  await openWith(page);
  await letter("Finished the refactor.");
  await openPanel(page);
  const p = panel(page, "alpha");
  await expect(letters(page, "alpha")).toContainText("Finished the refactor.");
  await expect(p).toContainText("press ← or type /bg in its terminal to open it here");
  await expect(p.getByRole("textbox", { name: "Reply" })).toHaveCount(0);
});

test("a_letter_arriving_leaves_focus_and_a_draft_reply_where_they_were", async ({ page }) => {
  await openWith(page, true);
  await letter("First letter.");
  await openPanel(page);
  const reply = panel(page, "alpha").getByRole("textbox", { name: "Reply" });
  await reply.click();
  await page.keyboard.type("half a thought");
  await letter("Second letter.");
  await expect(letters(page, "alpha")).toContainText("Second letter.");
  await expect(reply).toBeFocused();
  await expect(reply).toHaveValue("half a thought");
});

test("a_reply_containing_the_paste_end_sequence_reaches_attach_as_one_bracketed_paste_with_it_removed", async ({ page }) => {
  const frames = await recordTermFrames(page);
  await openWith(page, true);
  await openPanel(page);
  const p = panel(page, "alpha");
  await expect(p.locator(".xterm-rows")).toContainText(`attached ${sid.slice(0, 8)}`);
  await p.getByRole("textbox", { name: "Reply" }).fill("yes\x1b[201~ls\nthen stop");
  await p.getByRole("button", { name: "Send" }).click();

  const paste = { t: "in", d: "\x1b[200~yesls\nthen stop\x1b[201~" };
  await expect.poll(() => frames.filter((f) => (f as { t: string }).t === "in")).toEqual([paste, { t: "in", d: "\r" }]);
  await expect.poll(echoed(page)).toBe(JSON.stringify(paste.d + "\r").slice(1, -1));
});

/** Makes every `/term` socket the page opens stay connecting forever, as a stand-in WebSocket that never opens. */
const neverConnects = (page: Page) =>
  page.addInitScript(() => {
    window.WebSocket = new Proxy(window.WebSocket, {
      construct(Real, args: [string | URL, (string | string[])?]) {
        if (!String(args[0]).includes("/term")) return Reflect.construct(Real, args);
        return Object.assign(new EventTarget(), {
          url: String(args[0]),
          readyState: 0,
          send() {
            throw new DOMException("Still in CONNECTING state.", "InvalidStateError");
          },
          close() {},
        });
      },
    });
  });
/** Answers every `/term` socket the page opens by closing it at once. */
const closesAtOnce = (page: Page) => page.routeWebSocket(/\/term/, (ws) => ws.close());

for (const [how, socket] of [["not_yet_connected", neverConnects], ["closed", closesAtOnce]] as const) {
  test(`send_while_the_terminal_socket_is_${how}_keeps_the_text_and_shows_an_alert`, async ({ page }) => {
    await socket(page);
    await openWith(page, true);
    await openPanel(page);
    const p = panel(page, "alpha");
    await expect(p.getByRole("alert")).toHaveCount(0);
    const reply = p.getByRole("textbox", { name: "Reply" });
    await reply.fill("use main");
    await page.waitForTimeout(200); // let a closing socket finish closing before Send
    await p.getByRole("button", { name: "Send" }).click();
    await expect(p.getByRole("alert")).toBeVisible();
    await expect(reply).toHaveValue("use main");
  });
}

test("a_letters_request_failing_with_500_shows_an_error_line_not_an_empty_panel", async ({ page }) => {
  await page.route("**/letters?**", (r) => r.fulfill({ status: 500, body: "boom" }));
  await openWith(page);
  await letter("You will not see this.");
  await openPanel(page);
  await expect(panel(page, "alpha").getByRole("alert")).toBeVisible();
});

test("a_letter_over_12_lines_shows_its_first_12_until_show_all_and_a_short_one_has_no_button", async ({ page }) => {
  await openWith(page);
  const lines = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `${tag} line ${i + 1}`).join("\n");
  await letter(lines(5, "short"));
  await letter(lines(30, "long"));
  await openPanel(page);
  const box = letters(page, "alpha");
  await expect(box).toContainText("short line 5");
  await expect(box).toContainText("long line 12");
  await expect(box).not.toContainText("long line 13");
  // one button: the long letter's, none for the short one
  await expect(box.getByRole("button", { name: "Show all" })).toHaveCount(1);
  await box.getByRole("button", { name: "Show all" }).click();
  await expect(box).toContainText("long line 30");
  await expect(box.getByRole("button", { name: "Show less" })).toHaveCount(1);
  await expect(box.getByRole("button", { name: "Show all" })).toHaveCount(0);
});

test("a_reply_whose_removal_of_one_marker_forms_another_reaches_attach_with_exactly_one_paste_start_and_end", async ({ page }) => {
  const frames = await recordTermFrames(page);
  await openWith(page, true);
  await openPanel(page);
  const p = panel(page, "alpha");
  await expect(p.locator(".xterm-rows")).toContainText(`attached ${sid.slice(0, 8)}`);
  // removing the end marker from this text leaves the start marker "\x1b[200~"
  await p.getByRole("textbox", { name: "Reply" }).fill("\x1b[20\x1b[201~0~");
  await p.getByRole("button", { name: "Send" }).click();

  const START = "\x1b[200~";
  const END = "\x1b[201~";
  await expect.poll(() => frames.filter((f) => (f as { t: string }).t === "in").length).toBe(2);
  const [paste] = frames.filter((f) => (f as { t: string }).t === "in") as { d: string }[];
  expect(paste.d.split(START)).toHaveLength(2);
  expect(paste.d.split(END)).toHaveLength(2);
  expect(paste.d.startsWith(START)).toBe(true);
  expect(paste.d.endsWith(END)).toBe(true);
});

test("a_reply_over_1_MB_is_not_sent_keeps_its_text_and_shows_an_alert", async ({ page }) => {
  const frames = await recordTermFrames(page);
  await openWith(page, true);
  await openPanel(page);
  const p = panel(page, "alpha");
  await expect(p.locator(".xterm-rows")).toContainText(`attached ${sid.slice(0, 8)}`);
  const reply = p.getByRole("textbox", { name: "Reply" });
  const big = "a".repeat(1024 * 1024 + 1);
  await reply.fill(big);
  await p.getByRole("button", { name: "Send" }).click();
  await expect(p.getByRole("alert")).toHaveText("Not sent: the reply is over 1 MB.");
  expect(await reply.inputValue()).toBe(big);
  await page.waitForTimeout(300); // give a wrongly sent frame time to arrive
  expect(frames.filter((f) => (f as { t: string }).t === "in")).toEqual([]);
});

test("a_letters_chunk_that_fails_to_load_shows_a_reload_line_and_keeps_the_session_list", async ({ page }) => {
  await page.route("**/assets/Letters-*.js", (r) => r.abort());
  await openWith(page);
  await letter("You will not see this.");
  await openPanel(page);
  await expect(panel(page, "alpha")).toContainText("This part of the page is out of date. Reload the page.");
  await expect(row(page, "alpha")).toBeVisible();
});
