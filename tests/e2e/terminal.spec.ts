import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_FAKE_DIR, E2E_URL, FakeClaude, listed, listedBg } from "../fake-claude.ts";
import { addProjectFolder, fontOf, removeProjectFolder, scrollsBack, showTerminal, sizeShown, stubStream } from "./stream.ts";

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
/** Whether process `pid` still runs. */
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
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
    fake.linksAttach().list([bg()]);
    await page.addInitScript(() => {
      const w = window as unknown as { opened: string[] };
      w.opened = [];
      window.open = (url) => (w.opened.push(String(url)), null);
    });
    await page.goto("/work.html");
    await row(page, "beta").click({ position: { x: 5, y: 5 } });
    await showTerminal(page.getByRole("dialog"));
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
    fake.modesAttach(modes).list([bg()]);
    await page.goto("/work.html");
    await row(page, "beta").click({ position: { x: 5, y: 5 } });
    await showTerminal(page.getByRole("dialog"));
    await expect(screen(page)).toContainText("attached abcd1234");
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
  // Catches the terminal or the reply box going back to a lazy import: the click would wait on a download.
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

test.describe("the terminal sheet at 1280 x 800", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  /** Opens beta's panel and shows its terminal; gives the panel. */
  async function openSheet(page: Page) {
    fake.list([bg()]);
    await page.goto("/work.html");
    await row(page, "beta").click({ position: { x: 5, y: 5 } });
    const panel = page.getByRole("dialog");
    await showTerminal(panel);
    await expect(screen(page)).toContainText("attached abcd1234");
    return panel;
  }

  test("the_shown_terminal_is_at_least_100_by_40_with_the_header_still_visible", async ({ page }) => {
    // Catches the wide panel coming back: 95 x 25 and a panel that runs off the window.
    const panel = await openSheet(page);
    const size = await sizeShown(screen(page));
    expect(size!.cols).toBeGreaterThanOrEqual(100);
    expect(size!.rows).toBeGreaterThanOrEqual(40);
    console.log(`work view terminal: ${size!.cols}x${size!.rows}`);
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

  test("a_card_shows_in_the_column_and_takes_no_rows_from_the_terminal", async ({ page }) => {
    // Catches a card stacked above the terminal, as in the wide panel, which cost it eight rows.
    fake.list([bg()]);
    const state = (cards: unknown[]) => ({
      claude: { version: "2.1.325", problems: [] },
      cards,
      houses: [
        { project, cwd, leads: [{ id: sid, name: "beta", stage: "working", activity: null, step: null, tty: null, termProgram: null, kind: "background", shortId: sid.slice(0, 8), subagents: [] }] },
      ],
    });
    const card = { id: "c1", lead: sid, agent: null, kind: "permission", tool: "Bash", input: { command: "rm -rf build" }, cwd, at: 1 };
    const stream = await stubStream(page, state([]));
    await page.goto("/work.html");
    await row(page, "beta").click({ position: { x: 5, y: 5 } });
    const panel = page.getByRole("dialog");
    await showTerminal(panel);
    await expect(screen(page)).toContainText("attached abcd1234");
    const terminal = panel.getByLabel("Session terminal");
    const before = (await terminal.boundingBox())!;
    const size = (await sizeShown(screen(page)))!;
    stream.send(state([card]));
    await expect(panel.getByRole("button", { name: "Allow" })).toBeVisible({ timeout: 10_000 });
    expect(await terminal.boundingBox()).toEqual(before);
    expect((await panel.getByRole("button", { name: "Allow" }).boundingBox())!.x).toBeLessThan(before.x);
    expect(await sizeShown(screen(page))).toEqual(size);
  });
});

test.describe("early attach", () => {
  const short = sid.slice(0, 8);
  /** The `claude attach` clients started for beta since `before` (the fake's pid file outlives a test). */
  const since = (before: number) => fake.attachPids(short).slice(before);
  /** Loads the work view with the page's clock paused, so the panel's 300 ms only passes on `clock.runFor`. */
  async function pausedPage(page: Page, sessions = [bg()]) {
    fake.list(sessions);
    await page.clock.install();
    await page.goto("/work.html");
    await expect(row(page, "beta")).toBeVisible();
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  }

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
      const w = window as unknown as { inTerminal: number };
      w.inTerminal = 0;
      document.addEventListener("focusin", (e) => (e.target as Element).closest?.(".screen") && w.inTerminal++, true);
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
    // the reply box took some of the typing; send nothing, and the session must have had no byte
    expect(fake.attachInput(short).slice(typed)).toBe("");
    await showTerminal(page.getByRole("dialog"));
    await expect(page.locator(".xterm-helper-textarea")).toBeFocused();
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
