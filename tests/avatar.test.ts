import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { errorLines, realDir, start, tokenOf, townWhere } from "./helpers.ts";

const restore: string[] = [];
afterEach(() => {
  for (const d of restore.splice(0)) chmodSync(d, 0o755);
});

/** A server with an avatar file at `path` (a fresh one in a temp folder by default); `send` POSTs a raw body to /avatar with the page's Origin and token unless `headers` replaces them. */
async function avatarServer(path: string | null = join(realDir(), "avatar.json")) {
  const s = await start(path === null ? {} : { avatar: path });
  const token = await tokenOf(s.url);
  const send = async (body: string, headers: Record<string, string> = { origin: s.url, "x-funtown-token": token }) =>
    (await fetch(`${s.url}/avatar`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body })).status;
  const choose = (id: unknown) => send(JSON.stringify({ id }));
  const avatar = async () => (await townWhere(s.url, () => true)).avatar;
  return { ...s, path, token, send, choose, avatar };
}

it("a_chosen_avatar_gets_204_and_the_next_state_carries_its_id_and_the_file_holds_it", async () => {
  const s = await avatarServer();
  expect(await s.avatar()).toBeUndefined();
  expect(await s.choose("baker")).toBe(204);
  expect(await s.avatar()).toBe("baker");
  expect(JSON.parse(readFileSync(s.path!, "utf8"))).toEqual({ id: "baker" });
  expect(await s.choose("sailor-2")).toBe(204);
  expect(await s.avatar()).toBe("sailor-2");
  expect(await s.choose("a".repeat(32))).toBe(204);
  expect(await s.avatar()).toBe("a".repeat(32));
});

it("the_chosen_avatar_survives_a_server_restart", async () => {
  const path = join(realDir(), "avatar.json");
  const first = await avatarServer(path);
  expect(await first.choose("baker")).toBe(204);
  await first.close();
  const second = await avatarServer(path);
  expect(await second.avatar()).toBe("baker");
});

it("an_id_of_the_wrong_shape_gets_400_and_changes_nothing", async () => {
  const s = await avatarServer();
  expect(await s.choose("keep")).toBe(204);
  const bad: [string, string][] = [
    ["empty", JSON.stringify({ id: "" })],
    ["upper case", JSON.stringify({ id: "King" })],
    ["a space", JSON.stringify({ id: "a b" })],
    ["an underscore", JSON.stringify({ id: "a_b" })],
    ["a path", JSON.stringify({ id: "../x" })],
    ["a newline at the end", JSON.stringify({ id: "king\n" })],
    ["33 characters", JSON.stringify({ id: "a".repeat(33) })],
    ["a number", JSON.stringify({ id: 5 })],
    ["no id", "{}"],
    ["an array", "[]"],
    ["not json", "not json {"],
  ];
  for (const [what, body] of bad) expect(await s.send(body), what).toBe(400);
  expect(await s.avatar()).toBe("keep");
  expect(JSON.parse(readFileSync(s.path!, "utf8"))).toEqual({ id: "keep" });
});

it("avatar_without_the_token_or_the_pages_origin_gets_403_and_changes_nothing", async () => {
  const s = await avatarServer();
  const body = JSON.stringify({ id: "baker" });
  expect(await s.send(body, { origin: s.url })).toBe(403);
  expect(await s.send(body, { origin: s.url, "x-funtown-token": "0".repeat(32) })).toBe(403);
  expect(await s.send(body, { "x-funtown-token": s.token })).toBe(403);
  expect(await s.send(body, { origin: "http://evil.example", "x-funtown-token": s.token })).toBe(403);
  expect(await s.avatar()).toBeUndefined();
  expect(existsSync(s.path!)).toBe(false);
});

it("a_choice_that_cannot_be_written_gets_500_and_the_state_keeps_the_old_avatar", async () => {
  const dir = realDir();
  const path = join(dir, "avatar.json");
  writeFileSync(path, JSON.stringify({ id: "baker" }));
  const s = await avatarServer(path);
  expect(await s.avatar()).toBe("baker");
  chmodSync(dir, 0o555);
  restore.push(dir);
  expect(await s.choose("sailor")).toBe(500);
  expect(await s.avatar()).toBe("baker");
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ id: "baker" });
});

it("a_choice_into_a_path_that_is_not_a_folder_gets_500_and_the_state_gets_no_avatar", async () => {
  const dir = realDir();
  writeFileSync(join(dir, "file"), "");
  const s = await avatarServer(join(dir, "file", "avatar.json"));
  expect(await s.choose("sailor")).toBe(500);
  expect(await s.avatar()).toBeUndefined();
});

it("a_server_with_no_avatar_path_answers_500_and_the_state_gets_no_avatar", async () => {
  const s = await avatarServer(null);
  expect(await s.choose("sailor")).toBe(500);
  expect(await s.avatar()).toBeUndefined();
});

it("an_unreadable_or_malformed_avatar_file_gives_no_avatar_and_the_server_keeps_serving_and_saving", async () => {
  for (const content of ["not json {", "[]", "null", JSON.stringify({ id: 5 }), JSON.stringify({}), ""]) {
    const path = join(realDir(), "avatar.json");
    writeFileSync(path, content);
    const s = await avatarServer(path);
    expect(await s.avatar(), JSON.stringify(content)).toBeUndefined();
    expect(await s.choose("baker"), JSON.stringify(content)).toBe(204);
    expect(await s.avatar()).toBe("baker");
  }
  const folder = join(realDir(), "avatar.json");
  mkdirSync(folder);
  const s = await avatarServer(folder);
  expect(await s.avatar()).toBeUndefined();
});

it("an_avatar_file_that_cannot_be_read_or_holds_no_id_leaves_one_log_line_and_a_missing_file_none", async () => {
  const log = join(realDir(), "errors.log");
  const bad = join(realDir(), "avatar.json");
  writeFileSync(bad, "not json {");
  await start({ avatar: bad, errorLog: log });
  const folder = join(realDir(), "avatar.json");
  mkdirSync(folder);
  await start({ avatar: folder, errorLog: log });
  const wrongShape = join(realDir(), "avatar.json");
  writeFileSync(wrongShape, JSON.stringify({ id: "Not Valid" }));
  await start({ avatar: wrongShape, errorLog: log });
  expect(errorLines(log).filter((l) => l.source === "server" && l.step === "avatar")).toHaveLength(3);
  const quiet = join(realDir(), "errors.log");
  await start({ avatar: join(realDir(), "avatar.json"), errorLog: quiet });
  expect(errorLines(quiet).filter((l) => l.step === "avatar")).toEqual([]);
});
