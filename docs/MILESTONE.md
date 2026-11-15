# Milestone 3: panel-jump

Serves: charter items 4 (clicking a character opens a panel with its current step and its
subagents with status) and 5 (a button in that panel focuses the session's exact tab in
macOS Terminal; other terminal apps are just brought to the front).
Estimate: ~250 net production lines of a 400 budget
Mode: with you

## Done when

1. Clicking any lead or subagent opens a panel (`role="dialog"`, `aria-label="<name> details"`)
   showing its name, stage, current step, and "waiting for you: <need>" when it needs you;
   a lead's panel lists each subagent with its stage. The panel follows live updates,
   closes with ✕ or Escape, and closes on its own when the character is removed.
2. A character's `step` is the text of its last `PreToolUse` ("Bash: <command>" or the tool
   name) and stays after `PostToolUse` and `Stop`; the panel shows "nothing yet" when null.
3. A lead's panel, and a subagent's (which jumps to its lead), has a "Go to terminal"
   button that sends `POST /jump`; on a non-204 reply the panel shows the reply's text.
4. `POST /jump` from the page with lead `termProgram: "Apple_Terminal"` and tty `ttys001`
   runs `osascript` with the tty as an argument (never inside the script text) and returns
   204; a known other app (`iTerm.app`, `vscode`, `WarpTerminal`, `ghostty`) runs
   `open -a <App>`; Apple_Terminal without a valid tty runs `open -a Terminal`.
5. `POST /jump` without an `Origin` header, or with one other than the server's own
   (`http://127.0.0.1:<port>` or `http://localhost:<port>`), returns 403 and runs nothing.
6. Unknown lead → 404; a terminal Funtown doesn't know → 409 with
   `Funtown doesn't know how to open this session's terminal.`; a failing command → 500
   with `Couldn't open the terminal.` and the error logged to stderr.
7. By hand (you): in a real macOS Terminal session, the button brings that exact tab to the
   front. macOS asks once for Automation permission for Terminal.
8. The test command passes.

## Must not

- Add a dependency, service or paid API without asking.
- Change `/events`, the hook, the installer, or the Town shapes beyond adding `step`.
- Run any command in a test: tests inject `run`.
- Interpolate the tty or any request field into a script or shell string.
- Listen on anything but 127.0.0.1.

## Contracts

### Town state: `step`

Produced by task 1, consumed by tasks 2 and 3. `server/types.ts`:

```ts
export type Character = {
  id: string;
  name: string;
  stage: Stage;
  activity: string | null; // what runs now; null between tools
  step: string | null;     // last PreToolUse text; null until the first tool call
  needs?: string;
};
```

Set on every `PreToolUse` (lead or subagent), never cleared by later events.

### POST /jump

Produced by task 1, consumed by tasks 2 and 3.

```
POST /jump
Origin: http://127.0.0.1:<port>          (or http://localhost:<port>)
content-type: application/json
{ "lead": "<session id>" }

204                                       command ran and exited 0
400                                       body not JSON or no string "lead"
403                                       Origin missing or not the server's own
404                                       no such lead
409 text/plain  Funtown doesn't know how to open this session's terminal.
500 text/plain  Couldn't open the terminal.
```

### startServer

```ts
startServer(opts: {
  port: number;
  goneAfterMs?: number;
  distDir?: string;
  run?: (file: string, args: string[]) => Promise<void>; // default: execFile, 60 s timeout;
                                                         // rejects on non-zero exit
}): Promise<{ url: string; close(): Promise<void> }>
```

Commands `/jump` passes to `run`:
- Apple_Terminal, tty matching `/^ttys\d+$/`: `run("osascript", ["-e", <fixed script>, "ttys001"])`;
  the script reads the tty from `argv`, selects the Terminal tab whose tty is
  `/dev/<tty>`, restores and raises its window and activates Terminal; when no tab matches it only
  activates Terminal.
