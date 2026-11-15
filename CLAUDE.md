# Funtown

Charter: docs/CHARTER.md. Current state: docs/HANDOFF.md. Parked ideas: docs/PARKING.md.

## Map

Parts
- `hooks/funtown-hook.ts`: command hook Claude Code runs on each event; adds the session's
  tty and POSTs to the server; 800 ms deadline, always exits 0.
- `hooks/install.ts`: adds and removes Funtown's entries in `~/.claude/settings.json`;
  records what it created in `~/.funtown/installed.json`.
- `server/`: HTTP server on 127.0.0.1:4777. `town.ts` turns events into the Town state;
  `app.ts` serves `/events`, `/stream` (SSE), `/jump` and the page, and every 5 s sweeps for
  sessions that died without SessionEnd; `rebuild.ts` rebuilds live sessions on start.
- `web/`: React page (Vite), emoji houses and characters, a details panel per character.
  `tests/`: Vitest at the seams, Playwright in `tests/e2e/`.
- `docs/spikes/`: the Claude Code 2.1.325 behaviours v2 builds on, one note each (m6);
  rerun a note's Reproduce before relying on it. `docs/history/`: v1's charter.

Contracts (source of truth: docs/MILESTONE.md of the milestone that set them)
- Hook event: POST `/events`, Claude Code's hook JSON plus `funtown: { tty, term_program, at }`.
- Town state: `server/types.ts`, streamed as SSE `state` events; `web/` and `tests/` import it.
- `POST /jump { lead }` from the page's own Origin: focuses the lead's terminal (m3).
- `startServer({ port, goneAfterMs?, distDir?, run?, claudeDir?, exec?, sweepMs? })`: entry
  for tests; `run` and `exec` replace execFile so tests never run osascript or ps; no
  `claudeDir`, no rebuild and no sweep (m5).
- Claude folder input: `sessions/<pid>.json`, `projects/*/<sessionId>.jsonl` and
  `projects/*/<sessionId>/subagents/agent-<id>.{meta.json,jsonl}` (m4).
- Live check: `env LC_ALL=C TZ=UTC ps -wwE -o lstart=,tty=,command= -p <pid>`; live when
  `lstart` equals the session file's `procStart` (m5).
- Test env: `FUNTOWN_PORT`, `FUNTOWN_URL`, `FUNTOWN_LOG`, `FUNTOWN_STATE`, `FUNTOWN_CLAUDE_DIR`.

Commands
- Run: `npm start` → http://127.0.0.1:4777. Hooks: `npm run install-hooks` / `uninstall-hooks`
  (`--settings <path>` points the installer elsewhere, for tests).
- Test: `npx eslint . && npx vitest run && npx playwright test`

Decisions that bind
- Nothing leaves the machine (v2's one exception: the opt-in "Suggest" button); listen on
  127.0.0.1 only; `Host` must be 127.0.0.1 or localhost.
- `POST /events` refuses any `Origin` header and has no body limit (a large Write event can
  be several MB); `/jump` needs the server's own Origin, caps at 64 KB, and passes the tty to
  osascript only as an argument.
- The Claude folder is read only; an unreadable file skips that session with one stderr
  line. The sweep ends only a lead it saw live, never on a failed `ps`, an unreadable file
  or a hook during the sweep.
- All code our own; MIT tools are reference only. Tests never use real names or the home folder.
- Personal files stay gitignored: docs/ideas.md, .claude/settings.json, .claude/never-push.
