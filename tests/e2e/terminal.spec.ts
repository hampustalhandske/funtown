import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { alive, E2E_FAKE_DIR, E2E_URL, FakeClaude, listed, listedBg } from "../fake-claude.ts";
import { addProjectFolder, betaState, fontOf, questionCard, removeProjectFolder, scrollsBack, showTerminal, sizeShown, stubStream } from "./stream.ts";

const fake = FakeClaude.at(E2E_FAKE_DIR);
const sid = "abcd1234-0000-4000-8000-000000000000";
const short = sid.slice(0, 8);
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

/** Opens beta's panel in the work view and shows its terminal once it has attached; gives the panel. Set the fake's flags and the page's scripts first. */
async function openSheet(page: Page) {
  fake.list([bg()]);
  await page.goto("/work.html");
  await row(page, "beta").click({ position: { x: 5, y: 5 } });
  const panel = page.getByRole("dialog");
  await showTerminal(panel);
  await expect(screen(page)).toContainText("attached abcd1234");
  return panel;
}

/** Loads the work view with the page's clock paused, so a panel's 300 ms only passes on `clock.runFor`. */
async function pausedPage(page: Page, sessions = [bg()]) {
  fake.list(sessions);
  await page.clock.install();
  await page.goto("/work.html");
  await expect(row(page, "beta")).toBeVisible();
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
}

test("rows_show_each_sessions_name_and_kind", async ({ page }) => {
  fake.list([session(), bg()]);
  await page.goto("/work.html");
  await expect(row(page, "alpha")).toContainText(/terminal/i);
  await expect(row(page, "beta")).toContainText(/background/i);
});

test("a_background_session_opens_a_live_terminal_that_echoes_typed_text_and_sends_shift_enter_as_esc_cr", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => /content security policy/i.test(m.text()) && violations.push(m.text()));
  await openSheet(page);
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
  await openSheet(page);
  // nothing typed or resized by the test: the first frame is the size the terminal has when the socket opens
  await expect.poll(() => sent.length).toBeGreaterThan(0);
  expect(JSON.parse(sent[0])).toEqual({ t: "resize", c: Number(query!.get("cols")), r: Number(query!.get("rows")) });
});

test.describe("links", () => {
  const opened = (page: Page) => page.evaluate(() => (window as unknown as { opened: string[] }).opened);
  /** Clicks the first cell of the row showing `text`, holding `modifier`: the rows sit under xterm's overlay, so the click goes by mouse position. */
  const clickLink = async (page: Page, text: string, modifier?: "Meta" | "Alt") => {
    const box = (await screen(page).locator(":scope > div").filter({ hasText: text }).first().boundingBox())!;
    await page.mouse.move(box.x + 4, box.y + box.height / 2);
    if (modifier) await page.keyboard.down(modifier);
    await page.mouse.down();
    await page.mouse.up();
    if (modifier) await page.keyboard.up(modifier);
  };

  test.beforeEach(async ({ page }) => {
    fake.linksAttach();
    await page.addInitScript(() => {
      const w = window as unknown as { opened: string[] };
      w.opened = [];
      window.open = (url) => (w.opened.push(String(url)), null);
    });
    await openSheet(page);
    await expect(screen(page)).toContainText("js-link");
  });

  for (const [kind, text, url] of [
    ["a_plain_http_link", "http://example.test/plain", "http://example.test/plain"],
    ["an_osc_8_link", "osc-link", "https://example.test/osc"],
  ]) {
    test(`cmd_click_on_${kind}_opens_it_and_a_plain_click_opens_nothing_and_no_confirm_appears`, async ({ page }) => {
      const dialogs: string[] = [];
      page.on("dialog", (d) => (dialogs.push(d.message()), d.dismiss()));
      await clickLink(page, text);
      await clickLink(page, text, "Alt");
      expect(await opened(page)).toEqual([]);
      await clickLink(page, text, "Meta");
      await expect.poll(() => opened(page)).toEqual([url]);
      expect(dialogs).toEqual([]);
    });
  }

  test("a_javascript_link_opens_nothing_even_with_cmd", async ({ page }) => {
    const dialogs: string[] = [];
    page.on("dialog", (d) => (dialogs.push(d.message()), d.dismiss()));
    await clickLink(page, "js-link", "Meta");
    // the https link proves Cmd+click works here, so the js-link's silence is the filter's doing
    await clickLink(page, "osc-link", "Meta");
    await expect.poll(() => opened(page)).toEqual(["https://example.test/osc"]);
    expect(dialogs).toEqual([]);
  });
});

