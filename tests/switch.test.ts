import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { errorLines, realDir, start, tokenOf, until } from "./helpers.ts";

const linesOf = (path: string) =>
  existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>) : [];

/** A server with `switchLog` and `errorLog`; `send` POSTs a raw body to /switch with the page's Origin and token unless `headers` replaces them. */
async function switchServer(opts: { switchLog?: string; errorLog?: string } = {}) {
  const s = await start(opts);
  const token = await tokenOf(s.url);
  const send = async (body: string, headers: Record<string, string> = { origin: s.url, "x-funtown-token": token }) =>
    (await fetch(`${s.url}/switch`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body })).status;
  return { ...s, token, send };
}

it("each_switch_note_appends_one_line_with_at_the_reason_and_the_open_session_and_leaves_an_empty_reason_out", async () => {
  const path = join(realDir(), "switches.jsonl");
  const s = await switchServer({ switchLog: path });
  const open = { id: "s1", name: "alpha", cwd: "/work/demo-app" };
  const before = Date.now();
  expect(await s.send(JSON.stringify({ reason: "standup", open }))).toBe(204);
  expect(await s.send(JSON.stringify({ reason: "" }))).toBe(204);
  expect(await s.send("{}")).toBe(204);
  const after = Date.now();

  const at = expect.toSatisfy((n: unknown) => typeof n === "number" && n >= before && n <= after);
  expect(linesOf(path)).toEqual([{ at, reason: "standup", open }, { at }, { at }]);
});

it("switch_without_the_token_or_the_pages_origin_gets_403_and_writes_nothing", async () => {
  const path = join(realDir(), "switches.jsonl");
  const s = await switchServer({ switchLog: path });
  const body = JSON.stringify({ reason: "x" });
  expect(await s.send(body, { origin: s.url })).toBe(403);
  expect(await s.send(body, { origin: s.url, "x-funtown-token": "0".repeat(32) })).toBe(403);
  expect(await s.send(body, { "x-funtown-token": s.token })).toBe(403);
  expect(await s.send(body, { origin: "http://evil.example", "x-funtown-token": s.token })).toBe(403);
  expect(linesOf(path)).toEqual([]);
});

it("switch_with_a_body_that_is_not_an_object_a_non_string_reason_or_a_reason_over_1000_characters_gets_400_and_writes_nothing", async () => {
  const path = join(realDir(), "switches.jsonl");
  const s = await switchServer({ switchLog: path });
  for (const body of ["not json {", "[]", "null", '"standup"', JSON.stringify({ reason: 5 }), JSON.stringify({ reason: "x".repeat(1001) })]) {
    expect(await s.send(body), body.slice(0, 40)).toBe(400);
  }
  expect(linesOf(path)).toEqual([]);
  expect(await s.send(JSON.stringify({ reason: "x".repeat(1000) }))).toBe(204);
  expect(linesOf(path)).toHaveLength(1);
});

it("a_switch_note_that_cannot_be_written_gets_500_and_a_server_error_log_line", async () => {
  const dir = realDir();
  const notAFolder = join(dir, "file");
  writeFileSync(notAFolder, "");
  const log = join(dir, "errors.log");
  const s = await switchServer({ switchLog: join(notAFolder, "switches.jsonl"), errorLog: log });
  expect(await s.send(JSON.stringify({ reason: "standup" }))).toBe(500);
  await until(() => errorLines(log).some((l) => l.source === "server"));
});

it("switch_on_a_server_without_a_switch_log_gets_500", async () => {
  const s = await switchServer();
  expect(await s.send(JSON.stringify({ reason: "standup" }))).toBe(500);
});
