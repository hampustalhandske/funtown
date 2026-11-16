import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

const INSTALL = resolve(import.meta.dirname, "../hooks/install.ts");
const LETTER = resolve(import.meta.dirname, "../hooks/letter.md");
const EVENTS = [
  "SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse",
  "PermissionRequest", "Notification", "Stop", "SubagentStart", "SubagentStop", "StopFailure",
];

const mine = { matcher: "Bash", hooks: [{ type: "command", command: "echo mine-pre", timeout: 9 }] };
const mine2 = { hooks: [{ type: "command", command: "echo mine-stop" }] };
const original = {
  model: "demo-model",
  permissions: { allow: ["Read"] },
  hooks: {
    PreToolUse: [mine],
    Stop: [mine2],
    PreCompact: [{ hooks: [{ type: "command", command: "echo compact" }] }],
  },
};

function setup(start: unknown = original) {
  const dir = mkdtempSync(join(tmpdir(), "funtown-settings-"));
  const path = join(dir, "settings.json");
  const state = join(dir, "installed.json");
  writeFileSync(path, JSON.stringify(start, null, 2));
  const run = (cmd: "install" | "uninstall") => {
    const r = spawnSync("node", [INSTALL, cmd, "--settings", path], {
      encoding: "utf8",
      env: { ...process.env, FUNTOWN_STATE: state },
    });
    expect(r.status, r.stderr).toBe(0);
    return JSON.parse(readFileSync(path, "utf8"));
  };
  return { run };
}

const funtownEntries = (list: unknown[]) => list.filter((e) => JSON.stringify(e).includes("funtown-hook.ts"));

it("install_adds_one_2s_command_hook_per_event_and_keeps_every_other_entry_in_place", () => {
  const after = setup().run("install");
  expect(after.model).toBe(original.model);
  expect(after.permissions).toEqual(original.permissions);
  for (const name of EVENTS) {
    const ours = funtownEntries(after.hooks[name]) as { hooks: { type: string; timeout: number }[] }[];
    expect(ours, name).toHaveLength(1);
    expect(ours[0].hooks[0]).toMatchObject({ type: "command", timeout: 2 });
  }
  expect(after.hooks.PreToolUse[0]).toEqual(mine);
  expect(after.hooks.Stop[0]).toEqual(mine2);
  expect(after.hooks.PreCompact).toEqual(original.hooks.PreCompact);
});

it("install_marks_every_funtown_hook_async_so_it_never_holds_up_claude", () => {
  const after = setup().run("install");
  for (const name of EVENTS) {
    const ours = funtownEntries(after.hooks[name]) as { hooks: { async?: boolean }[] }[];
    expect(ours[0].hooks[0].async, name).toBe(true);
  }
});

it("install_twice_does_not_duplicate_entries", () => {
  const s = setup();
  s.run("install");
  const again = s.run("install");
  for (const name of EVENTS) expect(funtownEntries(again.hooks[name]), name).toHaveLength(1);
});

it("uninstall_after_install_restores_the_original_settings_exactly", () => {
  const s = setup();
  s.run("install");
  expect(s.run("uninstall")).toEqual(original);
});

it("install_twice_then_uninstall_still_restores_the_original_settings", () => {
  const s = setup();
  s.run("install");
  s.run("install");
  expect(s.run("uninstall")).toEqual(original);
});

it("uninstall_keeps_the_users_own_empty_event_list", () => {
  const start = { hooks: { Stop: [] as unknown[], PreCompact: [mine2] } };
  const s = setup(start);
  s.run("install");
  expect(s.run("uninstall")).toEqual(start);
});

it("uninstall_keeps_the_users_own_empty_hooks_object", () => {
  const start = { model: "demo-model", hooks: {} };
  const s = setup(start);
  s.run("install");
  expect(s.run("uninstall")).toEqual(start);
});

it("uninstall_strips_a_session_end_entry_an_earlier_install_left", () => {
  const old = { hooks: [{ type: "command", command: "node /x/hooks/funtown-hook.ts", timeout: 2 }] };
  const theirs = { hooks: [{ type: "command", command: "echo mine-end" }] };
  const s = setup({ hooks: { SessionEnd: [theirs, old] } });
  const after = s.run("uninstall");
  expect(after.hooks.SessionEnd).toEqual([theirs]);
});

it("a_misspelled_settings_flag_exits_non_zero_and_writes_no_file", () => {
  const root = mkdtempSync(join(tmpdir(), "funtown-args-"));
  const home = join(root, "home");
  const target = join(root, "settings.json");
  mkdirSync(home);
  const r = spawnSync("node", [INSTALL, "install", "--setings", target], {
    encoding: "utf8",
    env: { ...process.env, HOME: home, USERPROFILE: home, FUNTOWN_STATE: join(root, "installed.json") },
  });
  expect(r.status).not.toBe(0);
  expect(readdirSync(root).sort()).toEqual(["home"]);
  expect(readdirSync(home)).toEqual([]);
  rmSync(root, { recursive: true, force: true });
});