test.describe("keys, copy, paste and scrolling", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  /** Opens beta's terminal and gives its typing place the keyboard. */
  async function openTerminal(page: Page, modes = false) {
    fake.modesAttach(modes);
    await openSheet(page);
    // focus, not a click: in mouse mode a click would reach the session as a report
    await page.locator(".xterm-helper-textarea").focus();
  }
  /** The box of the terminal's row showing `text`, found by mouse position (the rows sit under xterm's overlay). */
  const rowBox = async (page: Page, text: string) =>
    (await screen(page).locator(":scope > div").filter({ hasText: text }).first().boundingBox())!;

  test("a_character_typed_with_option_held_reaches_the_session_as_itself", async ({ page }) => {
    // Catches Option as Meta: a Swedish layout's @, | and brackets would arrive as Esc plus a letter.
    await openTerminal(page);
    // Playwright leaves the character off a key pressed with Alt held, so send the events Chrome sends on a Mac: Option held, the key and its character.
    const cdp = await page.context().newCDPSession(page);
    for (const char of ["@", "|", "["]) {
      const key = { key: char, text: char, modifiers: 1 };
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...key });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: char, modifiers: 1 });
    }
    await expect.poll(() => echoed(page)).toBe("@|[");
  });

  test("escape_in_the_terminal_reaches_the_session_and_leaves_the_panel_open", async ({ page }) => {
    // Catches Escape closing the panel while the user is typing to Claude.
    await openTerminal(page);
    await page.keyboard.press("Escape");
    await expect.poll(() => echoed(page)).toBe("\\u001b");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(screen(page)).toBeVisible();
  });

  test("cmd_esc_moves_focus_to_the_sheets_column_leaves_the_terminal_shown_and_sends_nothing", async ({ page }) => {
    // Catches Cmd+Esc reaching Claude as an Esc (which interrupts it), or leaving the keyboard trapped in the terminal.
    await openTerminal(page);
    await page.keyboard.type("a");
    await expect.poll(() => echoed(page)).toBe("a");
    await page.keyboard.press("Meta+Escape");
    await expect(page.getByRole("dialog").locator(".column")).toBeFocused();
    await expect(screen(page)).toBeVisible();
    await page.locator(".xterm-helper-textarea").focus();
    await page.keyboard.type("b");
    // an Esc sent by the Cmd+Esc would show between the two letters
    await expect.poll(() => echoed(page)).toBe("ab");
  });

  test("ctrl_v_reaches_the_session_so_claude_can_read_an_image", async ({ page }) => {
    // Catches Ctrl+V being taken as a paste by the page, so Claude never sees it.
    await openTerminal(page);
    await page.keyboard.press("Control+v");
    await expect.poll(() => echoed(page)).toBe("\\u0016");
  });

  test("cmd_v_sends_the_clipboards_text_as_one_bracketed_paste", async ({ page }) => {
    // Catches a paste typed key by key (each line submitting itself) instead of one bracketed paste.
    await openTerminal(page, true);
    await page.evaluate(() => navigator.clipboard.writeText("one\ntwo"));
    await page.keyboard.press("Meta+v");
    await expect.poll(() => echoed(page)).toBe("\\u001b[200~one\\rtwo\\u001b[201~");
    expect((await screen(page).innerText()).match(/got:/g)).toHaveLength(1);
  });

  test("option_drag_makes_a_terminal_selection_that_cmd_c_copies_and_a_plain_drag_goes_to_the_session", async ({ page }) => {
    // Catches a drag that can never select in xterm's own layer once Claude has turned mouse mode on.
    await openTerminal(page, true);
    const box = await rowBox(page, "attached abcd1234");
    const y = box.y + box.height / 2;
    const drag = async (modifier?: "Alt") => {
      await page.mouse.move(box.x + 4, y);
      if (modifier) await page.keyboard.down(modifier);
      await page.mouse.down();
      await page.mouse.move(box.x + 60, y, { steps: 4 });
      await page.mouse.up();
      if (modifier) await page.keyboard.up(modifier);
    };
    await drag();
    // a plain drag goes to Claude as mouse reports, and selects nothing in xterm
    await expect.poll(() => echoed(page)).toMatch(/\\u001b\[<0;\d+;\d+M\\u001b\[<0;\d+;\d+m$/);
    await expect(page.locator(".xterm-selection div")).toHaveCount(0);
    const before = (await echoed(page)).length;
    await drag("Alt");
    await expect(page.locator(".xterm-selection div").first()).toBeVisible();
    expect((await echoed(page)).length).toBe(before);
    await page.keyboard.press("Meta+c");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("ttach");
  });

  test("the_wheel_sends_wheel_sequences_once_the_session_turns_mouse_mode_on", async ({ page }) => {
    // Catches the wheel turning into arrow keys (which scroll Claude's prompt history) in a session that wants wheel reports.
    await openTerminal(page, true);
    const box = await rowBox(page, "attached abcd1234");
    await page.mouse.move(box.x + 10, box.y + 4);
    await page.mouse.wheel(0, -100);
    await expect.poll(() => echoed(page)).toContain("\\u001b[<64;");
    await page.mouse.wheel(0, 100);
    await expect.poll(() => echoed(page)).toContain("\\u001b[<65;");
  });

  test("pgup_and_pgdn_reach_the_session", async ({ page }) => {
    // Catches the terminal keeping the page keys for a scrollback it doesn't have.
    await openTerminal(page);
    await page.keyboard.press("PageUp");
    await page.keyboard.press("PageDown");
    await expect.poll(() => echoed(page)).toBe("\\u001b[5~\\u001b[6~");
  });
});

