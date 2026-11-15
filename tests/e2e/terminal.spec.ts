import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_FAKE_DIR, FakeClaude, type Listed } from "../fake-claude.ts";

const fake = FakeClaude.at(E2E_FAKE_DIR);
const sid = "abcd1234-0000-4000-8000-000000000000";
let cwd = "";
let project = "";

test.beforeEach(() => {
  cwd = realpathSync(mkdtempSync(join(tmpdir(), "funtown-e2e-proj-")));
  project = basename(cwd);
  fake.list([]);
});

const session = (over: Partial<Listed>): Listed => ({
  sessionId: "t1", cwd, kind: "interactive", status: "idle", name: "alpha", pid: 1, startedAt: 1, ...over,
});
const bg = (): Listed => session({ sessionId: sid, id: "abcd1234", kind: "background", name: "beta" });
const row = (page: Page, name: string) => page.locator(`section[aria-label="${project}"] .character`).filter({ hasText: name }).first();
const screen = (page: Page) => page.getByRole("dialog").locator(".xterm-rows");

test("rows_show_each_sessions_name_and_kind", async ({ page }) => {
  fake.list([session({}), bg()]);
  await page.goto("/");
  await expect(row(page, "alpha")).toContainText(/terminal/i);
  await expect(row(page, "beta")).toContainText(/background/i);
});

test("a_background_session_opens_a_live_terminal_that_echoes_typed_text_and_sends_shift_enter_as_esc_cr", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => /content security policy/i.test(m.text()) && violations.push(m.text()));
  fake.list([bg()]);
  await page.goto("/");
  await row(page, "beta").click({ position: { x: 5, y: 5 } });
  await expect(screen(page)).toContainText("attached abcd1234");
  await page.locator(".xterm").click();
  await page.keyboard.type("hello");
  await expect(screen(page)).toContainText('got:"hello"');
  await page.keyboard.press("Shift+Enter");
  await expect(screen(page)).toContainText('got:"\\u001b\\r"');
  await page.keyboard.press("Enter");
  await expect(screen(page)).toContainText('got:"\\r"');
  expect(violations).toEqual([]);
});

test("a_terminal_session_shows_the_hint_and_go_to_terminal_and_no_live_terminal", async ({ page }) => {
  fake.list([session({})]);
  await page.goto("/");
  await row(page, "alpha").click({ position: { x: 5, y: 5 } });
  const panel = page.getByRole("dialog", { name: "alpha details" });
  await expect(panel).toContainText("press ← or type /bg in its terminal to open it here");
  await expect(panel.getByRole("button", { name: "Go to terminal" })).toBeVisible();
  await expect(panel.locator(".xterm")).toHaveCount(0);
});

test("new_session_starts_a_background_session_in_the_project_and_opens_its_terminal", async ({ page }) => {
  fake.list([session({})]);
  await page.goto("/");
  await page.locator(`section[aria-label="${project}"]`).getByRole("button", { name: /new session/i }).click();
  await expect(screen(page)).toContainText("attached", { timeout: 10_000 });
  expect(fake.started().map((s) => s.cwd)).toEqual([cwd]);
});

test("the_page_sends_the_servers_token_with_jump", async ({ page }) => {
  fake.list([session({})]);
  let sent: string | undefined;
  await page.route("**/jump", (r) => {
    sent = r.request().headers()["x-funtown-token"];
    return r.fulfill({ status: 204 });
  });
  await page.goto("/");
  const token = await page.locator('meta[name="funtown-token"]').getAttribute("content");
  expect(token).toMatch(/^[0-9a-f]+$/);
  await row(page, "alpha").click({ position: { x: 5, y: 5 } });
  await page.getByRole("button", { name: "Go to terminal" }).click();
  await expect.poll(() => sent).toBe(token);
});

test("a_failed_version_check_shows_every_problem_line_in_a_banner", async ({ page }) => {
  const problems = ["Background sessions won't work", "Terminal room won't work"];
  const state = { claude: { version: "2.1.300", problems }, houses: [] };
  await page.route("**/stream", (r) =>
    r.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: `event: state\ndata: ${JSON.stringify(state)}\n\n` }),
  );
  await page.goto("/");
  for (const p of problems) await expect(page.getByText(p)).toBeVisible();
});

test("the_served_page_carries_a_content_security_policy", async ({ page }) => {
  const res = await page.goto("/");
  expect(res!.headers()["content-security-policy"]).toContain("default-src 'self'");
});
