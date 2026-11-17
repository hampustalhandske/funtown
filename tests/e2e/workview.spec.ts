import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_FAKE_DIR, FakeClaude, listedBg } from "../fake-claude.ts";
import { addProjectFolder, removeProjectFolder, showTerminal, stubStream } from "./stream.ts";

const EMOJI_STATUS = /[🟢🔴⚪🟡]/u;
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name: `${name} details` });

/** The background colour of the small round-ish box (an element or its ::before/::after) that has no text of its own, or null. */
const dotColour = (where: Locator) =>
  where.evaluate((root) => {
    for (const el of [root, ...root.querySelectorAll("*")]) {
      for (const pseudo of [null, "::before", "::after"]) {
        const css = getComputedStyle(el, pseudo);
        if (pseudo ? css.content === "none" : el.textContent?.trim()) continue;
        const [w, h] = [parseFloat(css.width), parseFloat(css.height)];
        if (!(w >= 4 && w <= 24 && Math.abs(w - h) < 1)) continue;
        if (css.backgroundColor !== "rgba(0, 0, 0, 0)") return css.backgroundColor;
      }
    }
    return null;
  });

const NOW = Date.now();
const claude = { version: "2.1.325", problems: [] };
const lead = (over: Record<string, unknown>) => ({
  id: "s1", name: "lead-1", stage: "working", activity: null, step: null, tty: null, termProgram: null,
  kind: "terminal", shortId: null, subagents: [], ...over,
});
const house = (leads: unknown[]) => ({ project: "demo-app", cwd: "/work/demo-app", leads });
const rowOf = (page: Page, name: string) => page.locator('section[aria-label="demo-app"] .character').filter({ hasText: name }).first();

test.describe("with a stubbed stream", () => {
  test("no_command_text_is_on_a_row_or_in_a_panel_but_a_permission_card_still_shows_its_command_and_folder", async ({ page }) => {
    const command = "rm -rf /work/demo-app/build";
    const working = lead({
      id: "w1", name: "worker", activity: "Bash: npm test", step: "Bash: npm test",
      subagents: [{ id: "x1", name: "Explore-1", stage: "working", activity: "Read: secret.ts", step: "Read: secret.ts" }],
    });
    const asking = lead({ id: "p1", name: "asker", stage: "needs_you", needs: "permission", since: NOW });
    const card = { id: "c1", lead: "p1", agent: null, kind: "permission", tool: "Bash", input: { command }, cwd: "/work/demo-app", at: NOW };
    await stubStream(page, { claude, houses: [house([working, asking])], cards: [card] });
    await page.goto("/work.html");

    for (const name of ["worker", "Explore-1"]) {
      const row = rowOf(page, name);
      await expect(row).toContainText(/working/);
      await expect(row).not.toContainText(/npm test|secret\.ts|Bash|Read:/);
    }
    await rowOf(page, "worker").click({ position: { x: 5, y: 5 } });
    const panel = dialog(page, "worker");
    await expect(panel).toBeVisible();
    await expect(panel).not.toContainText(/Step:|npm test|secret\.ts/);

    await rowOf(page, "asker").click({ position: { x: 5, y: 5 } });
    const asked = dialog(page, "asker");
    await expect(asked).toContainText(command);
    await expect(asked).toContainText("/work/demo-app");
  });

  test("status_is_a_coloured_dot_plus_its_word_in_rows_the_panel_and_the_needs_you_heading_with_no_emoji", async ({ page }) => {
    const leads = [
      lead({ id: "a", name: "alpha" }),
      lead({ id: "b", name: "bravo", stage: "needs_you", needs: "turn ended", since: NOW }),
      lead({ id: "c", name: "charlie", stage: "done" }),
    ];
    await stubStream(page, { claude, houses: [house(leads)], cards: [] });
    await page.goto("/work.html");

    const colours: Record<string, string | null> = {};
    for (const [name, word] of [["alpha", "working"], ["bravo", "needs you"], ["charlie", "done"]]) {
      const row = rowOf(page, name);
      await expect(row).toContainText(word);
      expect(await row.innerText(), `${name} row`).not.toMatch(EMOJI_STATUS);
      colours[word] = await dotColour(row);
    }
    expect(Object.values(colours).every((c) => c !== null), JSON.stringify(colours)).toBe(true);
    expect(new Set(Object.values(colours)).size, "one colour per status").toBe(3);

    const queue = page.getByRole("region", { name: /needs you/i });
    await expect(queue).toContainText("bravo");
    expect(await queue.innerText()).not.toMatch(EMOJI_STATUS);
    await rowOf(page, "bravo").click({ position: { x: 5, y: 5 } });
    const panel = dialog(page, "bravo");
    await expect(panel).toContainText("needs you");
    expect(await panel.innerText()).not.toMatch(EMOJI_STATUS);
  });

  test("close_session_posts_the_lead_with_the_page_token_and_shows_the_servers_failure_text", async ({ page }) => {
    const bg = lead({ id: "b1", name: "beta", kind: "background", shortId: "b1b1b1b1" });
    await stubStream(page, { claude, houses: [house([bg])], cards: [] });
    const posts: { body: unknown; token: string | undefined }[] = [];
    await page.route("**/sessions/stop", (r) => {
      posts.push({ body: r.request().postDataJSON(), token: r.request().headers()["x-funtown-token"] });
      return r.fulfill({ status: 500, contentType: "text/plain", body: "Couldn't close the session: boom" });
    });
    await page.goto("/work.html");
    await rowOf(page, "beta").click({ position: { x: 5, y: 5 } });
    const panel = dialog(page, "beta");
    await panel.getByRole("button", { name: "Close session" }).click();
    await expect(panel).toContainText("Couldn't close the session: boom");
    const token = await page.locator('meta[name="funtown-token"]').getAttribute("content");
    expect(posts).toEqual([{ body: { lead: "b1" }, token }]);
    await expect(panel).toBeVisible();
  });
});

