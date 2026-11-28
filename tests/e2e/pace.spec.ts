import { expect, test, type Page } from "@playwright/test";
import { house, lead, stubStream, town } from "./stream.ts";

/**
 * Counts the town's frames from outside the product: wraps requestAnimationFrame and the GL context's draw calls, and
 * counts each callback (or, outside one, each tick) in which something was drawn. Also lets a test make the page report
 * itself hidden, as a covered window does, with `__hide(true)`.
 */
async function watchFrames(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __frames: number; __hide: (hidden: boolean) => void };
    w.__frames = 0;
    let drew = false;
    let inFrame = false;
    let pending = false;
    // A draw inside a requestAnimationFrame callback belongs to it; one outside counts once per tick.
    const mark = () => {
      if (inFrame) {
        drew = true;
      } else if (!pending) {
        pending = true;
        queueMicrotask(() => {
          pending = false;
          w.__frames++;
        });
      }
    };
    const rAF = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) =>
      rAF((t) => {
        inFrame = true;
        drew = false;
        try {
          cb(t);
        } finally {
          inFrame = false;
          if (drew) w.__frames++;
          drew = false;
        }
      });
    for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"] as const) {
      const real = WebGL2RenderingContext.prototype[name] as (...a: unknown[]) => void;
      (WebGL2RenderingContext.prototype as unknown as Record<string, unknown>)[name] = function (this: WebGL2RenderingContext, ...a: unknown[]) {
        mark();
        return real.apply(this, a);
      };
    }
    let hidden = false;
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    w.__hide = (h) => {
      hidden = h;
      document.dispatchEvent(new Event("visibilitychange"));
    };
  });
}

const frames = (page: Page) => page.evaluate(() => (window as unknown as { __frames: number }).__frames);
const hide = (page: Page, hidden: boolean) => page.evaluate((h) => (window as unknown as { __hide: (h: boolean) => void }).__hide(h), hidden);
/** The frames drawn over the next `ms`. */
async function framesIn(page: Page, ms: number) {
  const before = await frames(page);
  await page.waitForTimeout(ms);
  return (await frames(page)) - before;
}

const calm = () => town([house("alpha", [lead({ id: "s1", name: "lead-1" })])]);

test("no_frames_are_drawn_while_the_page_reports_hidden_and_the_town_draws_and_works_again_when_it_is_visible", async ({ page }) => {
  // Catches a town that keeps drawing under a covered window, and one that stays frozen after the window comes back.
  await watchFrames(page);
  await stubStream(page, calm());
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect.poll(() => frames(page)).toBeGreaterThan(3);

  await hide(page, true);
  // A frame already queued may land; after a moment none follow.
  await page.waitForTimeout(300);
  expect(await framesIn(page, 1500)).toBe(0);

  await hide(page, false);
  await expect.poll(() => framesIn(page, 300)).toBeGreaterThan(0);
  // The town still answers: a click on its house opens the classroom.
  await page.getByRole("button", { name: /^alpha, house/ }).click();
  await expect(page).toHaveURL(/#in=/);
});

test("a_resize_draws_one_frame_even_while_hidden", async ({ page }) => {
  // Catches a canvas left blank by a resize under a hidden window.
  await watchFrames(page);
  await stubStream(page, calm());
  await page.goto("/");
  await expect.poll(() => frames(page)).toBeGreaterThan(3);
  await hide(page, true);
  await page.waitForTimeout(300);
  const before = await frames(page);
  await page.setViewportSize({ width: 900, height: 700 });
  await page.waitForTimeout(600);
  const drawn = (await frames(page)) - before;
  expect(drawn).toBeGreaterThan(0);
  expect(drawn).toBeLessThanOrEqual(3);
  expect(await framesIn(page, 800)).toBe(0);
});

test("no_frames_are_drawn_while_the_page_has_lost_the_server_and_they_come_back_with_it", async ({ page }) => {
  // Catches a town that keeps drawing for a server it cannot hear, and one that stays frozen once the server is back.
  await watchFrames(page);
  const stream = await stubStream(page, calm());
  await page.goto("/");
  await expect.poll(() => frames(page)).toBeGreaterThan(3);

  stream.lose();
  // The page calls the server lost after 3 s without it.
  await expect(page.getByRole("img", { name: /^Can't see/ })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(300);
  expect(await framesIn(page, 1500)).toBe(0);

  stream.send(calm());
  await expect(page.getByRole("img", { name: /^Can't see/ })).toHaveCount(0);
  await expect.poll(() => framesIn(page, 300)).toBeGreaterThan(0);
});