/** The names of the scripts the page asks for from now on. */
const watchScripts = (page: Page) => {
  const names: string[] = [];
  page.on("request", (r) => /\.js($|\?)/.test(r.url()) && names.push(new URL(r.url()).pathname.split("/").pop()!));
  return names;
};

test("show_terminal_requests_no_script_so_no_click_waits_on_a_download", async ({ page }) => {
  // Catches the terminal or the reply box loaded lazily: the click would wait on a download.
  const scripts = watchScripts(page);
  fake.list([bg()]);
  await page.goto("/work.html");
  await row(page, "beta").click({ position: { x: 5, y: 5 } });
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("button", { name: /show terminal/i })).toBeVisible();
  // the panel's own lazy part (the letters) has finished loading, so only the click can add a script
  await expect.poll(() => scripts.some((s) => /^Letters/.test(s))).toBe(true);
  await expect(panel.getByRole("textbox", { name: "Reply" })).toBeVisible();
  scripts.length = 0;
  await showTerminal(panel);
  await expect(screen(page)).toContainText("attached abcd1234");
  expect(scripts).toEqual([]);
});

test("the_letters_markdown_renderer_is_not_in_the_first_page_load", async ({ page }) => {
  // Catches the Markdown libraries sitting in the main bundle, which the reply box doesn't need.
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
  await openSheet(page);
  const terminal = page.getByRole("dialog").locator(".xterm");
  const { family, size } = await fontOf(terminal);
  expect(family).toMatch(/^"?Menlo"?(,|$)/);
  expect(size).toBe("13px");
  expect(await scrollsBack(page, terminal)).toBe(false);
});

