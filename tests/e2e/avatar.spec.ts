import { expect, test, type Page, type Request } from "@playwright/test";
import { stubStream } from "./stream.ts";

const claude = { version: "2.1.325", problems: [] };
const state = (avatar?: string) => ({
  claude,
  cards: [],
  ...(avatar === undefined ? {} : { avatar }),
  houses: [{ project: "demo-app", cwd: "/work/demo-app", added: true, leads: [], parcels: [] }],
});

/** Opens the town's Settings pane on a stubbed stream and returns the avatar row's buttons and the stream. */
async function openSettings(page: Page, avatar?: string) {
  const stream = await stubStream(page, state(avatar));
  await page.route("**/letters?*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.getByRole("button", { name: /^settings$/i }).click();
  const pane = page.getByRole("dialog", { name: "Settings" });
  // The row's buttons are the pane's pressed-state buttons with a tooltip; "Mute" has none.
  const swatches = pane.locator("button[aria-pressed][title]");
  await expect(swatches).toHaveCount(8);
  return { stream, pane, swatches };
}

/** The `id` of each POST /avatar the page makes, answered with `status` and `body`. */
async function stubAvatar(page: Page, status: number, body = "") {
  const posted: { id: unknown; token: string | undefined; origin: string | undefined }[] = [];
  await page.route("**/avatar", (r) => {
    const req: Request = r.request();
    posted.push({ id: req.postDataJSON()?.id, token: req.headers()["x-funtown-token"], origin: req.headers()["origin"] });
    return r.fulfill({ status, contentType: "text/plain", body });
  });
  return posted;
}

test("the_avatar_row_is_eight_named_unique_word_free_buttons_with_one_pressed", async ({ page }) => {
  const { swatches } = await openSettings(page);
  const names: string[] = [];
  for (let i = 0; i < 8; i++) {
    const button = swatches.nth(i);
    const name = (await button.getAttribute("aria-label")) ?? "";
    expect(name.trim(), `button ${i}`).not.toBe("");
    await expect(button).toHaveAttribute("title", name);
    await expect(button).toHaveText("");
    names.push(name);
  }
  expect(new Set(names).size).toBe(8);
  await expect(swatches.and(page.locator('[aria-pressed="true"]'))).toHaveCount(1);
});

for (const [when, avatar] of [["no_choice", undefined], ["an_unknown_id", "no-such-avatar"]] as const) {
  test(`with_${when}_the_first_preset_the_default_king_is_the_one_pressed`, async ({ page }) => {
    const { swatches } = await openSettings(page, avatar);
    await expect(swatches.first()).toHaveAttribute("aria-pressed", "true");
    await expect(swatches.and(page.locator('[aria-pressed="true"]'))).toHaveCount(1);
  });
}

test("pressing_a_preset_posts_its_id_to_avatar_with_the_pages_token_and_the_pressed_state_follows_the_state_frame", async ({ page }) => {
  const posted = await stubAvatar(page, 204);
  const { stream, swatches } = await openSettings(page);
  await swatches.nth(2).click();
  await expect.poll(() => posted.length).toBe(1);
  const [{ id, token }] = posted;
  expect(id).toMatch(/^[a-z0-9-]{1,32}$/);
  expect(id).not.toBe("king");
  expect(token).toMatch(/^[0-9a-f]+$/);

  // The pressed state is the server's: a State frame carrying the id moves it, and the stub has sent none yet.
  await expect(swatches.first()).toHaveAttribute("aria-pressed", "true");
  stream.send(state(String(id)));
  await expect(swatches.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(swatches.first()).toHaveAttribute("aria-pressed", "false");
  await expect(swatches.and(page.locator('[aria-pressed="true"]'))).toHaveCount(1);
});

test("a_failed_save_shows_the_servers_message_in_an_alert_and_the_pressed_state_does_not_move", async ({ page }) => {
  await stubAvatar(page, 500, "avatar file not writable");
  const { pane, swatches } = await openSettings(page);
  await expect(pane.getByRole("alert")).toHaveCount(0);
  await swatches.nth(3).click();
  await expect(pane.getByRole("alert")).toContainText("avatar file not writable");
  await expect(swatches.first()).toHaveAttribute("aria-pressed", "true");
  await expect(swatches.nth(3)).toHaveAttribute("aria-pressed", "false");
});
