# Funtown

## Goal

You see every Claude Code session and subagent on your Mac as a character in one fun town
view, so you know what each is doing and which ones need you, without hunting through
terminals. Unlike a notification alert or claudectl, Funtown shows every session's state in
one view and jumps to its terminal in one click.

## v1 scope

1. Funtown runs locally. Each project is a house in the town, labeled with its folder name,
   and every Claude Code session and subagent on the Mac appears as a character at its
   project's house, named by its role and a number: main sessions are lead-1, lead-2;
   subagents use their agent type (implementer-1, implementer-2).
2. A session waiting on you (permission prompt, question, idle after finishing) is clearly
   marked "needs you" and stands out from the rest.
3. Each character shows its stage at a glance (working: a tool or turn is running; needs you:
   a permission prompt, a question, or the turn ended; gone: the session exited, removed
   after 10 min) and the shell command or tool it is running now; subagents appear next to
   the session that started them, so you see who is working for whom.
4. Clicking a character opens a panel with its current step and its subagents with status.
5. A button in that panel focuses that session's exact tab in macOS Terminal; other terminal
   apps are just brought to the front.

## Not in v1

- Embedded terminal inside Funtown (v1 jumps to the real terminal instead).
- Recent transcript and session cost in the panel.
- Exact-tab jump for terminal apps other than macOS Terminal (iTerm2, VS Code, others).
- Notion intake from the phone and an MCP to-do feed per project.
- A mode for non-coders, and sharing with other people.
- The orchestrator posting PR links and review prompts.
- .dmg packaging and code signing.
- Remote or phone access.

## How we know it works

| Check | Passes when |
|---|---|
| Sessions appear | A newly started `claude` session in any project shows as a named character at its project's house within 5 s. |
| Needs you | A session hitting a permission prompt or question shows "needs you" within 5 s; 10 real waits, 0 missed. |
| Details | Clicking a character shows its current step (last tool call or shell command) and its subagents with status. |
| Jump | One click in the panel focuses that session's tab in macOS Terminal. |
| Real use | For 5 working days you answer waiting sessions from Funtown without hunting through terminal tabs. |

## Constraints

- macOS only, on your own Mac.
- A local server plus a page in the browser, built as a web UI that can later be wrapped as a
  native app and shipped as a .dmg.
- Data comes from Claude Code's own sources: hooks and transcript files in
  `~/.claude/projects/`. Not the status line: it is one command for the whole Mac and would
  replace your own.
- Hooks POST events to a localhost server that pushes live updates to the page; on start,
  Funtown rebuilds already-running sessions from the transcripts in `~/.claude/projects/`.
- Nothing leaves the machine; transcripts hold private project content.
- All code is our own. MIT-licensed tools (stargx/claude-code-dashboard, gavraz/recon,
  mercurialsolo/claudectl) are reference only; no code is copied.
- No running cost and no deadline.
- Should read without explanation (plain labels such as "waiting for you"), since non-coders
  are the intended later users.

## Budget

Start budget: 800
Budget: 400

Net added production lines per milestone; tests don't count. The first milestone gets the
start budget, because it builds the scaffolding; every later one gets the budget. This is a
checkpoint, not a cap: when a milestone reaches it, Claude stops and asks whether to
simplify, split the milestone or raise the budget. To raise it for one milestone, run
`workflow budget N` in your terminal.

## Open questions

- Stack (language, server, UI framework, ready for a later native wrapper): blocks milestone 1.
- Hooks: user-level HTTP hooks in `~/.claude/settings.json`; `funtown install`/`uninstall`
  add and remove only Funtown's own entries.
- What identifies a session's terminal (tty, TERM_PROGRAM), recorded on SessionStart; test it
  before milestone 1 counts on it: blocks items 1 and 5.
- Visual style of the town and characters (pixel art, emoji, other): blocks item 1's look.