test.describe("the terminal sheet at 1280 x 800", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the_shown_terminal_is_at_least_100_by_40_with_the_header_still_visible", async ({ page }) => {
    // Catches a panel too small for Claude (95 x 25) or running off the window.
    const panel = await openSheet(page);
    const size = await sizeShown(screen(page));
    expect(size!.cols).toBeGreaterThanOrEqual(100);
    expect(size!.rows).toBeGreaterThanOrEqual(40);
    const header = (await page.locator("header").boundingBox())!;
    const sheet = (await panel.boundingBox())!;
    expect(sheet.y).toBeGreaterThanOrEqual(header.y + header.height);
    expect(sheet.y + sheet.height).toBeLessThanOrEqual(800);
    await expect(page.getByRole("button", { name: /^(un)?mute$/i })).toBeInViewport();
  });

  test("claudes_prompt_box_is_visible_when_the_terminal_opens_with_no_scrolling", async ({ page }) => {
    // Catches the terminal's last row sitting below the fold of the panel.
    fake.promptAttach();
    await openSheet(page);
    await expect(screen(page)).toContainText("PROMPT-BOX");
    await expect(screen(page).getByText("PROMPT-BOX")).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => scrollY + (document.querySelector("[role=dialog]")?.scrollTop ?? 0))).toBe(0);
  });

  test("the_reply_box_is_hidden_while_the_sheet_shows_and_back_when_the_terminal_is_hidden", async ({ page }) => {
    // Catches two places to type at once, and a narrow panel with no way to send a short reply.
    const panel = await openSheet(page);
    const reply = panel.getByRole("textbox", { name: "Reply" });
    await expect(reply).toHaveCount(0);
    await panel.getByRole("button", { name: /hide terminal/i }).click();
    await expect(reply).toBeVisible();
    await reply.fill("hello");
    await panel.getByRole("button", { name: "Send" }).click();
    // the hidden terminal kept its socket, so the short reply goes out
    await expect(reply).toHaveValue("");
    await expect(panel.getByRole("alert")).toHaveCount(0);
    await panel.getByRole("button", { name: /show terminal/i }).click();
    await expect.poll(() => echoed(page)).toBe("\\u001b[200~hello\\u001b[201~\\r");
    await expect(page.locator(".xterm-helper-textarea")).toBeFocused();
  });

  test("the_terminal_text_sits_inside_padding_so_the_rounded_corner_never_clips_the_cursor", async ({ page }) => {
    // Catches text flush on the box's left edge.
    const panel = await openSheet(page);
    const box = (await panel.getByLabel("Session terminal").boundingBox())!;
    const text = (await screen(page).boundingBox())!;
    expect(text.x - box.x).toBeGreaterThanOrEqual(4);
    expect(text.y - box.y).toBeGreaterThanOrEqual(4);
  });

  test("with_a_card_the_buttons_stay_inside_the_window_on_the_sheet_and_on_the_narrow_panel", async ({ page }) => {
    // Catches a tall card pushing Show terminal, Hide terminal and Close session below the window.
    fake.list([bg()]);
    await stubStream(page, betaState(project, cwd, sid, [questionCard(sid, cwd)]));
    await page.goto("/work.html");
    await row(page, "beta").click({ position: { x: 5, y: 5 } });
    const panel = page.getByRole("dialog");
    await expect(panel.getByText("Which queue?")).toBeAttached({ timeout: 10_000 });
    await expect(panel.getByRole("button", { name: "Show terminal" })).toBeInViewport({ ratio: 1 });
    await showTerminal(panel);
    await expect(screen(page)).toContainText("attached abcd1234");
    await expect(panel.getByRole("button", { name: "Hide terminal" })).toBeInViewport({ ratio: 1 });
    await expect(panel.getByRole("button", { name: "Close session" })).toBeInViewport({ ratio: 1 });
  });

  test("the_terminal_refits_and_the_session_is_told_when_the_window_changes_size", async ({ page }) => {
    // Catches a terminal that keeps its size when the window shrinks, so Claude draws to a size the user doesn't see.
    await openSheet(page);
    const before = (await sizeShown(screen(page)))!;
    await page.setViewportSize({ width: 1000, height: 700 });
    await expect.poll(async () => (await sizeShown(screen(page)))!.cols).toBeLessThan(before.cols);
    const after = (await sizeShown(screen(page)))!;
    expect(after.rows).toBeLessThan(before.rows);
    expect(after.count).toBeGreaterThan(before.count);
  });

  test("a_card_sits_in_the_19rem_column_and_its_act_row_stays_on_screen_while_the_column_scrolls", async ({ page }) => {
    // Catches a card that widens the column (costing the terminal columns) or pushes its answer below the window.
    fake.list([bg()]);
    await page.goto("/work.html");
    // the server lists the session (so it can attach) before the page gets the stubbed card
    await expect(row(page, "beta")).toBeVisible();
    await stubStream(page, betaState(project, cwd, sid, [questionCard(sid, cwd)]));
    await page.reload();
    await row(page, "beta").click({ position: { x: 5, y: 5 } });
    const panel = page.getByRole("dialog");
    await showTerminal(panel);
    await expect(screen(page)).toContainText("attached abcd1234");
    const column = (await panel.locator(".column").boundingBox())!;
    expect(column.width).toBe(19 * 16);
    const card = (await panel.getByRole("group", { name: "question request" }).boundingBox())!;
    expect(card.x + card.width).toBeLessThanOrEqual(column.x + column.width);
    expect(await panel.locator(".lines").evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
    await expect(panel.getByRole("button", { name: /^Send: / })).toBeInViewport({ ratio: 1 });
  });

  test("a_card_shows_in_the_column_and_takes_no_rows_from_the_terminal", async ({ page }) => {
    // Catches a card stacked above the terminal, which would cost it rows.
    const stream = await stubStream(page, betaState(project, cwd, sid, []));
    const panel = await openSheet(page);
    const terminal = panel.getByLabel("Session terminal");
    const before = (await terminal.boundingBox())!;
    const size = (await sizeShown(screen(page)))!;
    const card = {
      id: "c1", lead: sid, agent: null, kind: "permission", tool: "Bash", input: { command: "rm -rf build" }, cwd, at: 1,
      severity: { level: "high", reason: "Funtown's rule: rm with a recursive flag can't be walked back", source: "rule" },
    };
    stream.send(betaState(project, cwd, sid, [card]));
    await expect(panel.getByRole("button", { name: "Allow" })).toBeVisible({ timeout: 10_000 });
    expect(await terminal.boundingBox()).toEqual(before);
    expect((await panel.getByRole("button", { name: "Allow" }).boundingBox())!.x).toBeLessThan(before.x);
    expect(await sizeShown(screen(page))).toEqual(size);
  });
});

