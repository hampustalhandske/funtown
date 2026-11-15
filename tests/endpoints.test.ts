import { expect, it } from "vitest";
import { leadsOf, listed, realDir, start, tokenOf, townWhere } from "./helpers.ts";

const BG_SETTINGS = '{"worktree":{"bgIsolation":"none"}}';

it("the_served_page_carries_the_exact_csp_and_a_fresh_hex_token_per_server_start", async () => {
  const a = await start();
  const res = await fetch(`${a.url}/`);
  const port = new URL(a.url).port;
  expect(res.headers.get("content-security-policy")).toBe(
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
      `connect-src 'self' ws://127.0.0.1:${port} ws://localhost:${port}; ` +
      "object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
  const token = await tokenOf(a.url);
  expect(token.length).toBeGreaterThanOrEqual(16);
  expect(await tokenOf(a.url)).toBe(token);
  expect(await tokenOf((await start()).url)).not.toBe(token);
});

/** A server listing one interactive session in a real folder `cwd`. */
async function withHouse() {
  const cwd = realDir();
  const s = await start();
  s.fake.list([listed("s1", cwd)]);
  await townWhere(s.url, (t) => leadsOf(t).length === 1);
  const token = await tokenOf(s.url);
  const post = (body: unknown, headers: Record<string, string> = { origin: s.url, "x-funtown-token": token }) =>
    fetch(`${s.url}/sessions`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { ...s, cwd, token, post };
}

it("sessions_without_the_token_or_from_another_origin_gets_403_and_starts_nothing", async () => {
  const s = await withHouse();
  expect((await s.post({ cwd: s.cwd }, { origin: s.url })).status).toBe(403);
  expect((await s.post({ cwd: s.cwd }, { origin: s.url, "x-funtown-token": "0".repeat(32) })).status).toBe(403);
  expect((await s.post({ cwd: s.cwd }, { origin: "http://evil.example", "x-funtown-token": s.token })).status).toBe(403);
  expect((await s.post({ cwd: s.cwd }, { "x-funtown-token": s.token })).status).toBe(403);
  expect(s.fake.started()).toEqual([]);
});

it("sessions_starts_claude_bg_without_a_worktree_in_the_houses_folder_and_replies_201_with_the_id", async () => {
  const s = await withHouse();
  const res = await s.post({ cwd: s.cwd });
  expect(res.status).toBe(201);
  const { id } = (await res.json()) as { id: string };
  expect(id).toMatch(/^[0-9a-f]{8}$/);
  const [call, ...more] = s.fake.started();
  expect(more).toEqual([]);
  expect(call.cwd).toBe(s.cwd);
  expect(call.argv.slice(0, 3)).toEqual(["--bg", "--settings", BG_SETTINGS]);
  const town = await townWhere(s.url, (t) => leadsOf(t).some((l) => l.kind === "background"));
  expect(leadsOf(town).find((l) => l.kind === "background")).toMatchObject({ shortId: id });
});

it("sessions_for_a_cwd_that_is_not_a_house_gets_404_and_starts_nothing", async () => {
  const s = await withHouse();
  expect((await s.post({ cwd: realDir() })).status).toBe(404);
  expect((await s.post({ cwd: `${s.cwd}/` })).status).toBe(404);
  expect(s.fake.started()).toEqual([]);
});

it("sessions_gets_500_with_a_text_reason_when_claude_bg_fails", async () => {
  const s = await withHouse();
  s.fake.failBg();
  const res = await s.post({ cwd: s.cwd });
  expect(res.status).toBe(500);
  expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
  expect((await res.text()).length).toBeGreaterThan(0);
});