test.describe("with the e2e server and its fake claude", () => {
  const fake = FakeClaude.at(E2E_FAKE_DIR);
  const sid = "abcd1234-0000-4000-8000-000000000000";
  let cwd = "";
  let project = "";

  test.beforeEach(async () => {
    cwd = realpathSync(mkdtempSync(join(tmpdir(), "funtown-e2e-proj-")));
    project = basename(cwd);
    fake.reset();
    await addProjectFolder(cwd);
    fake.list([listedBg(sid, cwd, { name: "beta" })]);
  });
  test.afterEach(async () => {
    await removeProjectFolder(cwd);
  });
  const row = (page: Page) => page.locator(`section[aria-label="${project}"] .character`).filter({ hasText: "beta" }).first();

  test("the_terminal_and_its_socket_exist_only_while_shown_the_reply_box_is_inside_it_and_hiding_leaves_the_session_running", async ({ page }) => {
    const opened: string[] = [];
    const closed: string[] = [];
    page.on("websocket", (ws) => {
      if (!ws.url().includes("/term")) return;
      opened.push(ws.url());
      ws.on("close", () => closed.push(ws.url()));
    });
    await page.goto("/work.html");
    await row(page).click({ position: { x: 5, y: 5 } });
    const panel = dialog(page, "beta");
    const toggle = panel.getByRole("button", { name: /(show|hide) terminal/i });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(panel.locator(".xterm")).toHaveCount(0);
    await expect(panel.getByRole("textbox", { name: "Reply" })).toHaveCount(0);
    await page.waitForTimeout(500); // a socket opened on mount would show by now
    expect(opened).toEqual([]);

    await showTerminal(panel);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(panel.locator(".xterm-rows")).toContainText("attached abcd1234");
    await expect(panel.getByRole("textbox", { name: "Reply" })).toBeVisible();
    expect(opened).toHaveLength(1);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(panel.locator(".xterm")).toHaveCount(0);
    await expect(panel.getByRole("textbox", { name: "Reply" })).toHaveCount(0);
    await expect.poll(() => closed).toHaveLength(1);
    await expect(row(page)).toBeVisible();
    expect(fake.stopCalls()).toEqual([]);
    expect(fake.sessions().map((s) => s.sessionId)).toEqual([sid]);
  });

  test("close_session_runs_claude_stop_for_the_short_id_and_the_session_leaves_the_list_and_its_panel_closes", async ({ page }) => {
    await page.goto("/work.html");
    await row(page).click({ position: { x: 5, y: 5 } });
    const panel = dialog(page, "beta");
    await panel.getByRole("button", { name: "Close session" }).click();
    await expect(row(page)).toHaveCount(0);
    await expect(panel).toHaveCount(0);
    expect(fake.stopCalls()).toEqual([["stop", "abcd1234"]]);
  });
});
