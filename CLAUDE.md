# Funtown

Goal: GOAL.md. Specs: docs/specs/<slug>.md. Terms: GLOSSARY.md. Tickets and parked ideas:
`.scratch/` (local only, gitignored). The public record is CHANGELOG.md: one line per change,
newest first, with date and time. `.workflow/` is the local, untracked archive of the old
milestone notes; its `spikes/` hold the Claude Code 2.1.325 behaviours v2 builds on: rerun a
note's Reproduce before relying on it.

## Map
- `hooks/`: `funtown-hook.ts` (async, every event to `/events` with tty and `at`; 800 ms, exits 0);
  `funtown-hold.ts` (sync, 2 h, PermissionRequest, AskUserQuestion, ExitPlanMode: waits on `/hold`);
  `letter.md` (printed at SessionStart; `~/.funtown/letter.md` overrides, empty = off); `ask.md` (the ask text, printed at
  SessionStart the same way; `~/.funtown/ask.md` overrides, empty = off); `install.ts`.
- `server/` on 127.0.0.1:4777: `agents.ts` runs `claude`; `town.ts` merges the 2 s poll and hook
  events; `journal.ts`; `holds.ts` cards; `terminal.ts` `claude attach` and shells; `errors.ts` the error log;
  `workflow.ts` phase file, `gh pr list`; `steward.ts` the steward; `card-request.ts` the brief she reads for her word; `severity.ts` each card's severity and picks; `brief-parts.ts` the brief's parts the page reads too; `projects.ts` added projects and `houseOf`, the folder of the house a folder belongs to; `avatar.ts` the chosen avatar file;
  `main.ts` run file, signals.
