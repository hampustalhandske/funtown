import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const EVENTS = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
  "Notification",
  "Stop",
  "SubagentStart",
  "SubagentStop",
];
const MARKER = "funtown-hook.ts";

type Command = { type?: string; command?: string; timeout?: number };
type Group = { hooks?: Command[] };
type Settings = { hooks?: Record<string, Group[]> };

/** Removes Funtown's hook commands, dropping the groups and events that held only those. */
function strip(settings: Settings): void {
  const hooks = settings.hooks;
  if (!hooks) return;
  for (const [event, groups] of Object.entries(hooks)) {
    const kept: Group[] = [];
    for (const group of groups) {
      const rest = group.hooks?.filter((h) => !h.command?.includes(MARKER));
      if (!group.hooks || !rest || rest.length > 0 || group.hooks.length === 0) {
        kept.push(rest ? { ...group, hooks: rest } : group);
      }
    }
    if (kept.length > 0) hooks[event] = kept;
    else delete hooks[event];
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks;
}

const [action, flag, custom] = process.argv.slice(2);
if (action !== "install" && action !== "uninstall") {
  throw new Error("usage: install.ts install|uninstall [--settings <path>]");
}
const path = flag === "--settings" ? custom : join(homedir(), ".claude", "settings.json");
if (!path) throw new Error("--settings needs a path");

const settings: Settings = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
strip(settings);
if (action === "install") {
  const command = `node "${join(import.meta.dirname, MARKER)}"`;
  settings.hooks ??= {};
  for (const event of EVENTS) {
    (settings.hooks[event] ??= []).push({ hooks: [{ type: "command", command, timeout: 2 }] });
  }
}
if (action === "install" || existsSync(path)) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
}
