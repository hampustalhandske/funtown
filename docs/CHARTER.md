# Funtown v2

## Goal

You run your Claude Code work from Funtown instead of Terminal and agent view: a 3D clay
town shows what every agent is doing, and each session's live terminal lets you answer,
type and run commands in the app. VS Code stays for reading code and git history.

## v1 scope

1. Terminal room: every session in one list; background sessions open their live terminal
   in the app through `claude attach` (answer, type, `!` commands, slash commands), and a
   session still in a Terminal tab shows a hint to send it there with `←` or `/bg`; start a
   new session or background run in
   a project; a shell tab per project; add and set up your projects in the app.
2. Needs you: answer cards (allow or deny, pick an option, approve a plan) showing the
   exact command and folder; a pop-up with a soft sound per project and a mute button; the
   queue at your desk, oldest first, with a key to jump to the next one; never steals focus
   while you type; a stuck agent (error, rate limit, loop) stops visibly and joins the queue.
3. Readable work: end-of-turn messages and subagent results as rendered letters with a
   reply box; a morning view of what happened overnight per project (done, stuck, next); a
   one-click "I had to switch" note and an automatic crash and error log, both local.
4. Your workflow visible: a phase file any workflow can write; agent roles and tags; PRs as
   parcels on their building; the steward (the queen of the castle) pre-reviews each PR,
   writes its title and merge text, and puts it on your desk; overlap warnings when two runs
   touch the same files.
5. The 3D town in inked clay: a village with your castle (you as king at the desk, agents
   queued, the queen beside you), one building per project with an inside view, agents
   that carry work between them and leave when done, all made from a code-made kit of parts,
   with an opt-in "Suggest" button for looks and your own avatar.

## Not in v1

- Town extras: weather, night mode, noticeboard, buildings growing floors, gentle camera,
  the context meter.
- The queen acting fully as you (approving or merging PRs); you press merge on GitHub.
- Projects talking to projects.
- Walking your own character in the town.
- The Friday replay.
- Phone or remote access.

## How we know it works

| Check | Passes when |
|---|---|
| Answers through Funtown | Over 5 working days of real use, Funtown's own log shows at least 90% of answers to waiting sessions came from Funtown |
| No missed waits | Over the same 5 days, no session waited more than 5 minutes without its sound and pop-up firing |
| Switches noted | Every switch to Terminal or agent view for Claude work in those 5 days has a note in Funtown's local log |
| Errors logged | Killing the server or a hook mid-event leaves an entry in the local error log with the time and the failing step |
| Live terminal | In a session opened from the app, typing text, `!ls`, a slash command and Esc all work, and closing the panel leaves the session running |
| Town draws the model | Every agent in the list view appears in the town with its role's hat and its project's colour, and a done or dead agent leaves both within 5 s |

## Constraints

- macOS, a local web page on 127.0.0.1; nothing leaves the machine except the opt-in
  "Suggest" button, which shows the exact text before sending it.
- Public MIT repo: nothing from claude-setup or private notes; all art code-made, with no
  outside licence on any file.
- Works with any Claude Code plugins and agents; your own setup plugs in locally.
- A minimum Claude Code version, checked at start, with a plain list of what won't work.
- Libraries approved: node-pty, xterm.js, React Three Fiber and drei, a Markdown renderer,
  sanitiser and code highlighter.
- Sessions are listed and attached only through `claude agents --json` and `claude attach`,
  never by reading Claude's internal files.
- The phase file is `.claude/phase.json` in each project; PRs come from `gh pr list`; the
  steward is a Claude session like any other. Funtown itself sends nothing; the sessions
  and `gh` it starts talk to Anthropic and GitHub as they do today.
- No cost beyond the Claude subscription; no deadline.

## Budget

Start budget: 800
Budget: 400

Net added production lines per milestone; tests don't count. The first milestone gets the
start budget, because it builds the scaffolding; every later one gets the budget. This is a
checkpoint, not a cap: when a milestone reaches it, Claude stops and asks whether to
simplify, split the milestone or raise the budget. To raise it for one milestone, run
`workflow budget N` in your terminal.

## Open questions

- One PR per version needs claude-setup's full-flow command, not built yet; until then
  background runs follow today's one-PR-per-milestone flow. Blocks the "background run" part of item 1.
- The minimum Claude Code version is set after the spikes (hook hold, attach in the app,
  agents list). Blocks the start-up check in item 1.
- Answer path: cards answer through a separate permission hook that waits for Funtown and
  falls back to the terminal prompt after a timeout; the event hook keeps its 800 ms. An
  answer typed elsewhere is logged as "elsewhere". The hook-hold spike settles it. Blocks
  item 2 and the "Answers through Funtown" check.
