# Funtown

Charter: docs/CHARTER.md. Current state: docs/HANDOFF.md. Parked ideas: docs/PARKING.md.
These and the rest of the planning notes (MILESTONE, METRICS, spikes, history) live in
`docs/`, which is gitignored as a whole: local only, never staged. The public record is CHANGELOG.md: one line
per change, newest first, with date and time. `docs/spikes/` holds the Claude Code 2.1.325
behaviours v2 builds on; rerun a note's Reproduce before relying on it.

## Map

Parts
- `hooks/funtown-hook.ts`: async hook on each event; adds tty and `at`, POSTs `/events`;
  800 ms deadline, exits 0. `hooks/funtown-hold.ts`: sync hook (2 h timeout) on
  PermissionRequest and PreToolUse AskUserQuestion|ExitPlanMode; waits on `/hold`, prints
  the answer or nothing. `hooks/install.ts`: its eleven entries in `~/.claude/settings.json`.
- `server/` on 127.0.0.1:4777: `agents.ts` runs `claude`; `town.ts` merges the 2 s list
  poll and hook events; `terminal.ts` runs `claude attach` in node-pty per `/term` socket;
  `holds.ts` turns held requests into answer cards and logs each close; `app.ts` serves.
- `web/`: React page (Vite): sessions by project, a panel with an xterm.js terminal,
  answer cards (`AnswerCard.tsx`). `tests/`: Vitest at the seams, Playwright in
  `tests/e2e/`, a fake `claude` (`fake-claude.cjs`, steered by `fake-claude.ts`).

Contracts (source of truth: docs/MILESTONE.md of the milestone that set them)
- Hook event: POST `/events`, hook JSON plus `funtown: { tty, term_program, at }`; an
  event older than the last applied to the same character is ignored (m7).
- Town state: `server/types.ts`, SSE `state`; a lead shows only while listed (m7); `cards`
  oldest first, a carded character is needs_you with `needs` = the card's kind (m8).
- Holds (m8): `/hold` replies 200 with the hook output, or 204 when released (rules in
  `holds.ts` `event()`, no page or listing for `unlistedMs`); `/answer { card, decision,
  answers?, feedback? }`; log lines `by` funtown, elsewhere or dropped.
- `claude` calls (m7): `--version` (min 2.1.325), `agents --json`, `--bg` (`bgIsolation:
  "none"`), `attach <id>`; never a shell; children drop `CLAUDE*`/`AI_AGENT` but `CLAUDE_CONFIG_DIR`.
- Page: token in `<meta name="funtown-token">`, needed with the page's Origin by `/jump`,
  `/sessions`, `/answer` and the `/term` socket; fixed CSP (m7).
- `startServer({ port, distDir?, run?, claude?, pollMs?, answerLog?, unlistedMs? })`.
  Env: `FUNTOWN_PORT`, `_URL`, `_LOG`, `_STATE`, `_CLAUDE`, `_ANSWERS`.

Commands: `npm start`; `npm run install-hooks` / `uninstall-hooks`; test: .claude/test-command.

Decisions that bind
- Nothing leaves the machine (except the opt-in "Suggest" button); 127.0.0.1 only; `Host`
  must be 127.0.0.1 or localhost. No reading Claude's folder; new sessions only in a
  listed project; a failed list keeps the last one.
- `/events` and `/hold` refuse any `Origin` and have no body limit; page POSTs cap at
  64 KB, `/term` frames at 1 MB; ids, cwds and ttys reach children only as arguments.
- All code our own. Tests never run the real `claude`, use real names or the home folder.
- Out of git: all of `docs/`, .claude/settings.json, .claude/never-push;
  a security finding is fixed before the push and never written in a tracked file.