test.describe("the terminal sheet at 390 px", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("the_buttons_are_inside_the_window_and_the_terminal_keeps_at_least_40_columns", async ({ page }) => {
    // Catches the 19rem column keeping its width and squeezing the terminal to 2 columns.
    const panel = await openSheet(page);
    await expect(panel.getByRole("button", { name: "Hide terminal" })).toBeInViewport({ ratio: 1 });
    await expect(panel.getByRole("button", { name: "Close session" })).toBeInViewport({ ratio: 1 });
    expect((await sizeShown(screen(page)))!.cols).toBeGreaterThanOrEqual(40);
  });

  test("a_card_gets_room_to_read_its_ask_without_scrolling_and_the_terminal_keeps_rows", async ({ page }) => {
    // Catches a card squeezed into a band above the terminal, where the ask itself needs scrolling to read.
    const one = questionCard(sid, cwd);
    const card = { ...one, input: { questions: [one.input.questions[0]] }, questions: [one.questions[0]] };
    fake.list([bg()]);
    await page.goto("/work.html");
    await expect(row(page, "beta")).toBeVisible();
    await stubStream(page, betaState(project, cwd, sid, [card]));
    await page.reload();
    await row(page, "beta").click({ position: { x: 5, y: 5 } });
    const panel = page.getByRole("dialog");
    await showTerminal(panel);
    await expect(screen(page)).toContainText("attached abcd1234");
    const lines = (await panel.locator(".lines").boundingBox())!;
    const ask = (await panel.getByRole("heading", { name: "Which database?" }).boundingBox())!;
    expect(ask.y + ask.height).toBeLessThanOrEqual(lines.y + lines.height);
    await expect(panel.getByRole("button", { name: /^Send: / })).toBeInViewport({ ratio: 1 });
    await expect.poll(async () => (await sizeShown(screen(page)))!.rows).toBeGreaterThanOrEqual(12);
  });
});

