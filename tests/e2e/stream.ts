import type { Page } from "@playwright/test";

const sse = (t: unknown) => `retry: 50\nevent: state\ndata: ${JSON.stringify(t)}\n\n`;

/** Serves `initial` as the page's Town stream (re-sent on each quick reconnect); `send` sets the state the next reconnect gets. */
export async function stubStream(page: Page, initial: unknown) {
  let current = initial;
  await page.route("**/stream", (r) =>
    r.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache" }, body: sse(current) }),
  );
  return { send: (t: unknown) => void (current = t) };
}
