import { expect, type Page } from "@playwright/test";

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
  const res = await fetch(`http://127.0.0.1:${process.env.FUNTOWN_E2E_PORT ?? "4799"}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hook_event_name: name, session_id: sid, cwd, funtown: { tty: null, term_program: null, at }, ...extra }),
  });
  expect(res.status).toBe(204);
}
