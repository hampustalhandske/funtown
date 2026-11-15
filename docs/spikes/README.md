# Spikes for Funtown v2

Each note tests one Claude Code behaviour v2 builds on and records `Claude Code: 2.1.325`. A
milestone that relies on a spike reruns its Reproduce section first.

## The charter's open questions

- **Answer path:** cards answer through a hook that waits for Funtown: PermissionRequest
  for permissions, PreToolUse for AskUserQuestion and ExitPlanMode. If the hook dies or
  you answer in the terminal, the normal dialog is still there; the server must then
  release the held request. Held 30 minutes with no cap found; the hold timeout is open
  until m8 ([s1](s1-hook-hold.md), [s6](s6-escalation.md)).
- **Minimum Claude Code version:** 2.1.325 is the only version tested. The s1 2 h hold
  moved to m8 and the s4 push/PR check moved to m11, both approved by the user on
  2026-11-15.

## Results

| Spike | Verdict | Proposal for the next milestone (the user decides there) |
|---|---|---|
| [s1 hook hold](s1-hook-hold.md) | partial | m8: cards over held hooks; the server releases a request the terminal answered; the 2 h hold moved to m8 (approved by the user 2026-11-15) |
| [s2 attach](s2-attach.md) | partial | m7: the live terminal is node-pty running `claude attach`; map Shift+Enter to `\x1b\r`; propose a warning on a second attach |
| [s3 sessions](s3-sessions.md) | partial | m7: the session list comes from `claude agents --json`; `/clear` re-keys a session under the same name |
| [s4 runs](s4-runs.md) | partial | m11: each `--bg` run gets its own worktree; push/PR check against a local bare remote moved to m11 (approved by the user 2026-11-15) |
| [s5 hook cost](s5-hook-cost.md) | pass | m7: keep the command hook with `async: true` (Claude doesn't wait; 115 ms median of process time, 2.4 % of one core at 20 sessions; it keeps the tty lookup the jump needs); `type: "http"` (3 ms) stays a fallback |
| [s6 escalation](s6-escalation.md) | pass | m8: a background lead's question reaches a card while its subagents run |
| [v1 delegation](v1-delegation.md) | pass | m9: join a subagent to its task through PostToolUse on Agent, not SubagentStart |

## Setup every spike needed

- Claude Code refuses to start in an untrusted folder; a person accepts the trust prompt
  once per folder (s1's driver sent the accepting keys itself for its own folder).
- `claude --bg --help` starts a real session; never pass `--help` after `--bg`.
- A pty child started from inside a Claude session registers in `claude agents` only
  with every `CLAUDE*` and `AI_AGENT` variable removed from its environment.
- node-pty's `spawn-helper` installs without its exec bit; `chmod +x` it.
