import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

const INSTALL = resolve(import.meta.dirname, "../hooks/install.ts");
const REPO_LETTER = resolve(import.meta.dirname, "../hooks/letter.md");

type Entry = { matcher?: string; hooks: { type: string; command: string; async?: boolean }[] };

let root = "";
let home = "";
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "funtown-letter-"));
  home = join(root, "home");
  mkdirSync(home);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const settingsPath = () => join(root, "settings.json");
function run(cmd: "install" | "uninstall") {
  const r = spawnSync("node", [INSTALL, cmd, "--settings", settingsPath()], {
    encoding: "utf8",
    env: { ...process.env, HOME: home, USERPROFILE: home, FUNTOWN_STATE: join(root, "installed.json") },
  });
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(readFileSync(settingsPath(), "utf8")) as { hooks?: Record<string, Entry[]> };
}
const letterEntries = (s: { hooks?: Record<string, Entry[]> }) =>
  (s.hooks?.SessionStart ?? []).filter((e) => e.hooks.some((h) => h.command.includes("letter.md")));

/** What the installed SessionStart letter command prints, run the way Claude runs it, with HOME = the temp home. */
function printed(): string {
  const [entry] = letterEntries(run("install"));
  const r = spawnSync("sh", ["-c", entry.hooks[0].command], { encoding: "utf8", env: { ...process.env, HOME: home }, cwd: root });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout;
}

it("install_adds_one_sync_session_start_letter_entry_for_startup_clear_compact_and_uninstall_removes_it", () => {
  writeFileSync(settingsPath(), "{}");
  run("install");
  const twice = run("install");
  const ours = letterEntries(twice);
  expect(ours).toHaveLength(1);
  expect(ours[0].matcher).toBe("startup|clear|compact");
  expect(ours[0].hooks).toHaveLength(1);
  expect(ours[0].hooks[0].type).toBe("command");
  expect(ours[0].hooks[0].async).toBeUndefined();
  expect(letterEntries(run("uninstall"))).toEqual([]);
});

it("the_repo_letter_file_holds_the_shape_in_at_most_10_lines_for_the_letter", () => {
  const text = readFileSync(REPO_LETTER, "utf8");
  for (const part of ["**Done:**", "**Next:**", "**Needs you:**", "Write nothing after the letter."]) expect(text).toContain(part);
  expect(text).toContain("at most 10 lines");
});

it("the_letter_command_prints_the_repo_file_when_the_user_has_no_override", () => {
  expect(printed()).toBe(readFileSync(REPO_LETTER, "utf8"));
});

it("the_letter_command_prints_the_users_override_instead_of_the_repo_file", () => {
  mkdirSync(join(home, ".funtown"));
  writeFileSync(join(home, ".funtown", "letter.md"), "My own shape.\n");
  expect(printed()).toBe("My own shape.\n");
});

it("an_empty_override_is_the_off_switch_and_prints_nothing", () => {
  mkdirSync(join(home, ".funtown"));
  writeFileSync(join(home, ".funtown", "letter.md"), "");
  expect(printed()).toBe("");
});
