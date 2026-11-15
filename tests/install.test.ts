import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

const INSTALL = resolve(import.meta.dirname, "../hooks/install.ts");
const EVENTS = [
  "SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PostToolUse",
  "PermissionRequest", "Notification", "Stop", "SubagentStart", "SubagentStop",
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
