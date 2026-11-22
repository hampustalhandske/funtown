import { expect, type Locator, type Page } from "@playwright/test";
import { E2E_URL } from "../fake-claude.ts";

const sse = (t: unknown) => `retry: 50\nevent: state\ndata: ${JSON.stringify(t)}\n\n`;

/** Serves `initial` as the page's Town stream (re-sent on each quick reconnect); `send` sets the state the next reconnect gets. */
export async function stubStream(page: Page, initial: unknown) {
  let current = initial;
  await page.route("**/stream", (r) =>
    r.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache" }, body: sse(current) }),
  );
  return { send: (t: unknown) => void (current = t) };
}

let clock = Date.now();
/** Posts one hook event for `sid` in `cwd` to the e2e server, with a `funtown.at` later than the last one. */
export async function hook(sid: string, cwd: string, name: string, extra: Record<string, unknown> = {}) {
  const at = (clock = Math.max(clock + 1, Date.now()));
  const res = await fetch(`${E2E_URL}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hook_event_name: name, session_id: sid, cwd, funtown: { tty: null, term_program: null, at }, ...extra }),
  });
  expect(res.status).toBe(204);
}

/** The stream state with a working background session `sid` named beta in `cwd` (a folder named `project`), and `cards` waiting. */
export const betaState = (project: string, cwd: string, sid: string, cards: unknown[]) => ({
  claude: { version: "2.1.325", problems: [] },
  cards,
  houses: [
    { project, cwd, leads: [{ id: sid, name: "beta", stage: "working", activity: null, step: null, tty: null, termProgram: null, kind: "background", shortId: sid.slice(0, 8), subagents: [] }] },
  ],
});

/** A question card of `sid`'s, tall enough to fill a column on its own. */
export const questionCard = (sid: string, cwd: string) => ({
  id: "c2", lead: sid, agent: null, kind: "question", tool: "AskUserQuestion", cwd, at: 1,
  input: {
    questions: ["Which database?", "Which cache?", "Which queue?"].map((question) => ({
      question, header: "Q", multiSelect: false, options: ["Postgres", "SQLite", "Redis"].map((label) => ({ label, description: "" })),
    })),
  },
});

/** Runs a page-authenticated POST (the page's token and Origin) against the e2e server. */
async function pagePost(path: string, body: unknown) {
  const html = await (await fetch(`${E2E_URL}/work.html`)).text();
  const token = html.match(/<meta name="funtown-token" content="([^"]+)"/)![1];
  const res = await fetch(`${E2E_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: E2E_URL, "x-funtown-token": token },
    body: JSON.stringify(body),
  });
  expect(res.ok).toBe(true);
}

/** Adds `cwd` as a project, so the e2e server sees the sessions that run in it. */
export const addProjectFolder = (cwd: string) => pagePost("/projects", { cwd });
/** Takes `cwd` off the project list again. */
export const removeProjectFolder = (cwd: string) => pagePost("/projects/remove", { cwd });

/** Presses "Show terminal" in a background lead's panel, which reveals its live terminal (and connects it, if the panel was open under 300 ms). */
export const showTerminal = (panel: Locator) => panel.getByRole("button", { name: /show terminal/i }).click();

/** The text a viewer can see on the page: text nodes of at least 3 px that are not clipped, transparent or hidden. */
export function visibleWords(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const seen: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent?.trim();
      if (!text) continue;
      let hidden = false;
      for (let el = n.parentElement; el && !hidden; el = el.parentElement) {
        const r = el.getBoundingClientRect();
        const css = getComputedStyle(el);
        hidden = css.fontSize === "0px" || /, 0\)$/.test(css.color) || r.width <= 2 || r.height <= 2 || css.visibility === "hidden" || css.display === "none" || css.opacity === "0";
      }
      if (!hidden && !["SCRIPT", "STYLE", "NOSCRIPT"].includes(n.parentElement!.tagName)) seen.push(text);
    }
    return seen;
  });
}

/** The font a terminal draws in, as the page computes it. */
export const fontOf = (root: Locator) =>
  root.locator(".xterm-rows").evaluate((rows) => {
    const style = getComputedStyle(rows);
    return { family: style.fontFamily, size: style.fontSize };
  });

/** Whether the wheel scrolls back: after it turns up over a terminal full of `line-<n>` lines, an earlier line shows. */
export async function scrollsBack(page: Page, root: Locator) {
  const first = async () => {
    const numbers = [...(await root.locator(".xterm-rows").innerText()).matchAll(/line-(\d+)/g)].map((m) => Number(m[1]));
    return Math.min(...numbers);
  };
  const before = await first();
  await root.hover();
  await page.mouse.wheel(0, -2000);
  await page.waitForTimeout(300);
  return (await first()) < before;
}

/** The columns and rows the session's client last printed as `size:<cols>x<rows>` (the fake prints it at start and on every resize). */
export async function sizeShown(screen: Locator) {
  const all = [...(await screen.innerText()).matchAll(/size:(\d+)x(\d+)/g)];
  const last = all[all.length - 1];
  return last ? { cols: Number(last[1]), rows: Number(last[2]), count: all.length } : null;
}