test.describe("early attach", () => {
  /** The `claude attach` clients started for beta since `before` (the fake's pid file outlives a test). */
  const since = (before: number) => fake.attachPids(short).slice(before);

  test("a_panel_open_past_300_ms_starts_exactly_one_attach_and_one_closed_before_starts_none", async ({ page }) => {
    // Catches a panel that attaches on every glance, or never before Show (so the click waits on the attach).
    const before = fake.attachPids(short).length;
    await pausedPage(page);
    await row(page, "beta").click({ position: { x: 5, y: 5 } });
    const panel = page.getByRole("dialog", { name: "beta details" });
    await page.clock.runFor(200);
    await panel.getByRole("button", { name: "Close", exact: true }).click();
    await expect(panel).toHaveCount(0);
    await page.clock.runFor(1000);
    expect(since(before)).toEqual([]);
    await row(page, "beta").click({ position: { x: 5, y: 5 } });
    await page.clock.runFor(300);
    await expect.poll(() => since(before).length).toBe(1);
    await page.clock.runFor(2000);
    await page.clock.resume();
    await showTerminal(panel);
    await expect(screen(page)).toContainText("attached abcd1234");
    expect(since(before)).toHaveLength(1);
  });

  test("hide_then_show_reuses_the_client_and_closing_the_panel_ends_it", async ({ page }) => {
    // Catches a Show that starts a second client, and a closed panel that leaves its client attached.
    const before = fake.attachPids(short).length;
    await pausedPage(page);
    await row(page, "beta").click({ position: { x: 5, y: 5 } });
    const panel = page.getByRole("dialog", { name: "beta details" });
    await page.clock.runFor(300);
    await expect.poll(() => since(before).length).toBe(1);
    const [pid] = since(before);
    await page.clock.resume();
    await showTerminal(panel);
    await expect(screen(page)).toContainText("attached abcd1234");
    await panel.getByRole("button", { name: /hide terminal/i }).click();
    await showTerminal(panel);
    await expect(screen(page)).toContainText("attached abcd1234");
    expect(since(before)).toEqual([pid]);
    expect(alive(pid)).toBe(true);
    await panel.getByRole("button", { name: "Close", exact: true }).click();
    await expect.poll(() => alive(pid)).toBe(false);
  });

  test("opening_another_characters_panel_ends_the_first_ones_client", async ({ page }) => {
    // Catches a client that outlives its panel when the user moves straight to another character.
    const other = "efgh5678-0000-4000-8000-000000000000";
    const before = fake.attachPids(short).length;
    await pausedPage(page, [bg(), listedBg(other, cwd, { name: "gamma" })]);
    await row(page, "beta").click({ position: { x: 5, y: 5 } });
    await page.clock.runFor(300);
    await expect.poll(() => since(before).length).toBe(1);
    const [pid] = since(before);
    await row(page, "gamma").click({ position: { x: 5, y: 5 } });
    await expect(page.getByRole("dialog", { name: "gamma details" })).toBeVisible();
    await page.clock.runFor(100);
    await expect.poll(() => alive(pid)).toBe(false);
  });

  test("show_pressed_before_300_ms_connects_and_shows_the_session_with_one_client", async ({ page }) => {
    // Catches a Show that waits for the early attach, and the switch-off path (connect on Show) breaking.
    const before = fake.attachPids(short).length;
    await pausedPage(page);
    await row(page, "beta").click({ position: { x: 5, y: 5 } });
    const panel = page.getByRole("dialog", { name: "beta details" });
    await showTerminal(panel);
    await expect.poll(() => since(before).length).toBe(1);
    // xterm draws on animation frames, so let time run to read the screen; the 300 ms then pass too
    await page.clock.resume();
    await expect(screen(page)).toContainText("attached abcd1234");
    await expect(page.locator(".xterm-helper-textarea")).toBeFocused();
    await page.clock.runFor(1000);
    expect(since(before)).toHaveLength(1);
  });

  test("the_hidden_terminal_never_holds_focus_even_through_tab_and_keys_typed_in_the_page_never_reach_the_session", async ({ page }) => {
    // Catches an early terminal that grabs the keyboard (or sits in the tab order), so the user's typing lands in Claude unseen.
    await page.addInitScript(() => {
      const w = window as unknown as { inTerminal: number; focusCalls: number };
      w.inTerminal = 0;
      w.focusCalls = 0;
      document.addEventListener("focusin", (e) => (e.target as Element).closest?.(".screen") && w.inTerminal++, true);
      // the terminal sits inert while hidden, so a focus() the page's code asks of it would do nothing visible: count the calls
      const focus = HTMLElement.prototype.focus;
      HTMLElement.prototype.focus = function (...args) {
        if (this.closest(".screen")) w.focusCalls++;
        return focus.apply(this, args);
      };
    });
    const typed = fake.attachInput(short).length;
    const before = fake.attachPids(short).length;
    fake.list([bg()]);
    await page.goto("/work.html");
    await row(page, "beta").click({ position: { x: 5, y: 5 } });
    await expect.poll(() => since(before).length).toBe(1);
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      await page.keyboard.type("zq");
    }
    expect(await page.evaluate(() => (window as unknown as { inTerminal: number }).inTerminal)).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { focusCalls: number }).focusCalls)).toBe(0);
    // the reply box took some of the typing; send nothing, and the session must have had no byte
    expect(fake.attachInput(short).slice(typed)).toBe("");
    await showTerminal(page.getByRole("dialog"));
    await expect(page.locator(".xterm-helper-textarea")).toBeFocused();
  });

  test("after_hide_terminal_keys_typed_and_tabbed_in_the_page_never_reach_the_session", async ({ page }) => {
    // Catches a hidden terminal that keeps the keyboard the user had in it, so the page's typing lands in Claude unseen.
    const typed = fake.attachInput(short).length;
    const panel = await openSheet(page);
    await page.locator(".xterm-helper-textarea").focus();
    await page.keyboard.type("a");
    await expect.poll(() => fake.attachInput(short).slice(typed)).toBe("a");
    await panel.getByRole("button", { name: /hide terminal/i }).click();
    await expect(panel.getByRole("textbox", { name: "Reply" })).toBeVisible();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      await page.keyboard.type("zq");
      expect(await page.evaluate(() => document.activeElement?.closest(".screen") ?? null)).toBeNull();
    }
    expect(fake.attachInput(short).slice(typed)).toBe("a");
  });

  test.describe("at 1280 x 800", () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test("the_early_client_starts_at_the_sheets_size_so_show_resizes_nothing", async ({ page }) => {
      // Catches a hidden terminal made at xterm's 80 x 24, so Claude redraws for the new size the moment Show reveals it.
      const before = fake.attachPids(short).length;
      fake.list([bg()]);
      await page.goto("/work.html");
      await row(page, "beta").click({ position: { x: 5, y: 5 } });
      await expect.poll(() => since(before).length).toBe(1);
      await showTerminal(page.getByRole("dialog"));
      await expect(screen(page)).toContainText("attached abcd1234");
      const size = (await sizeShown(screen(page)))!;
      expect(size.cols).toBeGreaterThanOrEqual(100);
      expect(size.rows).toBeGreaterThanOrEqual(40);
      expect(size.count).toBe(1);
    });
  });
});

