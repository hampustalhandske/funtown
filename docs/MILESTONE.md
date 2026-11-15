# Milestone 4: rebuild

Serves: charter constraint "on start, Funtown rebuilds already-running sessions from the
transcripts in `~/.claude/projects/`", so items 1–5 hold for sessions that started before
Funtown did.
Estimate: ~130 net production lines of a 400 budget
Mode: with you

## Done when

1. Started with a Claude folder holding two live sessions in two projects (one `busy`, one
   `idle`) and one whose pid is dead, the first `/stream` frame shows two houses named by
   folder, leads numbered `lead-1`, `lead-2` per house in `startedAt` order, the `idle` one
   `needs_you` with need `turn ended`, the `busy` one `working`, and no character for the dead one.
2. A rebuilt character's `step` is its transcript's last `tool_use` ("Bash: <command>" or the
   tool name), `null` when it has none; its `activity` is `null`.
3. A rebuilt lead lists its subagents from `subagents/agent-<id>.meta.json`: named
   `<agentType>-<n>`, `done` when `finished` is true, `working` otherwise, with the step
   from that subagent's own transcript.
4. A rebuilt lead has the `tty` and `termProgram` that `ps` reports for its pid, so
   `POST /jump` for a rebuilt Apple_Terminal lead runs `osascript` with that tty.
5. A hook event that arrives after start for a rebuilt session updates that same lead:
   same id and name, no second character.
6. No Claude folder, or no `sessions/` in it, gives an empty Town and the server starts.
   A transcript line that isn't JSON (a half-written last line) is skipped.
7. No test reads the real home folder: `startServer` rebuilds only when given `claudeDir`,
   and Playwright's server gets `FUNTOWN_CLAUDE_DIR` pointing at an empty test folder.
8. By hand (you): with two or more `claude` sessions open, restart `npm start`. Each shows
   at its house within 5 s with the right stage, and "Go to terminal" works on a rebuilt
   waiting session in macOS Terminal.
9. The test command passes.

## Must not

- Add a dependency, service or paid API without asking.
- Change `/events`, `/jump`, the hook, the installer, the page, or the Town shapes.
- Write to the Claude folder, or read anything in it besides `sessions/*.json` and
  `projects/*/<sessionId>.jsonl` and `projects/*/<sessionId>/subagents/agent-*`.
- Run any command in a test: tests inject `exec`.
- Listen on anything but 127.0.0.1.

## Contracts

### startServer

Produced by task 1, consumed by task 2. Adds two options; the rest is unchanged.

```ts
startServer(opts: {
  port: number;
  goneAfterMs?: number;
  distDir?: string;
  run?: (file: string, args: string[]) => Promise<void>;
  claudeDir?: string;                                         // rebuild from here before listening;
                                                              // absent: no rebuild
  exec?: (file: string, args: string[]) => Promise<string>;   // stdout; default: execFile, 5 s timeout
}): Promise<{ url: string; close(): Promise<void> }>
```

`server/main.ts` passes `claudeDir: process.env.FUNTOWN_CLAUDE_DIR ?? ~/.claude`.

### What the rebuild reads

```
<claudeDir>/sessions/<pid>.json
  { "pid": 123, "sessionId": "s1", "cwd": "/x/alpha", "startedAt": 1700000000000,
    "status": "idle" | "busy" | <other>, ...more keys, ignored }
  live when process.kill(pid, 0) doesn't throw ESRCH

<claudeDir>/projects/<any>/<sessionId>.jsonl          lead transcript, found by file name
  one JSON object per line; the last line with
  { "type": "assistant", "message": { "content": [ { "type": "tool_use", "name": "Bash",
      "input": { "command": "npm test" } } ] } }
  gives the step

<claudeDir>/projects/<any>/<sessionId>/subagents/agent-<agentId>.meta.json
  { "agentType": "implementer", "finished": false, ...more keys, ignored }
<claudeDir>/projects/<any>/<sessionId>/subagents/agent-<agentId>.jsonl
  same line shape as the lead's; the first line's "timestamp" orders the subagents
```

`exec("ps", ["-wwE", "-o", "tty=,command=", "-p", "<pid>"])` returns one line such as
`ttys004  claude --resume TERM_PROGRAM=Apple_Terminal SHELL=/bin/zsh`. The first word is the
tty (`??` means none); `TERM_PROGRAM=<value>` gives `termProgram`; either may be absent (null).

Stage: `status` `"idle"` → `needs_you` with need `turn ended`; anything else → `working`.
The rebuild feeds `TownState.apply` the same events the hook would send, so the reducer
stays the one place that builds characters.

## Tasks

| # | Owner | Owned paths | Does | Done when |
|---|---|---|---|---|
| 1 | api | `server/` | `server/rebuild.ts` reads the Claude folder and `ps`, and applies the events before the server listens; `claudeDir` and `exec` in `startServer`; `FUNTOWN_CLAUDE_DIR` in `main.ts` | Done when 1–7 hold |
| 2 | tests | `tests/`, `playwright.config.ts` | Tests at the seams below, with fixture Claude folders made in a temp dir; `FUNTOWN_CLAUDE_DIR` for Playwright's server | They run, and fail only where code is missing |

## Test seams

- `startServer({ claudeDir, exec })` → first `/stream` frame: catches a dead pid shown, a
  wrong stage for `idle`/`busy`, lead numbering out of `startedAt` order, a wrong or missing
  step, subagents missing or with the wrong stage, a non-JSON line crashing the rebuild, and
  a missing folder crashing the server.
- `exec` recording + `POST /jump`: catches tty or termProgram not taken from the `ps` line,
  and `??` taken as a tty.
- `POST /events` after a rebuild: catches a second character for a rebuilt session.

## Stop and ask

Every agent stops and reports BLOCKED when:
- a contract needs to change;
- the code or the cause doesn't match this plan;
- the budget checkpoint fires;
- a "Done when" can't be met as written.

## Queue

- None. After m4 every charter item has a milestone; next is the 5-day real-use check.
