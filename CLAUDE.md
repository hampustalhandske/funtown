# Funtown

Charter: docs/CHARTER.md. Current state: docs/HANDOFF.md. Parked ideas: docs/PARKING.md.
These and the rest of the planning notes (MILESTONE, METRICS, spikes, history) live in
`docs/`, which is gitignored as a whole: local only, never staged, and absent from a fresh
clone or a worktree; there, work from this file and CHANGELOG.md. The public record is
CHANGELOG.md: one line per change, newest first, with date and time. `docs/spikes/` holds
the Claude Code 2.1.325 behaviours v2 builds on; rerun a note's Reproduce before relying
on it.

## Map

Parts
- `hooks/funtown-hook.ts`: async hook on each event; adds tty and `at`, POSTs `/events`;
  800 ms deadline, exits 0. `hooks/funtown-hold.ts`: sync hook (2 h timeout) on
  PermissionRequest and PreToolUse AskUserQuestion|ExitPlanMode; waits on `/hold`, prints
  the answer or nothing. `hooks/letter.md`: the only text of the letter shape, printed by a
  sync SessionStart entry (`~/.funtown/letter.md` overrides it; empty = off).
  `hooks/install.ts`: its thirteen entries in Claude's `settings.json`.
- `server/` on 127.0.0.1:4777: `agents.ts` runs `claude`; `town.ts` merges the 2 s list
  poll and hook events, marks stuck agents (StopFailure, 5 identical calls) and keeps
  letters; `journal.ts` keeps letters and stuck marks 7 days; `terminal.ts` runs `claude attach` in node-pty per `/term` socket; `holds.ts`
  turns held requests into answer cards and logs each close; `app.ts` serves.
- `web/`: React page (Vite): sessions by project, a panel with an xterm.js terminal,
  answer cards (`AnswerCard.tsx`), letters and the reply box (`Letters.tsx`), the Morning
  view (`Morning.tsx`), the Needs
  you list, sound, mute, toasts, notifications, ⌥N (`needs.tsx`). `tests/`: Vitest at the seams, Playwright in
  `tests/e2e/`, a fake `claude` (`fake-claude.cjs`, hard-linked per test, steered by
  `fake-claude.ts`); each run gets one temp folder, removed at the end (`run-temp.ts`).

Contracts (source of truth: this list; full text, where kept, in the local
docs/history/m<N>-MILESTONE.md)
- Hook event: POST `/events`, hook JSON plus `funtown: { tty, term_program, at }`; an
  event older than the last applied to the same character is ignored (m7).
- Town state: `server/types.ts`, SSE `state`; a lead shows only while listed (m7); `cards`
  oldest first, a carded character is needs_you with `needs` = the card's kind (m8);
  a waiting character has `since`, a stuck one `needs` "stuck" and `reason` (m9);
  `letter` = its newest letter's `at`; a lead whose Stop lists running subagents in
  `background_tasks` stays working, "waiting on N agents" (m10).
- Letters (m10, m11): Stop `last_assistant_message`; a subagent's is its SubagentHandback
  report, else its SubagentStop message; shown as written, never parsed; last 20 per lead,
  65,536 characters; ids unique across restarts; `GET /letters?lead=` with the token header (no Origin on a GET); a reply is
  a bracketed paste then `\r` over `/term`.
- Journal (m11): JSONL `JournalEntry` (letter | stuck) at `FUNTOWN_JOURNAL`, restored at
  start; `GET /morning?since=` (token) gives `Morning`: per project each lead's newest letter
  and stuck marks; Next comes from Needs you; the window starts when the view last closed.
- Holds (m8): `/hold` replies 200 with the hook output, or 204 when released (rules in
  `holds.ts` `event()`, no page or listing for `unlistedMs`); `/answer { card, decision,
  answers?, feedback? }`; log lines `by` funtown, elsewhere or dropped.
- `claude` calls (m7): `--version` (min 2.1.325), `agents --json`, `--bg` (`bgIsolation:
  "none"`), `attach <id>`; never a shell; children drop `CLAUDE*`/`AI_AGENT` but `CLAUDE_CONFIG_DIR`.
- Page: token in `<meta name="funtown-token">`, needed with the page's Origin by `/jump`,
  `/sessions`, `/answer` and `/term`; fixed CSP, no raw HTML in letters (m7, m10).
- `startServer({ port, distDir?, run?, claude?, pollMs?, answerLog?, journal?, unlistedMs? })`.
  Env: `FUNTOWN_PORT`, `_URL`, `_LOG`, `_STATE`, `_CLAUDE`, `_ANSWERS`, `_JOURNAL`.

Commands: `npm start` (reinstalls the hooks, then serves); `npm run install-hooks` /
`uninstall-hooks`; test: `npm test` (same as .claude/test-command).

Decisions that bind
- Nothing leaves the machine (except the opt-in "Suggest" button); 127.0.0.1 only; `Host`
  must be 127.0.0.1 or localhost. No reading Claude's folder; new sessions only in a
  listed project; a failed list keeps the last one.
- `/events` and `/hold` refuse any `Origin` and have no body limit; page POSTs cap at
  64 KB, `/term` frames at 1 MB; ids, cwds and ttys reach children only as arguments.
- All code our own. Tests never run the real `claude`, use real names or the home folder;
  Playwright runs one spec file at a time (they share one fake `claude`). Funtown shapes
  replies only through its SessionStart context; it never prompts a session for a report.
- Out of git: all of `docs/`, .claude/settings.json, .claude/never-push;
  a security finding is fixed before the push and never written in a tracked file.
