import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_FAKE_DIR, FakeClaude, listed, listedBg } from "../fake-claude.ts";

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

let clock = Date.now();
/** Posts one hook event for `sid` to the e2e server, with a `funtown.at` later than the last one. */
async function hook(name: string, extra: Record<string, unknown> = {}) {
  const at = (clock = Math.max(clock + 1, Date.now()));
  const res = await fetch("http://127.0.0.1:4799/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hook_event_name: name, session_id: sid, cwd, funtown: { tty: null, term_program: null, at }, ...extra }),
  });
  expect(res.status).toBe(204);
}
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
    const frames: unknown[] = [];
    await page.routeWebSocket(/\/term/, (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((m) => {
        frames.push(JSON.parse(String(m)));
        server.send(m);
      });
      server.onMessage((m) => ws.send(m));
    });
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
    // the fake `attach` echoes each input chunk as got:<JSON string>
    const echoed = async () =>
      [...(await p.locator(".xterm-rows").innerText()).matchAll(/got:"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join("");
    await expect.poll(echoed).toBe(JSON.stringify(paste.d + "\r").slice(1, -1));
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