- Apple_Terminal otherwise: `run("open", ["-a", "Terminal"])`.
- `iTerm.app` → `iTerm`, `vscode` → `Visual Studio Code`, `WarpTerminal` → `Warp`,
  `ghostty` → `Ghostty`: `run("open", ["-a", <App>])`.
- Anything else, or null: 409, nothing run.

## Tasks

| # | Owner | Owned paths | Does | Done when |
|---|---|---|---|---|
| 1 | api | `server/` | `step` in the reducer; `POST /jump` with the Origin check, lead lookup, command choice and injectable `run` | Done when 2, 4, 5, 6 hold |
| 2 | ui | `web/` | Clickable characters, the details panel with live updates and Escape/✕, the "Go to terminal" button and its error text | Done when 1 and 3 hold |
| 3 | tests | `tests/` | Tests at the seams below | They run, and fail only where code is missing |

## Test seams

- `POST /events` → `GET /stream`: catches `step` lost after `PostToolUse` or `Stop`, or not
  set for a subagent.
- `POST /jump` with a recording `run`: catches the wrong command or arguments per terminal,
  the tty spliced into the script, a cross-origin or Origin-less request that runs
  something, and wrong status codes for unknown lead, unknown terminal and a failing `run`.
- Playwright on the page with a routed `/stream` and `/jump`: catches a character that
  doesn't open its panel, a panel missing step or subagents, Escape not closing it, the
  button posting the wrong lead (a subagent must send its lead's id), and a 409 text not shown.

## Review fixes

Added after review, on the user's word: every finding that holds is applied in this PR.

| # | Where | Fix | Test |
|---|---|---|---|
| R1 | `server/app.ts` run timeout | 60 s instead of 5 s, so macOS's one-time permission prompt can be answered | none (timing) |
| R2 | `server/app.ts` tab script | Skip windows whose tabs can't be read, restore a minimized window, and only activate Terminal when no tab matches (no error) | by hand: minimized window jumps |
| R3 | `tests/e2e/panel.spec.ts` | Second stream frame changes the step: panel shows it; third frame drops the character: panel closes | itself |
| R4 | `web/src/App.tsx` selection | Clear the selected id when its character is no longer in the Town | e2e: character returns after removal, no panel |
| R5 | `web/src/App.tsx` CharacterRow | No `<div>` inside the character `<button>`: use `<span>`s styled as blocks | none |
| R6 | `tests/helpers.ts` | One `start(opts)` with its close-all `afterEach`, used by `server.test.ts` and `jump.test.ts` | n/a |
| R7 | `tests/jump.test.ts` | One known-app case instead of looping all four; keep Apple_Terminal with and without tty and the unknown app | itself |
| R8 | `web/src/App.tsx` | Drop the comment that restates the close-on-removal condition | n/a |
| R9 | `web/src/App.tsx` Panel | Stable `onClose` (useCallback), so the Escape listener isn't re-added on every state frame | none |
| R10 | `web/src/App.tsx` Panel | "Go to terminal" is disabled while a jump is in flight | e2e: second click while pending posts once |
| R11 | `server/app.ts` /jump | Body over 64 KB → 413, nothing run | 70 KB body is 413 |
| R12 | `web/src/App.tsx` selection | Selection is `{ lead, id }`, so equal subagent ids under two leads open the right panel | e2e: same subagent id under two leads |
| R13 | `tests/e2e/panel.spec.ts` | Subagent stage asserted as exact text on the Subagents list | itself |
| R14 | `server/app.ts`, `tests/jump.test.ts` | `promisify(execFile)` for the default run; one 400 branch; drop the extra `process.stderr.write` spy | n/a |

## Stop and ask

Every agent stops and reports BLOCKED when:
- a contract needs to change;
- the code or the cause doesn't match this plan;
- the budget checkpoint fires;
- a "Done when" can't be met as written.

## Queue

- m4-rebuild: ~200, after m3: on start, rebuild already-running sessions from the
  transcripts in `~/.claude/projects/`.
