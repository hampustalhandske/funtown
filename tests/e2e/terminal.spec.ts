import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_FAKE_DIR, E2E_URL, FakeClaude, listed, listedBg } from "../fake-claude.ts";
import { addProjectFolder, fontOf, removeProjectFolder, scrollsBack, showTerminal } from "./stream.ts";

const fake = FakeClaude.at(E2E_FAKE_DIR);
const sid = "abcd1234-0000-4000-8000-000000000000";
let cwd = "";
let project = "";

test.beforeEach(async () => {
  cwd = realpathSync(mkdtempSync(join(tmpdir(), "funtown-e2e-proj-")));
  project = basename(cwd);
  fake.reset();
  await addProjectFolder(cwd);
});

test.afterEach(async () => {
  await removeProjectFolder(cwd);
});

const session = () => listed("t1", cwd, { name: "alpha" });
const bg = () => listedBg(sid, cwd, { name: "beta" });
const row = (page: Page, name: string) => page.locator(`section[aria-label="${project}"] .character`).filter({ hasText: name }).first();
const screen = (page: Page) => page.getByRole("dialog").locator(".xterm-rows");
/** Everything the fake echoed as `got:"..."`, joined, so one frame per key or per string reads the same. */
const echoed = async (page: Page) =>
  [...(await screen(page).innerText()).matchAll(/got:"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join("");

test("rows_show_each_sessions_name_and_kind", async ({ page }) => {
  fake.list([session(), bg()]);
  await page.goto("/work.html");
  await expect(row(page, "alpha")).toContainText(/terminal/i);
  await expect(row(page, "beta")).toContainText(/background/i);
});

test("a_background_session_opens_a_live_terminal_that_echoes_typed_text_and_sends_shift_enter_as_esc_cr", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => /content security policy/i.test(m.text()) && violations.push(m.text()));
  fake.list([bg()]);
  await page.goto("/work.html");
  await row(page, "beta").click({ position: { x: 5, y: 5 } });
  await showTerminal(page.getByRole("dialog"));
  await expect(screen(page)).toContainText("attached abcd1234");
  await page.locator(".xterm").click();
  await page.keyboard.type("hello");
  await expect.poll(() => echoed(page)).toBe("hello");
  await page.keyboard.press("Shift+Enter");
  await expect.poll(() => echoed(page)).toBe("hello\\u001b\\r");
  await page.keyboard.press("Enter");
  await expect.poll(() => echoed(page)).toBe("hello\\u001b\\r\\r");
  expect(violations).toEqual([]);
});

test("a_terminal_session_shows_the_hint_and_go_to_terminal_and_no_live_terminal", async ({ page }) => {
  fake.list([session()]);
  await page.goto("/work.html");
  await row(page, "alpha").click({ position: { x: 5, y: 5 } });
  const panel = page.getByRole("dialog", { name: "alpha details" });
  await expect(panel).toContainText("press ← or type /bg in its terminal to open it here");
  await expect(panel.getByRole("button", { name: "Go to terminal" })).toBeVisible();
  await expect(panel.locator(".xterm")).toHaveCount(0);
});

test("new_session_starts_a_background_session_in_the_project_and_opens_its_panel_whose_terminal_shows_on_request", async ({ page }) => {
  fake.list([session()]);
  await page.goto("/work.html");
  await page.locator(`section[aria-label="${project}"]`).getByRole("button", { name: /new session/i }).click();
  // --bg plus the next poll can take longer than the default 5 s
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
  await showTerminal(page.getByRole("dialog"));
  await expect(screen(page)).toContainText("attached");
  expect(fake.started().map((s) => s.cwd)).toEqual([cwd]);
});

test("the_page_sends_the_servers_token_with_jump", async ({ page }) => {
  fake.list([session()]);
  let sent: string | undefined;
  await page.route("**/jump", (r) => {
    sent = r.request().headers()["x-funtown-token"];
    return r.fulfill({ status: 204 });
  });
  await page.goto("/work.html");
  const token = await page.locator('meta[name="funtown-token"]').getAttribute("content");
  expect(token).toMatch(/^[0-9a-f]+$/);
  await row(page, "alpha").click({ position: { x: 5, y: 5 } });
  await page.getByRole("button", { name: "Go to terminal" }).click();
  await expect.poll(() => sent).toBe(token);
});

test("a_failed_version_check_shows_every_problem_line_in_a_banner", async ({ page }) => {
  const problems = ["Background sessions won't work", "Terminal room won't work"];
  const state = { claude: { version: "2.1.300", problems }, houses: [], cards: [] };
  await page.route("**/stream", (r) =>
    r.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: `event: state\ndata: ${JSON.stringify(state)}\n\n` }),
  );
  await page.goto("/work.html");
  for (const p of problems) await expect(page.getByText(p)).toBeVisible();
});

