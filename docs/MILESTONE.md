# Milestone 7: terminal room

Serves: charter item 1, "Terminal room": every session in one list; background sessions
open their live terminal in the app through `claude attach`; a session in a Terminal tab
shows a hint to send it there; start a new session in a project. Also the start-up version
check (Constraints) and the rule that sessions come only from `claude agents --json`.
Not here: background runs in worktrees and the shell tab (m11), adding projects (m10).
Estimate: ~320 net production lines of an 800 budget (adds ~550, deletes ~230: rebuild.ts
and the `ps` sweep go)
Mode: with you

## Done when

1. The page shows exactly the sessions `claude agents --json` lists, grouped by project
   (`cwd`), each with its `name`, its kind (terminal or background) and its stage; a
   session that leaves the list leaves the page within 5 s (test with the fake `claude`).
2. Clicking a background session opens its live terminal in the panel. In a real `--bg`
   session (orchestrator, in this repo, stopped and removed after): typed text, Shift+Enter
   (a second input line, nothing sent), `!ls`, `/context` and Esc all work; after closing
   the panel, `claude agents --json` still lists the session.
3. Clicking a terminal (interactive) session shows the hint "press ← or type /bg in its
   terminal to open it here" and the Go to terminal button; no live terminal.
4. "New session" on a project starts `claude --bg` in that project's folder with no
   worktree (`git worktree list` unchanged), and its terminal opens once it is listed.
5. With `claude --version` below 2.1.325 or failing, start prints one line per feature that
   won't work, and the page shows the same list in a banner.
6. Without the page's token, or from another Origin, `POST /jump`, `POST /sessions` and the
   `/term` WebSocket are refused (403); the page is served with the CSP below; `/events`
   reads a multi-byte character split across two chunks intact.
7. `npm run install-hooks` writes `"async": true` on every Funtown entry; in a real
   `claude -p` session with a hook that sleeps 3 s, the run takes no 3 s longer (orchestrator).
8. `npx eslint . && npx vitest run && npx playwright test` passes, and no test runs the
   real `claude`.

## Must not

- Read Claude's folder (`~/.claude/`) in production code: sessions come only from
  `claude agents --json`, terminals only from `claude attach`.
- Run `claude` through a shell or put a session id, cwd or tty into a command string;
  ids and paths go in as arguments.
- Start a session in a folder that isn't a project already on the page.
- Listen anywhere but 127.0.0.1, or change `/events` beyond the decode fix.
- Add a dependency other than node-pty, @xterm/xterm, @xterm/addon-fit and ws (the
  orchestrator installs them before the build), plus @types/ws and a postinstall that
  restores spawn-helper's exec bit (both approved in review).

## Contracts

### The `claude` executable

Produced by task 1 (calls), consumed by task 3 (the fake). The server runs the executable
named by `startServer({ claude })` (default `"claude"`; `main.ts` reads `FUNTOWN_CLAUDE`)
with execFile or node-pty, never a shell, and with every `CLAUDE*` and `AI_AGENT` variable
except `CLAUDE_CONFIG_DIR` removed from the child's environment (exception approved in
review, so a custom config folder still works).

```
<claude> --version                  stdout "2.1.325 (Claude Code)"; minimum 2.1.325
<claude> agents --json              stdout: JSON array, every pollMs (default 2000 ms)
  [{ "sessionId": "2a2362f8-...", "id": "2a2362f8",   // id: background only
     "name": "s3bg", "kind": "interactive" | <other>, // not "interactive" = background
     "pid": 123, "cwd": "/abs/path", "startedAt": 1731670000000,
     "status": "busy" | "idle" | "waiting", "waitingFor": "permission prompt" }]
<claude> --bg --settings '{"worktree":{"bgIsolation":"none"}}'   cwd: the project; stdout
                                    carries the new short id (task 1 checks the format)
<claude> attach <id>                in a pty (xterm-256color, the page's cols and rows)
```

A failed or unparsable `agents --json` keeps the last list and writes one stderr line,
only when the reason differs from the last one written. Unlisted hook data still expires.

### Town state (`server/types.ts`)

Produced by task 1, consumed by tasks 2 and 3.

```ts
export type Lead = Character & {
  tty: string | null; termProgram: string | null; subagents: Character[];
  kind: "terminal" | "background";
  shortId: string | null;            // the `id` `claude attach` takes; null for terminal
};
export type Town = {
  houses: House[];                   // House unchanged: { project, cwd, leads }
  claude: { version: string | null; problems: string[] };  // problems: "won't work" lines
};
```