it("install_adds_the_two_hold_entries_without_async_and_uninstall_leaves_none", () => {
  const s = setup();
  const after = s.run("install");
  const holds = (name: string) =>
    (after.hooks[name] as { matcher?: string; hooks: { type: string; command: string; timeout: number; async?: boolean }[] }[]).filter(
      (e) => JSON.stringify(e).includes("funtown-hold.ts"),
    );
  const [perm, ...permMore] = holds("PermissionRequest");
  expect(permMore).toEqual([]);
  expect(perm.matcher).toBeUndefined();
  expect(perm.hooks).toHaveLength(1);
  expect(perm.hooks[0]).toMatchObject({ type: "command", timeout: 7200 });
  expect(perm.hooks[0].command).toMatch(/^node ".*\/hooks\/funtown-hold\.ts"$/);
  expect(perm.hooks[0].async).toBeUndefined();

  const [ask, ...askMore] = holds("PreToolUse");
  expect(askMore).toEqual([]);
  expect(ask.matcher).toBe("AskUserQuestion|ExitPlanMode");
  expect(ask.hooks[0]).toMatchObject({ type: "command", timeout: 7200 });
  expect(ask.hooks[0].async).toBeUndefined();

  s.run("install");
  expect(JSON.stringify(s.run("uninstall"))).not.toContain("funtown-hold");
});

it("install_without_settings_flag_writes_into_CLAUDE_CONFIG_DIR_when_it_is_set", () => {
  // Catches hooks landing in ~/.claude/settings.json, which a Claude Code using CLAUDE_CONFIG_DIR never reads.
  const dir = mkdtempSync(join(tmpdir(), "funtown-config-"));
  const r = spawnSync("node", [INSTALL, "install"], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_CONFIG_DIR: dir, FUNTOWN_STATE: join(dir, "installed.json") },
  });
  expect(r.status, r.stderr).toBe(0);
  const after = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
  for (const name of EVENTS) expect(funtownEntries(after.hooks[name]), name).toHaveLength(1);
  rmSync(dir, { recursive: true });
});

type Entry = { matcher?: string; hooks: { type: string; command: string; async?: boolean }[] };
const letterEntries = (s: { hooks?: Record<string, Entry[]> }) =>
  (s.hooks?.SessionStart ?? []).filter((e) => e.hooks.some((h) => h.command.includes("letter.md")));

/**
 * What the installed SessionStart letter command prints, run the way Claude runs it, in a fresh HOME that
 * holds `.funtown/letter.md` with `override` when one is given.
 */
function printed(override?: string): string {
  const home = mkdtempSync(join(tmpdir(), "funtown-home-"));
  try {
    if (override !== undefined) {
      mkdirSync(join(home, ".funtown"));
      writeFileSync(join(home, ".funtown", "letter.md"), override);
    }
    const [entry] = letterEntries(setup({}).run("install"));
    const r = spawnSync("sh", ["-c", entry.hooks[0].command], { encoding: "utf8", env: { ...process.env, HOME: home }, cwd: home });
    expect(r.status, r.stderr).toBe(0);
    return r.stdout;
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

it("install_adds_one_sync_session_start_letter_entry_for_startup_clear_compact_and_uninstall_removes_it", () => {
  const s = setup({});
  s.run("install");
  const ours = letterEntries(s.run("install"));
  expect(ours).toHaveLength(1);
  expect(ours[0].matcher).toBe("startup|clear|compact");
  expect(ours[0].hooks).toHaveLength(1);
  expect(ours[0].hooks[0].type).toBe("command");
  expect(ours[0].hooks[0].async).toBeUndefined();
  expect(letterEntries(s.run("uninstall"))).toEqual([]);
});

it("the_letter_command_prints_the_repo_file_when_the_user_has_no_override", () => {
  expect(printed()).toBe(readFileSync(LETTER, "utf8"));
});

it("the_letter_command_prints_the_users_override_instead_of_the_repo_file", () => {
  expect(printed("My own shape.\n")).toBe("My own shape.\n");
});

it("an_empty_override_is_the_off_switch_and_prints_nothing", () => {
  expect(printed("")).toBe("");
});

it("the_repo_letter_file_exists_is_not_empty_and_fits_session_start_contexts_10000_character_cap", () => {
  const text = readFileSync(LETTER, "utf8");
  expect(text.trim().length).toBeGreaterThan(0);
  expect(text.length).toBeLessThan(10_000);
});
