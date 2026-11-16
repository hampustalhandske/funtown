# Funtown

Charter: docs/CHARTER.md. Current state: docs/HANDOFF.md. Parked ideas: docs/PARKING.md.
These and the rest of the planning notes (MILESTONE, METRICS, spikes, history) live in
`docs/`, which is gitignored as a whole: local only, never staged, and absent from a fresh
clone or a worktree; there, work from this file and CHANGELOG.md. The public record is
CHANGELOG.md: one line per change, newest first, with date and time. `docs/spikes/` holds
the Claude Code 2.1.325 behaviours v2 builds on; rerun a note's Reproduce before relying
on it.

## Map

- `hooks/`: `funtown-hook.ts` (async, every event: adds tty and `at`, POSTs `/events`, 800 ms,
  exits 0); `funtown-hold.ts` (sync, 2 h, PermissionRequest, AskUserQuestion, ExitPlanMode:
  waits on `/hold`); `letter.md` (the letter shape, printed at SessionStart; `~/.funtown/
  letter.md` overrides, empty = off); `install.ts` (13 entries in Claude's settings).
- `server/` on 127.0.0.1:4777: `agents.ts` runs `claude`; `town.ts` merges the 2 s poll and
  hook events; `journal.ts`; `holds.ts` answer cards; `terminal.ts` `claude attach` in
  node-pty; `errors.ts` the error log (hooks too); `main.ts` run file, signals, crashes.
- `web/` (React, Vite): panel with xterm.js, `AnswerCard`, `Letters`, `Morning`, `Switch`,
  `needs.tsx` (Needs you: sound, mute, toasts, ⌥N). `tests/`: Vitest at the seams,
  Playwright in `tests/e2e/` (one spec at a time), a fake `claude` hard-linked per test.

Contracts (source of truth: this list; full text in the local docs/history/m<N>-MILESTONE.md)
- Event: POST `/events`, hook JSON + `funtown: { tty, term_program, at }`; stale ones ignored.
- State (`server/types.ts`, SSE `state`): leads only while listed; `cards` oldest first, a
  carded character is needs_you with `needs` = card kind; stuck has `reason`; a lead whose
  Stop lists running `background_tasks` stays working.
- Letters: Stop `last_assistant_message`; a subagent's handback report, else its SubagentStop
  message; shown as written, never parsed; 20 per lead; `GET /letters?lead=`; a reply is a
  bracketed paste then `\r` over `/term`. Journal (JSONL, 7 days) feeds `GET /morning`.
- Holds: `/hold` 200 with the hook output, 204 when released (`holds.ts` `event()`);
  `/answer { card, decision, answers?, feedback? }`; log `by` funtown, elsewhere or dropped.
- Logs: `<ISO> <hook|hold|server> <step>: <message>` (not for a refused connection); run file
  `{ pid, startedAt }` (dead pid at start: `server unclean-exit`); `POST /switch` notes.
- `claude`: `--version` (min 2.1.325), `agents --json`, `--bg`, `attach <id>`; never a shell;
  children drop `CLAUDE*`/`AI_AGENT` but `CLAUDE_CONFIG_DIR`.
- Page: token in `<meta name="funtown-token">`, with the page's Origin on POSTs and `/term`;
  GETs take the token alone. Env `FUNTOWN_` + `PORT`, `URL`, `CLAUDE`, `STATE`, `ANSWERS`,
  `JOURNAL`, `LOG`, `RUN`, `SWITCHES`; files in `~/.funtown/`; `startServer` options alike.
Commands: `npm start` (reinstalls the hooks, then serves); `npm run install-hooks`; `npm test`.

Decisions that bind
- Nothing leaves the machine but the opt-in "Suggest"; 127.0.0.1, `Host` 127.0.0.1 or
  localhost; no reading Claude's folder; sessions only in listed projects. `/events`, `/hold`
  refuse any `Origin`; page POSTs cap at 64 KB, `/term` frames 1 MB; ids, cwds and ttys reach
  children only as arguments; fixed CSP, no raw HTML in letters.
- All code our own. Tests never run the real `claude`, use real names or the home folder.
  Replies are shaped only through SessionStart context; no session is prompted for a report.
- Out of git: `docs/`, .claude/settings.json, never-push, and any security finding.
