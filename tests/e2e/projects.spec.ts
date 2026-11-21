import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_FAKE_DIR, FakeClaude, listed } from "../fake-claude.ts";
import { addProjectFolder, fontOf, scrollsBack } from "./stream.ts";

const fake = FakeClaude.at(E2E_FAKE_DIR);
let cwd = "";
let project = "";

test.beforeEach(() => {
  cwd = realpathSync(mkdtempSync(join(tmpdir(), "funtown-e2e-proj-")));
  project = basename(cwd);
  fake.reset();
});

/** Ends the project's shell and takes it off the list, so the next test starts clean. */
test.afterEach(async ({ page }) => {
  await page.evaluate(async (dir) => {
    const token = document.querySelector('meta[name="funtown-token"]')!.getAttribute("content")!;
    for (const path of ["/shells/close", "/projects/remove"]) {
      await fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-funtown-token": token }, body: JSON.stringify({ cwd: dir }) });
    }
  }, cwd);
});

const house = (page: Page) => page.locator(`section[aria-label="${project}"]`);
/** Everything the fake shell echoed as `got:"..."`, joined, so one frame per key or per string reads the same. */
const echoed = async (page: Page) =>
  [...(await screen(page).innerText()).matchAll(/got:"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join("");
const screen = (page: Page) => house(page).getByRole("tabpanel").locator(".xterm-rows");

/** Fills "Add project" with `path` and submits it. */
async function addProject(page: Page, path: string) {
  await page.getByRole("textbox", { name: "Project folder" }).fill(path);
  await page.getByRole("button", { name: "Add project" }).click();
}

test("add_project_shows_the_servers_reason_for_a_relative_path_and_adds_no_house", async ({ page }) => {
  await page.goto("/work.html");
  await addProject(page, "relative/dir");
  await expect(page.getByRole("alert").first()).toHaveText(/\S/);
  await expect(page.locator("section[aria-label]").filter({ hasText: "relative" })).toHaveCount(0);
});

test("an_added_project_is_a_house_with_no_session_and_the_first_time_hint_until_a_session_is_listed", async ({ page }) => {
  await page.goto("/work.html");
  await addProject(page, cwd);
  await expect(house(page)).toBeVisible();
  await expect(house(page)).toContainText(/First time here\?.*Shell tab.*trust prompt/s);
  fake.list([listed("t1", cwd, { name: "alpha" })]);
  await expect(house(page).locator(".character").filter({ hasText: "alpha" }).first()).toBeVisible();
  await expect(house(page)).not.toContainText("First time here?");
  await expect(house(page).getByRole("button", { name: /remove project/i })).toBeVisible();
});

test("background_run_posts_the_prompt_as_one_argument_for_the_house", async ({ page }) => {
  await addProjectFolder(cwd);
  fake.list([listed("t1", cwd, { name: "alpha" })]);
  await page.goto("/work.html");
  await house(page).getByRole("button", { name: /background run/i }).click();
  await page.getByRole("textbox", { name: "Prompt" }).fill("fix the; bug");
  await page.getByRole("button", { name: "Start run" }).click();
  await expect.poll(() => fake.started().map((s) => ({ cwd: s.cwd, argv: s.argv }))).toEqual([{ cwd, argv: ["--bg", "fix the; bug"] }]);
});

test("the_shell_tab_echoes_input_survives_a_reload_replays_its_output_and_close_shell_ends_it", async ({ page }) => {
  await page.goto("/work.html");
  await addProject(page, cwd);
  await house(page).getByRole("tab", { name: "Shell" }).click();
  await expect(screen(page)).toContainText(`shell args:-l cwd:${cwd}`, { timeout: 10_000 });
  await page.locator(".xterm").click();
  await page.keyboard.type("hello");
  await expect.poll(() => echoed(page)).toBe("hello");

  await page.reload();
  await house(page).getByRole("tab", { name: "Shell" }).click();
  await expect.poll(() => echoed(page)).toBe("hello");
  expect(fake.shellStarts()).toHaveLength(1);
  const { pid } = fake.shellStarts()[0];

  await house(page).getByRole("button", { name: "Close shell" }).click();
  await expect.poll(() => { try { process.kill(pid, 0); return true; } catch { return false; } }).toBe(false);
});

test("the_shell_tab_says_terminal_closed_when_its_shell_ends", async ({ page }) => {
  await page.goto("/work.html");
  await addProject(page, cwd);
  await house(page).getByRole("tab", { name: "Shell" }).click();
  await expect(screen(page)).toContainText(`shell args:-l cwd:${cwd}`, { timeout: 10_000 });
  await page.locator(".xterm").click();
  // the fake shell exits on an input chunk that holds "exit", so it goes in as one chunk
  await page.keyboard.insertText("exit");
  await expect(house(page)).toContainText("Terminal closed.");
});

test("the_shell_tab_is_set_in_menlo_13_and_keeps_its_scrollback", async ({ page }) => {
  await page.goto("/work.html");
  await addProject(page, cwd);
  await house(page).getByRole("tab", { name: "Shell" }).click();
  await expect(screen(page)).toContainText(`shell args:-l cwd:${cwd}`, { timeout: 10_000 });
  await page.locator(".xterm").click();
  await page.keyboard.insertText("flood");
  await expect(screen(page)).toContainText("END");
  const terminal = house(page).getByRole("tabpanel").locator(".xterm");
  const { family, size } = await fontOf(terminal);
  expect(family).toMatch(/^"?Menlo"?(,|$)/);
  expect(size).toBe("13px");
  expect(await scrollsBack(page, terminal)).toBe(true);
});

test("a_failed_start_shows_the_reason_and_the_setup_hint_in_a_house_that_has_a_session", async ({ page }) => {
  await addProjectFolder(cwd);
  fake.list([listed("t1", cwd, { name: "alpha" })]);
  fake.failBg();
  await page.goto("/work.html");
  await expect(house(page)).toBeVisible();
  await expect(house(page)).not.toContainText("First time here?");
  await house(page).getByRole("button", { name: "New session" }).click();
  await expect(house(page).getByRole("alert")).toHaveText(/\S/);
  await expect(house(page)).toContainText(/First time here\?.*Shell tab.*trust prompt/s);
});

test("the_setup_hint_shows_only_after_a_500_and_goes_when_the_next_action_starts", async ({ page }) => {
  await addProjectFolder(cwd);
  fake.list([listed("t1", cwd, { name: "alpha" })]);
  await page.goto("/work.html");
  await house(page).getByRole("button", { name: /background run/i }).click();
  await page.getByRole("textbox", { name: "Prompt" }).fill("-not allowed");
  await page.getByRole("button", { name: "Start run" }).click();
  await expect(house(page).getByRole("alert")).toHaveText(/\S/); // a 400
  await expect(house(page)).not.toContainText("First time here?");

  fake.failBg();
  await house(page).getByRole("button", { name: "New session" }).click();
  await expect(house(page)).toContainText("First time here?");

  await page.getByRole("textbox", { name: "Prompt" }).fill("-again");
  await page.getByRole("button", { name: "Start run" }).click();
  await expect(house(page).getByRole("alert")).toHaveText(/\S/);
  await expect(house(page)).not.toContainText("First time here?");
});
