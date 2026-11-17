import { expect, type Page } from "@playwright/test";
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