test.describe("the waking line", () => {
  const waking = (page: Page) => page.getByText("Waking the session...");
  /** Opens beta's panel with the page's clock paused and lets the early attach start its client; the terminal is not shown yet. */
  async function openPanel(page: Page) {
    const before = fake.attachPids(short).length;
    await pausedPage(page);
    await row(page, "beta").click({ position: { x: 5, y: 5 } });
    await page.clock.runFor(300);
    await expect.poll(() => fake.attachPids(short).length).toBe(before + 1);
    return page.getByRole("dialog", { name: "beta details" });
  }

  test("a_silent_client_shows_the_waking_line_300_ms_after_show_not_after_the_connection", async ({ page }) => {
    // Catches a line timed from the mount (long before Show, so it shows at once) or one that never shows.
    fake.silentAttach();
    const panel = await openPanel(page);
    // the socket has been open since the early attach; the terminal is not shown yet
    await page.clock.runFor(2000);
    await expect(waking(page)).toHaveCount(0);
    await showTerminal(panel);
    await page.clock.runFor(299);
    await expect(waking(page)).toHaveCount(0);
    await page.clock.runFor(1);
    await expect(waking(page)).toBeVisible();
  });

  test("the_first_output_removes_the_waking_line_and_the_terminal_does_not_move", async ({ page }) => {
    // Catches a line written into the terminal (it would move Claude's screen) and one that stays after text arrives.
    fake.silentAttach();
    const panel = await openPanel(page);
    await showTerminal(panel);
    await page.clock.runFor(300);
    await expect(waking(page)).toBeVisible();
    const terminal = panel.getByLabel("Session terminal");
    const before = (await terminal.boundingBox())!;
    expect(await screen(page).innerText()).not.toContain("Waking");
    // the silent fake prints once it is typed to
    await page.keyboard.type("x");
    await expect(waking(page)).toHaveCount(0);
    expect(await terminal.boundingBox()).toEqual(before);
    await page.clock.resume();
    await expect(screen(page)).toContainText("got:");
    expect(await screen(page).innerText()).not.toContain("Waking");
  });

  test("a_terminal_that_already_holds_text_when_shown_never_shows_the_waking_line", async ({ page }) => {
    // Catches a line that shows on a terminal whose early attach has long since drawn Claude's screen.
    const panel = await openPanel(page);
    await page.clock.resume();
    await expect(page.locator(".screen .xterm-rows")).toContainText("attached abcd1234");
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
    await showTerminal(panel);
    await page.clock.runFor(2000);
    await expect(waking(page)).toHaveCount(0);
  });
});

