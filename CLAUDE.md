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
  events; `journal.ts`; `holds.ts` cards; `terminal.ts` `claude attach` and shells; `errors.ts` the error log;
  `workflow.ts` phase file, `gh pr list`; `steward.ts` the steward; `projects.ts` added projects; `avatar.ts` the chosen avatar file;
  `main.ts` run file, signals.
- `web/` (React, Vite): `/` is the town (`index.html`, `src/town/`: `layout.ts` pure places, `Village.tsx`
  the 3D scene, `TownPage.tsx` icons, Settings (the avatar row), hidden list; `kit/` the clay parts (`avatars.ts` the eight presets: the king in a crown, the rest hatless, since every other hat is an agent's); no visible words on the
  town). A building opens its classroom at `#in=<cwd>`: `interior.ts` pure places and the whiteboard model,
  `Classroom.tsx` the room, the lead at the front, you the observer at the back, wearing the chosen avatar; words only on the board;
  `drawn()` keeps a departed figure at the door for 2.5 s so it walks out.
  `/work.html` the work view (`App.tsx`: list, panels; a background lead's terminal mounts only after Show terminal; no command text on rows; `AnswerCard`, `Letters`, `Morning`,
  `Switch`, `needs.tsx`: `waitingList`, the desk order, card kinds first then oldest). Font Recursive (OFL, bundled, licence emitted next to it).
  `tests/`: Vitest; Playwright in `tests/e2e/`, one spec at a time; the fake `claude` is also `gh`.
Contracts (source of truth: this list; full text in the local .workflow/history/m<N>-MILESTONE.md)
- Event: POST `/events`, hook JSON + `funtown: { tty, term_program, at }`; stale ones ignored.
- State (`server/types.ts`, SSE `state`): leads only while listed; the steward's lead has `steward:
  true`; `cards` oldest first, a carded character is needs_you with `needs` = card kind; waiting has
  `since`; stuck has `needs` "stuck" and `reason`; `letter` = newest letter's `at`; a Stop with
  running `background_tasks` stays working; a Stop, or a poll saying idle, marks every subagent not still running done.
- Letters: Stop `last_assistant_message`; a subagent's handback report, else its SubagentStop message;
  as written, never parsed; the newest only per lead, 65,536 chars, ids unique across restarts; `GET /letters?lead=`;
  reply: bracketed paste, `\r` over `/term`. Journal: JSONL, 7 days (steward kept), `/morning?since=`.
- Holds: `/hold` 200 with the hook output, 204 when released (no page or listing for `unlistedMs`);
  `/answer { card, decision, answers?, feedback? }`; log `by` funtown, elsewhere or dropped.
- Logs: `<ISO> <hook|hold|server> <step>: <message>`; a dead run-file pid: `server unclean-exit`.
- Workflow: `<cwd>/.claude/phase.json` `{ phase, note?, steps?: string[], tags?: { roleOrName: [] } }` (`steps` = the
  workflow's ordered phases, at most 24, the classroom whiteboard marks done/now/next/later); role = a
  subagent's `agent_type`; parcels from `gh pr list --author @me` every 60 s; overlaps: files two runs edit. One
  steward in `~/.funtown/steward`: one request per asked PR head, only after `POST /review` (`server/steward.md`; overridden by
  `~/.funtown/steward.md`, empty = off), pasted only with no card and not working; a reply counts as a review only with its three labelled parts; the user's own prompt to it pauses requests until the next ask; `Parcel.review.state` is idle until asked.
- `claude`: `--version` (min 2.1.325), `agents --json` (failed: keep the last list), `--bg`
  (`bgIsolation: "none"`), `--bg <prompt>` (a run, own worktree), `attach`, `stop <id>` (Close session; the conversation is kept); `gh` only `pr list`; env drops `CLAUDE*`/`AI_AGENT`
  but `CLAUDE_CONFIG_DIR`. Page token in `<meta name="funtown-token">`: with the Origin for
  `/jump`, `/sessions`, `/runs`, `/projects`, `/projects/remove`, `/sessions/stop`, `/shells/close`, `/answer`, `/avatar`, `/review`, `/switch`,
  `/term`; alone for `/letters`, `/morning`.
- Avatar: `Town.avatar` = the chosen preset's id (absent = the king); `POST /avatar { id }` (id `^[a-z0-9-]{1,32}$`) writes `avatar.json` `{ id }`; the server stores any such id, the page falls back to the king for one it doesn't know; an unreadable file is logged and means none.
- Projects: `projects.json`, real paths (symlinks resolved); each is a house with or without sessions;
  while the file can't be read, add and remove answer 500 and never write it. Only sessions in an
  added project or a folder inside one (a run's worktree), and the steward, are seen; Morning too.
  Houses: added projects, those sessions' cwds, folders whose shell runs. Shell: `/term?shell=<house cwd>`, one login shell
  per project (`$SHELL -l`), kept when its socket closes, replay from a line start in the last 256 KB;
  ends on Close shell, `exit`, Remove project (asks first) or the server's close.
- Env `FUNTOWN_` + `PORT`, `URL`, `CLAUDE`, `GH`, `STATE`, `ANSWERS`, `JOURNAL`, `LOG`, `RUN`,
  `SWITCHES`, `STEWARD`, `PROJECTS`, `AVATAR` (paths default to `~/.funtown/`); `startServer` takes the paths as options.
Commands: `npm start` (reinstalls hooks, serves); `npm run install-hooks`/`uninstall-hooks`; `npm test`.
Decisions that bind
- Funtown sends nothing but the opt-in "Suggest"; the `claude` and `gh` it runs talk to Anthropic and
  GitHub as usual. 127.0.0.1, `Host` 127.0.0.1 or localhost; no reading Claude's folder; sessions only
  in listed projects and the steward's folder. `/events`, `/hold` refuse any `Origin`, no body limit;
  page POSTs cap at 64 KB, `/term` frames 1 MB; ids, cwds, ttys, prompts reach children only as
  arguments. The one shell Funtown starts is the Shell tab's interactive login shell in a house's folder.
- All code our own. Tests never run the real `claude` or `gh`, use real names or the home folder.
  Replies are shaped only through SessionStart context; only the steward gets requests (reviews).
- Out of git: `.workflow/`, .claude/settings.json, .claude/never-push; a security finding is fixed
  before the push and never written in a tracked file. Fixed CSP; no raw HTML in letters.