test("a_subagent_of_a_background_lead_has_no_go_to_terminal_button", async ({ page }) => {
  fake.list([bg()]);
  const hook = (extra: object) =>
    fetch(`${E2E_URL}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hook_event_name: "SubagentStart", session_id: sid, cwd, funtown: { tty: null, term_program: null, at: 1 }, ...extra }),
    });
  await page.goto("/work.html");
  await expect(row(page, "beta")).toBeVisible();
  expect((await hook({ agent_id: "x1", agent_type: "Explore" })).status).toBe(204);
  await page.locator('ul[aria-label="beta subagents"] .character').filter({ hasText: "Explore-1" }).click();
  const panel = page.getByRole("dialog", { name: "Explore-1 details" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "Go to terminal" })).toHaveCount(0);
});

test("the_page_sends_the_terminals_size_as_soon_as_the_socket_opens", async ({ page }) => {
  const sent: string[] = [];
  let query: URLSearchParams | undefined;
  await page.routeWebSocket(/\/term/, (ws) => {
    query = new URL(ws.url()).searchParams;
    const server = ws.connectToServer();
    ws.onMessage((m) => {
      sent.push(String(m));
      server.send(m);
    });
    server.onMessage((m) => ws.send(m));
  });
  fake.list([bg()]);
  await page.goto("/work.html");
  await row(page, "beta").click({ position: { x: 5, y: 5 } });
  await showTerminal(page.getByRole("dialog"));
  await expect(screen(page)).toContainText("attached abcd1234");
  // nothing typed or resized by the test: the first frame is the size the terminal has when the socket opens
  await expect.poll(() => sent.length).toBeGreaterThan(0);
  expect(JSON.parse(sent[0])).toEqual({ t: "resize", c: Number(query!.get("cols")), r: Number(query!.get("rows")) });
});

/** The names of the scripts the page asks for from now on. */
const watchScripts = (page: Page) => {
  const names: string[] = [];
  page.on("request", (r) => /\.js($|\?)/.test(r.url()) && names.push(new URL(r.url()).pathname.split("/").pop()!));
  return names;
};

test("show_terminal_requests_no_script_so_no_click_waits_on_a_download", async ({ page }) => {
  // Catches the terminal or the reply box going back to a lazy import: the click would wait on a download.
  const scripts = watchScripts(page);
  fake.list([bg()]);
  await page.goto("/work.html");
  await row(page, "beta").click({ position: { x: 5, y: 5 } });
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("button", { name: /show terminal/i })).toBeVisible();
  // the panel's own lazy part (the letters) has finished loading, so only the click can add a script
  await expect.poll(() => scripts.some((s) => /^Letters/.test(s))).toBe(true);
  scripts.length = 0;
  await showTerminal(panel);
  await expect(screen(page)).toContainText("attached abcd1234");
  await expect(panel.getByRole("textbox", { name: "Reply" })).toBeVisible();
  expect(scripts).toEqual([]);
});

test("the_letters_markdown_renderer_is_not_in_the_first_page_load", async ({ page }) => {
  // Catches the reply box's move leaving the Markdown libraries in the main bundle.
  const scripts = watchScripts(page);
  fake.list([bg()]);
  await page.goto("/work.html");
  await expect(row(page, "beta")).toBeVisible();
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.filter((s) => /^Letters/.test(s))).toEqual([]);
  await row(page, "beta").click({ position: { x: 5, y: 5 } });
  await expect.poll(() => scripts.some((s) => /^Letters/.test(s))).toBe(true);
});

/** Sends `lines` numbered lines to the page's terminal as if the session printed them, then `END`. */
async function floodTerminal(page: Page, lines: number) {
  await page.routeWebSocket(/\/term/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => ws.send(m));
    const d = Array.from({ length: lines }, (_, i) => `line-${i}\r\n`).join("") + "END\r\n";
    ws.send(JSON.stringify({ t: "out", d }));
  });
}

test("a_session_terminal_is_set_in_menlo_13_and_has_no_scrollback", async ({ page }) => {
  await floodTerminal(page, 300);
  fake.list([bg()]);
  await page.goto("/work.html");
  await row(page, "beta").click({ position: { x: 5, y: 5 } });
  await showTerminal(page.getByRole("dialog"));
  await expect(screen(page)).toContainText("attached abcd1234");
  const terminal = page.getByRole("dialog").locator(".xterm");
  const { family, size } = await fontOf(terminal);
  expect(family).toMatch(/^"?Menlo"?(,|$)/);
  expect(size).toBe("13px");
  expect(await scrollsBack(page, terminal)).toBe(false);
});