test.describe("the client's end", () => {
  const starts = () => fake.attachPids(short).length;

  test("exit_0_folds_the_sheet_and_says_detached_and_only_show_terminal_attaches_again", async ({ page }) => {
    // Catches a detach that leaves the sheet open, or a panel that starts a new client on its own.
    fake.list([bg()]);
    fake.exitAttach({ code: 0, line: "Detached." });
    const before = starts();
    await page.clock.install();
    await page.goto("/work.html");
    await row(page, "beta").click({ position: { x: 5, y: 5 } });
    const panel = page.getByRole("dialog", { name: "beta details" });
    await showTerminal(panel);
    await expect(panel).toContainText("Detached; the session keeps running.");
    await expect(panel).not.toHaveClass(/sheet/);
    await expect(panel.getByRole("button", { name: "Show terminal" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Close session" })).toBeVisible();
    // time passes on the page and no terminal comes back by itself
    await page.clock.fastForward(5000);
    await expect(panel.locator(".xterm")).toHaveCount(0);
    expect(starts()).toBe(before + 1);

    fake.exitAttach(null);
    await showTerminal(panel);
    await expect(screen(page)).toContainText("attached abcd1234");
    await expect(panel).toHaveClass(/sheet/);
    await expect(panel).not.toContainText("Detached");
    expect(starts()).toBe(before + 2);
  });

  test("a_non_zero_exit_shows_the_clients_last_line_in_the_narrow_panel", async ({ page }) => {
    // Catches a failed attach that looks like a detach, or one that says nothing.
    fake.list([bg()]);
    fake.exitAttach({ code: 2, line: "Error: no such session" });
    await page.goto("/work.html");
    await row(page, "beta").click({ position: { x: 5, y: 5 } });
    const panel = page.getByRole("dialog", { name: "beta details" });
    await showTerminal(panel);
    await expect(panel.getByRole("alert")).toContainText("Error: no such session");
    await expect(panel).not.toContainText("Detached");
    await expect(panel).not.toHaveClass(/sheet/);
    await expect(panel.getByRole("button", { name: "Show terminal" })).toBeVisible();
  });

  test("a_close_of_funtowns_own_says_what_happened_not_the_clients_last_line", async ({ page }) => {
    // Catches a failed start (close code 1011) shown as a client's exit, or with no line at all.
    fake.list([bg()]);
    await page.routeWebSocket(/\/term/, (ws) => ws.close({ code: 1011, reason: "spawn failed" }));
    await page.goto("/work.html");
    await row(page, "beta").click({ position: { x: 5, y: 5 } });
    const panel = page.getByRole("dialog", { name: "beta details" });
    await showTerminal(panel);
    await expect(panel.getByRole("alert")).toHaveText("Couldn't start the session's client.");
    await expect(panel.getByRole("button", { name: "Show terminal" })).toBeVisible();
  });

  test("close_session_shows_no_end_line_while_the_client_exits_before_the_lead_leaves_the_list", async ({ page }) => {
    // Catches "Detached; the session keeps running." flashing after Close session, which stops the session.
    fake.list([bg()]);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/sessions/stop", async (route) => {
      await held;
      await route.fulfill({ status: 204 });
    });
    await page.goto("/work.html");
    await row(page, "beta").click({ position: { x: 5, y: 5 } });
    const panel = page.getByRole("dialog", { name: "beta details" });
    await showTerminal(panel);
    await expect(screen(page)).toContainText("attached abcd1234");
    await panel.getByRole("button", { name: "Close session" }).click();
    // the client exits 0 (the fake quits on "quit"), as it does when its session is stopped
    await page.locator(".xterm-helper-textarea").focus();
    await page.keyboard.insertText("quit");
    await expect(panel.locator(".xterm")).toHaveCount(0);
    await expect(panel).not.toContainText("Detached");
    release();
    await expect(panel).toHaveCount(0);
  });

  test("after_a_detach_the_keyboard_moves_to_show_terminal_not_the_page_body", async ({ page }) => {
    // Catches focus dropping to <body> when the terminal that held it goes.
    fake.list([bg()]);
    fake.exitAttach({ code: 0, line: "Detached." });
    await page.goto("/work.html");
    await row(page, "beta").click({ position: { x: 5, y: 5 } });
    const panel = page.getByRole("dialog", { name: "beta details" });
    await showTerminal(panel);
    await expect(panel).toContainText("Detached; the session keeps running.");
    await expect(panel.getByRole("button", { name: "Show terminal" })).toBeFocused();
  });
});