- `web/` (React, Vite): `/` is the town (`index.html`, `src/town/`: `layout.ts` pure places, `Village.tsx`
  the 3D scene, `TownPage.tsx` icons, Settings (the avatar row), hidden list; `mark.ts` `nextHouse`, where an arrow moves the mark; `kit/` the clay parts (`avatars.ts` the eight presets: the king in a crown, the rest hatless, since every other hat is an agent's); no visible words on the
  town). A building opens its classroom at `#in=<cwd>`: `interior.ts` pure places and the whiteboard model,
  `Classroom.tsx` the room, the lead at the front, you the observer at the back, wearing the chosen avatar; words only on the board;
  `drawn()` keeps a departed figure at the door for 2.5 s so it walks out.
  `/work.html` the work view (`App.tsx`: list, panels; a background lead's terminal connects when its panel has been open 300 ms and shows on Show terminal, and a shown terminal opens the terminal sheet (the panel's lines in a 19rem column, the terminal beside it); no command text on rows; `AnswerCard` the decision brief (who and where, the weight meter, the ask, the goal line, a heavy card's stakes box, tiles with the agent's pick chosen, the act row stuck to the bottom, raw detail; the Queen's slot from its `word` (under the act row, above it on a heavy card; her text fetched by letter id through `LetterById` in `Letters`, as is a ready review in the steward's panel; her pick never marked on the tiles); the only card in a pane takes Enter and Q when armed, 1 to 4 and D (Q asks, never answers; a heavy card's ask is a click); a card open in the pane is one line in the list; the same on both pages, the panel 32rem while it holds one; `brief.ts` its pure parts and the severity words and colours, `card.css` its look), `Letters` (the only lazy part: the Markdown renderer), `ReplyBox`, `Morning`,
  `Switch`, `KeySheet.tsx` the key sheet (? or the keyboard icon, on both pages), `keys.ts`: the one window key listener of both pages (typing places take every key, none with Cmd, Ctrl or Option, none in a composition, no repeats; Space and Shift+Space walk the urgency list; `useArmed` the arm rule's 1 s, restarted by focus leaving a typing place and the window coming to the front; `useUndo` the 1.5 s undo window, which Esc stops and Space sends at once; Esc closes one layer per press through `useLayer`, in the order undo window, text box, key sheet, pane, classroom, mark, and stays Claude's inside a terminal; a mouse click blurs its button), `needs.tsx`: `urgencyList(town, now)`, entries are a character or a PR of a house (key `<cwd>#<number>`), tiers 1 asks (cards first), 2 stuck, 3 burning houses (one entry per house, its oldest failed PR, oldest `redAt` first; tiers 1 to 3 chime, toast and notify), 4 quiet (a rate limit, then PRs waiting for you, a ready review first, then house order, then resting leads, whose turn ended: they stand by their house's door, never queue or alert), oldest first in each; the castle queue, Morning and Space read only the character entries; `glance.ts` a house's fire (none, handled while a lead works, burning) and its waiting PRs, from the State and the page's clock). Font Recursive (OFL, bundled, licence emitted next to it).
  `tests/`: Vitest; Playwright in `tests/e2e/`, one spec at a time; the fake `claude` is also `gh`.
Contracts (source of truth: this list)
- Event: POST `/events`, hook JSON + `funtown: { tty, term_program, at }`; stale ones ignored.
- State (`server/types.ts`, SSE `state`): leads only while listed; a house's `cwd` is its added project's
  folder and each lead carries its own `cwd`; the steward's lead has `steward:
  true`; `cards` oldest first, each with `severity: { level low|medium|high|unstated, reason, source
  rule|agent|kind }` (`server/severity.ts`) and, on a question card, `questions: [{ level, pick }]`, one per
  question in order, `pick` the index of the " (Recommended)" option or null, on a permission card
  `suggestions?` (the payload's `permission_suggestions` as sent, when a list), and `word: { state
  idle|queued|writing|ready|failed, letter?, reason? }` (absent when words are off or on the steward's own cards; `idle` until asked); a carded character is needs_you with `needs` = card kind; waiting has
  `since`; stuck has `needs` "stuck" and `reason`; `letter` = newest letter's `at`; a Stop with
  running `background_tasks` stays working; a Stop, or a poll saying idle, marks every subagent not still running done.
- Letters: Stop `last_assistant_message`; a subagent's handback report, else its SubagentStop message;
  as written, never parsed; the newest only per lead, 65,536 chars, ids unique across restarts; `GET /letters?lead=` (`&id=` for a steward's review or word, from the journal);
  reply: bracketed paste, `\r` over `/term`. Journal: JSONL, 7 days (steward kept), `/morning?since=`.
- Holds: `/hold` 200 with the hook output, 204 when released (no page or listing for `unlistedMs`);
  a question or plan is held in PreToolUse, before the terminal shows it, and a permission in PermissionRequest, while its dialog shows;
  `/answer { card, decision, answers?, feedback? }`; log `by` funtown, terminal
  (typed in Funtown's own terminal for that lead), elsewhere, dropped or unshown (an ask from a listed lead that was never carded:
  a terminal lead's question or plan, or no page open), with the card's kind and severity.
- Logs: `<ISO> <hook|hold|server> <step>: <message>`; a dead run-file pid: `server unclean-exit`.
- Terminal: `/term?lead=` runs `claude attach` in a pty per socket; closing the socket kills it, and the client's exit
  closes the socket with code 4000 + its exit code (4000 + 128 + the signal when killed).
- Workflow: `<cwd>/.claude/phase.json` `{ phase, note?, steps?: string[], tags?: { roleOrName: [] }, goal?, spec? }` (`steps` = the
  workflow's ordered phases, at most 24, the classroom whiteboard marks done/now/next/later; `goal` = one line on where the project is heading, `spec` = the spec or feature now; unknown fields are ignored, fields are only added, `dates` and `practice` are kept free; a `goal` or `spec` that isn't a string is dropped; the plain list's row shows them as text); role = a
  subagent's `agent_type`; parcels, each with its checks (red, running, green, none) and when they went red, from `gh pr list --author @me` every 60 s; overlaps: files two runs edit. One
  steward in `~/.funtown/steward`: one request per asked PR head, only after `POST /review` (`server/steward.md`; overridden by
  `~/.funtown/steward.md`, empty = off), and one per asked card, only after `POST /word { card }` (`server/steward-card.md`; overridden
  by `~/.funtown/steward-card.md`, empty = off; before queued reviews; a reply counts as her word only with its three labelled parts), pasted only with no card and not working; a reply counts as a review only with its three labelled parts; the user's own prompt to it pauses requests until the next ask; `Parcel.review.state` is idle until asked.
- `claude`: `--version` (min 2.1.325), `agents --json` (failed: keep the last list), `--bg`
  (`bgIsolation: "none"`), `--bg <prompt>` (a run, own worktree), `attach`, `stop <id>` (Close session; the conversation is kept); `gh` only `pr list`; env drops `CLAUDE*`/`AI_AGENT`
  but `CLAUDE_CONFIG_DIR`; the ptys Funtown starts also drop the starting terminal's own variables
  (`TERM_PROGRAM`, `TERM_PROGRAM_VERSION` and the like) and get `TERM=xterm-256color`,
  `COLORTERM=truecolor`; its attach clients also get `CLAUDE_CODE_ENABLE_AWAY_SUMMARY=0`. Page token in `<meta name="funtown-token">`: with the Origin for
  `/jump`, `/sessions`, `/runs`, `/projects`, `/projects/remove`, `/sessions/stop`, `/shells/close`, `/answer`, `/avatar`, `/review`, `/word`, `/switch`,
  `/term`; alone for `/letters`, `/morning`.
- Avatar: `Town.avatar` = the chosen preset's id (absent = the king); `POST /avatar { id }` (id `^[a-z0-9-]{1,32}$`) writes `avatar.json` `{ id }`; the server stores any such id, the page falls back to the king for one it doesn't know; an unreadable file is logged and means none.
- Projects: `projects.json`, real paths (symlinks resolved); each is a house with or without sessions;
  while the file can't be read, add and remove answer 500 and never write it. Only sessions in an
  added project or a folder inside one (a run's worktree), and the steward, are seen; Morning too.
  Houses: one per added project, holding every session and shell in its folder or a folder
  inside it (a run's worktree, a subfolder; the deepest added project wins); a folder in no added
  project (the steward's) is a house of its own. Sessions, runs and shells start only in an added
  project, a listed session's folder or a shell's folder. `/morning?since=` groups by house. Shell: `/term?shell=<house cwd>`, one login shell
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
  Replies are shaped only through SessionStart context; only the steward gets requests (reviews, and her word on a card the user asks for).
- Out of git: `.workflow/`, `.scratch/`, .claude/settings.json, .claude/never-push; a security finding is fixed
  before the push and never written in a tracked file. Fixed CSP; no raw HTML in letters.
- The town draws with three.js's WebGL renderer (WebGL2) in Chrome's engine. Custom GLSL shaders
  live in one place and only those the user approved: the sea, the sky, the ink outline on
  characters and the tilt-shift blur. WebGPU only by the user's decision.
- The page never calls the app: it talks only to the server and keeps working in a browser tab.
  The app's native parts (summon key, menu bar icon) live in its main file.
- The app's window loads only Funtown's own page on 127.0.0.1, with Node off inside it (context
  isolation and the sandbox on), new windows refused and outside links opened in the default
  browser.
