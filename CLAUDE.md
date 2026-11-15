# Funtown

Charter: docs/CHARTER.md. Current state: docs/HANDOFF.md. Parked ideas: docs/PARKING.md.

## Map

Parts
- `hooks/funtown-hook.ts`: command hook Claude Code runs on each event; adds the session's
  tty and POSTs to the server; 900 ms deadline, always exits 0.
- `hooks/install.ts`: adds and removes Funtown's entries in `~/.claude/settings.json`;
  records what it created in `~/.funtown/installed.json`.
- `server/`: HTTP server on 127.0.0.1:4777. `town.ts` turns events into the Town state,
  `app.ts` serves `/events`, `/stream` (SSE), `/jump` and the built page. `rebuild.ts`
  rebuilds live sessions on start from `~/.claude/sessions/`, the transcripts and `ps`.
- `web/`: React page (Vite), emoji houses and characters, a details panel per character.
- `tests/`: Vitest at the seams, Playwright in `tests/e2e/`.

Contracts (source of truth: docs/MILESTONE.md of the milestone that set them)
- Hook event: POST `/events`, Claude Code's hook JSON plus `funtown: { tty, term_program, at }`.
- Town state: `server/types.ts`, streamed as SSE `state` events; `web/` and `tests/`
  import the types from there.
- `POST /jump { lead }` from the page's own Origin: focuses the lead's terminal (m3).
- `startServer({ port, goneAfterMs?, distDir?, run?, claudeDir?, exec? })` in `server/app.ts`:
  entry for tests; `run` and `exec` replace execFile so tests never run osascript, open or ps;
  no `claudeDir`, no rebuild.
- Rebuild input: `<claudeDir>/sessions/<pid>.json`, `projects/*/<sessionId>.jsonl` and
  `projects/*/<sessionId>/subagents/agent-<id>.{meta.json,jsonl}` (m4).
- Env for tests: `FUNTOWN_PORT`, `FUNTOWN_URL`, `FUNTOWN_LOG`, `FUNTOWN_STATE`,
  `FUNTOWN_CLAUDE_DIR`, `--settings`.

Commands
- Run: `npm start` → http://127.0.0.1:4777
- Hooks: `npm run install-hooks` / `npm run uninstall-hooks`
- Test: `npx eslint . && npx vitest run && npx playwright test`

Decisions that bind
- Nothing leaves the machine; listen on 127.0.0.1 only; `Host` must be 127.0.0.1 or localhost.
- `POST /events` refuses any request with an `Origin` header; the hook never sends one.
- `POST /jump` needs the server's own Origin; the tty reaches osascript only as an argument.
- The rebuild only reads the Claude folder; a file it can't read skips that session or
  subagent with one stderr line, never stops startup.
- All code our own; MIT tools are reference only.
- Tests and fixtures never use real project names, paths or the real home folder.
- Personal files stay gitignored: docs/ideas.md, .claude/settings.json, .claude/never-push.
