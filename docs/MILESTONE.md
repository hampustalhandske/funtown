# Milestone 6: spikes

Serves: the charter's open questions (answer path, minimum Claude Code version), which
block items 1 and 2: each unproven Claude Code behaviour v2 builds on gets a pass or fail
before any production code depends on it.
Estimate: 0 net production lines of a 400 budget (spike code stays outside the repo)
Mode: away: open the PR after review and continue with the queue

## Done when

1. `docs/spikes/` has one note per task below (s1-s6, v1), each in the result-note shape
   under Contracts, with a pass or fail for every criterion in its task row.
2. `docs/spikes/README.md` answers the charter's two open questions in one line each: the
   answer path (held permission hook, timeout, fallback) and the minimum Claude Code
   version that passed.
3. Every spike note lists the exact commands to reproduce it on Claude Code 2.1.325.
4. After the spikes, `claude agents --json` lists no session a spike started.
5. `npx eslint . && npx vitest run && npx playwright test` passes, unchanged.

## Must not

- Add a dependency, service or paid API to the repo. Spike code, and node-pty or xterm.js
  installs, live in a scratch folder outside the repo.
- Write to `~/.claude/` or the installed Funtown hooks; spike sessions get their hooks
  through `claude --settings <file>`. Claude's folder is read only.
- Push, open a PR or add a remote in a spike repo. Spike repos are new local repos in the
  scratch folder.
- Put a real project name, session name, user name or home-folder path in a note; write
  `~` and placeholders such as `<project>`.
- Leave a session running: stop every session a spike starts. Spike sessions use
  `--model haiku` unless the behaviour under test needs another model.
- Change production code, tests or config.

## Contracts

### Result note

Produced by tasks 1-6, consumed by the README (orchestrator) and the next milestones.

```
# <id>: <title>
Claude Code: <claude --version>   Date: <YYYY-MM-DD>   Verdict: pass | fail | partial

| Criterion | Result | Evidence |
|---|---|---|
| <criterion from the task row> | pass/fail | <command output, one line> |

## Reproduce
<commands, with ~ and placeholders>

## Consequence
<if fail or partial: which "fail means" from the plan applies, in one line>
```

## Tasks

| # | Owner | Owned paths | Does | Done when |
|---|---|---|---|---|
| 1 | hook | docs/spikes/s1-hook-hold.md, docs/spikes/s6-escalation.md | S1: a PermissionRequest/PreToolUse hook that waits on a local server and returns a decision, in an interactive (pty-driven) and a `--bg` session. S6: AskUserQuestion from a `--bg` lead with a subagent running reaches that hook and the answer returns. | Notes record: answers apply for permission, AskUserQuestion and ExitPlanMode; a killed hook falls back to the normal dialog; what the terminal shows while held; a 2 h timeout honoured (run in the background); whether Esc fires Stop; S6 pass or fail |
| 2 | attach | docs/spikes/s2-attach.md | S2: node-pty runs `claude attach <id>` behind an xterm.js test page | Note records: render, resize, Shift+Enter, Esc, `!cmd`, a slash command and wheel work; killing the client leaves the session working; paste + Enter sends when idle and queues when busy; what a second attach does |
| 3 | sessions | docs/spikes/s3-sessions.md | S3 with V3, V5, V7: join `claude agents --json` with hook payloads | Note records: `sessionId` equals hook `session_id` for interactive and `--bg` sessions; `name` stable over a restart; `id` after `/clear`; `status`/`waitingFor` during a pending prompt; hooks fire in `--bg` sessions; whether an idle stopped `--bg` session stays listed |
| 4 | runs | docs/spikes/s4-runs.md | S4: two `--bg` runs in one scratch repo, each in its own worktree | Note records: no extra worktree, no push, no PR; each run's cwd; whether `--settings` with `bgIsolation: "none"` applies |
| 5 | cost | docs/spikes/s5-hook-cost.md | S5: an async observe hook (the v1 hook shape) against a local server at 20 simulated sessions | Note records: ms added per tool call (median and p95); server CPU; command hook vs `type: "http"` |
| 6 | delegation | docs/spikes/v1-delegation.md | V1 with V6: a lead starts a subagent through the Agent tool | Note records: PreToolUse on Agent carries description, prompt and subagent_type; its `tool_use_id` joins SubagentStart's `agent_id` (or how else); SubagentStop's `last_assistant_message` equals the text the lead receives |

No tests row: this milestone adds no production code.

## Test seams

- None in code. Each note's Reproduce section is the seam: the milestone that builds on a
  spike reruns it before relying on it.

## Stop and ask

Every agent stops and reports BLOCKED when:
- a contract needs to change;
- the code or the cause doesn't match this plan;
- the budget checkpoint fires;
- a "Done when" can't be met as written;
- a spike needs the user's hands (a real Terminal tab, a login, a prompt only a person can
  answer).

## Queue

Each needs the one before it merged.

- m7-terminal-room: ~550, budget 800: session list from agents JSON, list view, live attach
  panel, new session via `--bg`, token/Origin/CSP, version check, v1 bug fixes (incl. the
  `/events` UTF-8 decode)
- m8-answer-cards: ~400: decide hook, cards, desk queue, pop-up with sound, focus rule,
  stuck agents, answer log for the 90% check
- m9-letters: ~400: letters with reply box, morning view, switch note, error log
- m10-workflow: ~400: project setup in the app, phase file, roles and tags, steward desk
  items, PR data from `gh`
- m11-runs-shell: ~400: background runs per worktree, PR parcels, overlap warnings, shell
  tab per project
- m12-town-kit: ~400: inked-clay rig and parts, the standard agent set, keyword roles
- m13-village: ~400: village, castle, you as king, the queue, the queen, buildings
- m14-interiors: ~400: inside a building, talk and leave animations
- m15-looks: ~400: agent `.md` reader, Suggest button, your avatar