- A lead is on the page only while the last good list has it. `name` is the list's
  `name` (fallback `lead-<n>`). Hook events still set activity, step, subagents and tty;
  hook data for a session the list doesn't show is dropped after 10 s.
- Stage: each poll sets it from `status`: busy → working, waiting → needs_you with
  `needs` = `waitingFor`, idle → needs_you with `needs` "turn ended" (v1's Stop). Hooks
  change it between polls as today. A lead never shows "gone"; it leaves instead.
- Hooks run async, so events can arrive out of order: an event whose `funtown.at` is
  lower than the last one applied to the same character (lead, or subagent by
  `agent_id`) changes nothing.

### Page endpoints

Produced by task 1, consumed by tasks 2 and 3.

- Token: a random token per server start, injected into the served `index.html` as
  `<meta name="funtown-token" content="<hex>">`.
- `POST /jump { lead }` and `POST /sessions { cwd }` need header `x-funtown-token` and the
  server's own Origin, else 403. `/sessions`: `cwd` must equal a house's `cwd` (else 404);
  reply 201 `{ "id": "<shortId>" }`, 500 with a text reason when `claude --bg` fails.
- WebSocket `GET /term?lead=<sessionId>&token=<hex>&cols=<n>&rows=<n>`: own Origin and
  token, else 403; the lead must be background (else 409). One pty per socket; closing the
  socket kills the pty, the pty's exit closes the socket. Frames are JSON text, max 1 MB:
  page → server `{"t":"in","d":"..."}`, `{"t":"resize","c":80,"r":24}`;
  server → page `{"t":"out","d":"..."}`, `{"t":"shared","n":2}` whenever the number of
  Funtown sockets on that session changes (n ≥ 2 shows a warning).
- HTML responses carry `Content-Security-Policy: default-src 'self'; script-src 'self';
  style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:<port>
  ws://localhost:<port>; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`.

### `startServer` options

Produced by task 1, consumed by task 3.

`startServer({ port, distDir?, run?, claude?, pollMs? })`. `claudeDir`, `exec`, `sweepMs`
and `goneAfterMs` go; `run` stays for osascript and `open`.

## Tasks

| # | Owner | Owned paths | Does | Done when |
|---|---|---|---|---|
| 1 | server | server/, hooks/install.ts | Poll `claude agents --json` into the Town (new `server/agents.ts`), version check, token and CSP, `/sessions`, `/term` over ws + node-pty (new `server/terminal.ts`), Buffer.concat for `/events`, `async: true` in the installer; delete `server/rebuild.ts` and the sweep | The contracts hold; `npx eslint .` clean |
| 2 | ui | web/ | Rows show name, kind, stage; panel holds an xterm.js terminal (fit addon, Shift+Enter sends `\x1b\r`, a warning on `shared` n ≥ 2) for background leads and the hint for terminal leads; "New session" per house; the version banner; the token on every POST and the socket | The contracts hold; `vite build` clean |
| 3 | tests | tests/, playwright.config.ts | A fake `claude` executable (its list read from a file the test writes, `attach` echoing input); replace rebuild and sweep tests; tests at the seams below | They run, and fail only where code is missing |

## Test seams

- Fake `claude agents --json` → `/stream`: catches a listed session missing, one that left
  the list still shown after 5 s, wrong kind or stage, a failed poll emptying the town.
- `/events` → Town: catches hook activity lost on a listed lead, and the split UTF-8 decode.
- `/jump`, `/sessions`, `/term`: catches a missing token or foreign Origin let through, a
  cwd that isn't a house accepted, a terminal lead attached.
- `/term` with the fake `attach`: catches input not reaching the pty, resize ignored, pty
  left running after the socket closes, `shared` not sent.
- Page (Playwright): catches rows without name or kind, the terminal not opening or not
  echoing typed text, Shift+Enter sent as `\r`, the hint missing, New session not opening
  the new session, the version banner missing; served page without the CSP header.
- `install-hooks`: catches an entry without `async: true`.

## Stop and ask

Every agent stops and reports BLOCKED when:
- a contract needs to change;
- the code or the cause doesn't match this plan;
- the budget checkpoint fires;
- a "Done when" can't be met as written.

## Queue

Each needs the one before it merged.

- m8-answer-cards: ~400
- m9-letters: ~400
- m10-workflow: ~400
- m11-runs-shell: ~400
- m12-town-kit: ~400
- m13-village: ~400
- m14-interiors: ~400
- m15-looks: ~400
