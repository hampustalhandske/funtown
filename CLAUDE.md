# Funtown

Charter: docs/CHARTER.md. Current state: docs/HANDOFF.md. Parked ideas: docs/PARKING.md.

## Map

Parts
- `hooks/funtown-hook.ts`: async command hook on each event; adds tty and `at`, POSTs to
  the server; 800 ms deadline, always exits 0. `hooks/install.ts`: adds and removes its
  nine entries in `~/.claude/settings.json`, recorded in `~/.funtown/installed.json`.
- `server/` on 127.0.0.1:4777: `agents.ts` runs `claude` (version, `agents --json`, `--bg`);
  `town.ts` merges the 2 s list poll and hook events into the Town; `terminal.ts` runs
  `claude attach` in node-pty per `/term` socket; `app.ts` serves the endpoints and page.
- `web/`: React page (Vite), sessions by project, a panel with an xterm.js terminal for
  background sessions. `tests/`: Vitest at the seams, Playwright in `tests/e2e/`, a fake
  `claude` (`fake-claude.cjs`, steered by `fake-claude.ts`).
- `docs/spikes/`: Claude Code 2.1.325 behaviours v2 builds on (m6); rerun a note's
  Reproduce before relying on it. `docs/history/`: v1's charter.

Contracts (source of truth: docs/MILESTONE.md of the milestone that set them)
- Hook event: POST `/events`, hook JSON plus `funtown: { tty, term_program, at }`; an event
  older than the last applied to the same character is ignored (m7).
- Town state: `server/types.ts`, SSE `state` events; a lead shows only while listed (m7).
- `claude` calls: `--version` (min 2.1.325), `agents --json`, `--bg --settings
  {"worktree":{"bgIsolation":"none"}}`, `attach <id>`; never a shell; children lose every
  `CLAUDE*`/`AI_AGENT` variable except `CLAUDE_CONFIG_DIR` (m7).
- Page: token in `<meta name="funtown-token">`, needed with the page's Origin by `/jump`,
  `/sessions { cwd }` and the `/term` socket (JSON `in`/`resize`/`out`/`shared`); fixed CSP (m7).
- `startServer({ port, distDir?, run?, claude?, pollMs? })`: tests pass the fake as
  `claude`; `run` replaces execFile for osascript/open.
- Env: `FUNTOWN_PORT`, `FUNTOWN_URL`, `FUNTOWN_LOG`, `FUNTOWN_STATE`, `FUNTOWN_CLAUDE`.

Commands: `npm start` (http://127.0.0.1:4777); `npm run install-hooks` / `uninstall-hooks`
(`--settings <path>` for tests); test: `npx eslint . && npx vitest run && npx playwright test`

Decisions that bind
- Nothing leaves the machine (v2's one exception: the opt-in "Suggest" button); 127.0.0.1
  only; `Host` must be 127.0.0.1 or localhost.
- Sessions only from `claude agents --json`, terminals only from `claude attach`; no reading
  Claude's folder. A failed list keeps the last one. New sessions only in a listed project.
- `/events` refuses any `Origin` and has no body limit (Write events run to MB); page POSTs
  cap at 64 KB, `/term` frames at 1 MB; ids, cwds and ttys reach children only as arguments.
- All code our own; MIT tools are reference only. Tests never run the real `claude`, use
  real names or the home folder.
- Personal files stay gitignored: docs/ideas.md, .claude/settings.json, .claude/never-push.
