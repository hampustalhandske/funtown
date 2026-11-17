# Funtown

Charter: .workflow/CHARTER.md. Current state: .workflow/HANDOFF.md. Parked ideas: .workflow/PARKING.md.
These and the rest of the planning notes (MILESTONE, METRICS, spikes, history) live in
`.workflow/`, which is gitignored as a whole: local only, never staged, and absent from a fresh
clone or a worktree; there, work from this file and CHANGELOG.md. The public record is
CHANGELOG.md: one line per change, newest first, with date and time. `.workflow/spikes/` holds
the Claude Code 2.1.325 behaviours v2 builds on; rerun a note's Reproduce before relying
on it.

## Map
- `hooks/`: `funtown-hook.ts` (async, every event to `/events` with tty and `at`; 800 ms, exits 0);
  `funtown-hold.ts` (sync, 2 h, PermissionRequest, AskUserQuestion, ExitPlanMode: waits on `/hold`);
  `letter.md` (printed at SessionStart; `~/.funtown/letter.md` overrides, empty = off); `install.ts`.
- `server/` on 127.0.0.1:4777: `agents.ts` runs `claude`; `town.ts` merges the 2 s poll and hook
  events; `journal.ts`; `holds.ts` cards; `terminal.ts` `claude attach`; `errors.ts` the error log;
  `workflow.ts` phase file, `gh pr list`; `steward.ts` the steward; `main.ts` run file, signals.
- `web/` (React, Vite): `AnswerCard`, `Letters`, `Morning`, `Switch`, `needs.tsx` (Needs you).
  `tests/`: Vitest; Playwright in `tests/e2e/`, one spec at a time; the fake `claude` is also `gh`.
Contracts (source of truth: this list; full text in the local .workflow/history/m<N>-MILESTONE.md)
- Event: POST `/events`, hook JSON + `funtown: { tty, term_program, at }`; stale ones ignored.
- State (`server/types.ts`, SSE `state`): leads only while listed; `cards` oldest first, a carded
  character is needs_you with `needs` = card kind; waiting has `since`; stuck has `needs` "stuck"
  and `reason`; `letter` = newest letter's `at`; a Stop with running `background_tasks` stays working.
- Letters: Stop `last_assistant_message`; a subagent's handback report, else its SubagentStop message;
  as written, never parsed; 20 per lead, 65,536 chars, ids unique across restarts; `GET /letters?lead=`;
  reply: bracketed paste, `\r` over `/term`. Journal: JSONL, 7 days (steward kept), `/morning?since=`.
- Holds: `/hold` 200 with the hook output, 204 when released (no page or listing for `unlistedMs`);
  `/answer { card, decision, answers?, feedback? }`; log `by` funtown, elsewhere or dropped.
- Logs: `<ISO> <hook|hold|server> <step>: <message>`; a dead run-file pid: `server unclean-exit`.
- Workflow: `<cwd>/.claude/phase.json` `{ phase, note?, tags?: { roleOrName: [] } }`; role = a
  subagent's `agent_type`; parcels from `gh pr list` every 60 s; overlaps: files two runs edit. One
  steward in `~/.funtown/steward`: one request per ready PR head (`server/steward.md`; overridden by
  `~/.funtown/steward.md`, empty = off), pasted only with no card and not working; next letter = review.
- `claude`: `--version` (min 2.1.325), `agents --json` (failed: keep the last list), `--bg`
  (`bgIsolation: "none"`), `attach`; `gh` only `pr list`; no shell; env drops `CLAUDE*`/`AI_AGENT`
  but `CLAUDE_CONFIG_DIR`. Page token in `<meta name="funtown-token">`: with the Origin for
  `/jump`, `/sessions`, `/answer`, `/switch`, `/term`; alone for `/letters`, `/morning`.
- Env `FUNTOWN_` + `PORT`, `URL`, `CLAUDE`, `GH`, `STATE`, `ANSWERS`, `JOURNAL`, `LOG`, `RUN`,
  `SWITCHES`, `STEWARD` (paths default to `~/.funtown/`); `startServer` takes the paths as options.
Commands: `npm start` (reinstalls hooks, serves); `npm run install-hooks`/`uninstall-hooks`; `npm test`.
Decisions that bind
- Funtown sends nothing but the opt-in "Suggest"; the `claude` and `gh` it runs talk to Anthropic and
  GitHub as usual. 127.0.0.1, `Host` 127.0.0.1 or localhost; no reading Claude's folder; sessions only
  in listed projects and the steward's folder. `/events`, `/hold` refuse any `Origin`, no body limit;
  page POSTs cap at 64 KB, `/term` frames 1 MB; ids, cwds, ttys reach children only as arguments.
- All code our own. Tests never run the real `claude` or `gh`, use real names or the home folder.
  Replies are shaped only through SessionStart context; only the steward gets requests (reviews).
- Out of git: `.workflow/`, .claude/settings.json, .claude/never-push; a security finding is fixed
  before the push and never written in a tracked file. Fixed CSP; no raw HTML in letters.
