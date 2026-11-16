import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
  "Notification",
  "Stop",
  "StopFailure",
  "SubagentStart",
  "SubagentStop",
];
const MARKER = "funtown-hook.ts";
const HOLD = "funtown-hold.ts";
const LETTER = "funtown-letter";
const MARKERS = [MARKER, HOLD, LETTER];

/** `path` as one single-quoted shell word. */
const shellQuote = (path: string) => `'${path.replaceAll("'", "'\\''")}'`;

type Command = { type?: string; command?: string; timeout?: number; async?: boolean };
type Group = { matcher?: string; hooks?: Command[] };
type Settings = { hooks?: Record<string, Group[]> };

type InstallRecord = { createdHooksKey: boolean; createdEvents: string[] };

/**
 * Removes Funtown's hook commands and the groups that held only those. An event, or the
 * `hooks` key, that ends up empty is deleted only when `created` says install made it.
 */
function strip(settings: Settings, created?: InstallRecord): void {
  const hooks = settings.hooks;
  if (!hooks) return;
  for (const [event, groups] of Object.entries(hooks)) {
    const kept: Group[] = [];
    let touched = false;
    for (const group of groups) {
      const rest = group.hooks?.filter((h) => !MARKERS.some((m) => h.command?.includes(m)));
      if (rest && rest.length !== group.hooks?.length) touched = true;
      if (!group.hooks || !rest || rest.length > 0 || group.hooks.length === 0) {
        kept.push(rest ? { ...group, hooks: rest } : group);
      }
    }
    if (!touched) continue;
    if (kept.length > 0 || !created?.createdEvents.includes(event)) hooks[event] = kept;
    else delete hooks[event];
  }
  if (created?.createdHooksKey && Object.keys(hooks).length === 0) delete settings.hooks;
}

const [action, flag, custom, ...extra] = process.argv.slice(2);
const usage = "usage: install.ts install|uninstall [--settings <path>]";
if (action !== "install" && action !== "uninstall") throw new Error(usage);
if (flag !== undefined && (flag !== "--settings" || !custom || extra.length > 0)) {
  throw new Error(usage);
}
// Claude Code reads its settings from CLAUDE_CONFIG_DIR when set, else ~/.claude.
const path = custom ?? join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "settings.json");

const statePath = process.env.FUNTOWN_STATE ?? join(homedir(), ".funtown", "installed.json");
const state: Partial<Record<string, InstallRecord>> = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, "utf8"))
  : {};
const key = resolve(path);
const previous = state[key];

const settings: Settings = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
strip(settings, previous);
if (action === "install") {
  const command = `node ${shellQuote(join(import.meta.dirname, MARKER))}`;
  const createdHooksKey = settings.hooks === undefined || previous?.createdHooksKey === true;
  settings.hooks ??= {};
  const createdEvents: string[] = [];
  for (const event of EVENTS) {
    if (!(event in settings.hooks) || previous?.createdEvents.includes(event)) {
      createdEvents.push(event);
    }
    (settings.hooks[event] ??= []).push({ hooks: [{ type: "command", command, timeout: 2, async: true }] });
  }
  const hold = { type: "command", command: `node ${shellQuote(join(import.meta.dirname, HOLD))}`, timeout: 7200 };
  settings.hooks.PermissionRequest.push({ hooks: [hold] });
  settings.hooks.PreToolUse.push({ matcher: "AskUserQuestion|ExitPlanMode", hooks: [hold] });
  // Prints the user's own letter file when there is one (empty = off), else the repo's shape.
  const shape = `f="$HOME/.funtown/letter.md"; if [ -e "$f" ]; then cat "$f"; else cat ${shellQuote(join(import.meta.dirname, "letter.md"))}; fi # ${LETTER}`;
  settings.hooks.SessionStart.push({ matcher: "startup|resume|clear|compact", hooks: [{ type: "command", command: shape, timeout: 5 }] });
  state[key] = { createdHooksKey, createdEvents };
} else {
  delete state[key];
}
if (action === "install" || existsSync(path)) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
}
mkdirSync(dirname(statePath), { recursive: true });
writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
