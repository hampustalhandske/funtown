# S3: join `claude agents --json` with hook payloads (V3, V5, V7)
Claude Code: 2.1.325   Date: 2026-11-15   Verdict: pass

| Criterion | Result | Evidence |
|---|---|---|
| `sessionId` equals hook `session_id`, `--bg` | pass | `--bg` printed id `2a2362f8`; agents `sessionId` `2a2362f8-95a6-4295-a139-95b3f725b1a2` = hook `session_id` on SessionStart, UserPromptSubmit, Stop. `id` is the first 8 characters of `sessionId`. |
| `sessionId` equals hook `session_id`, interactive | pass | pty session: agents `sessionId` `3918bcca-...` = hook `session_id` on all 4 events; entry has `kind: "interactive"`, no `id` field. |
| `name` stable over a restart | pass | `--bg` name `s3bg`: same after `claude stop` + `claude respawn` (new `pid`, same `sessionId`; hook `SessionEnd`, then `SessionStart` source `resume`). Interactive: `claude --resume <id>` without `--name` still lists `s3int`, same `sessionId`. |
| `id` after `/clear` | pass (changes) | Interactive: `/clear` gives a new `sessionId` (`3918bcca` to `b245c8b8`), same `pid`, same `name`. Hooks: `SessionEnd` (old id), then `SessionStart` with `source: "clear"` (new id). A join must follow the pid and re-key on the new `sessionId`. |
| `status`/`waitingFor` during a pending prompt | pass | `--bg` and interactive, Write tool, `--permission-mode default`: `status: "waiting"`, `waitingFor: "permission prompt"` (`--bg` also `state: "blocked"`). Hooks: PreToolUse, PermissionRequest, then Notification about 6 s later. Working: `status: "busy"` (`--bg` `state: "working"`); idle: `status: "idle"` (`state: "done"`). |
| Hooks fire in `--bg` sessions | pass | With `--settings`: SessionStart (source `startup`), UserPromptSubmit, PreToolUse, PostToolUse, Stop, and SessionEnd on `claude stop`. |
| Idle stopped `--bg` session stays listed | partial | After `claude stop` it is absent from `claude agents --json` and present only with `--all`, with no `pid` and no `status` (`state: "done"`). A live idle `--bg` session stays listed (`status: "idle"`). `claude rm <id>` removes it from `--all` too. |

Other findings:
- In the default mode of the user's setup (auto mode) a Bash `touch` raised no prompt, so a pending-prompt test needs `--permission-mode default` and a Write.
- A `--bg` session in a git repo with a pending Write created a worktree (`.claude/worktrees/<name>`); `claude rm` removed it (relevant to S4).
- A pty child started from inside a Claude session did not register in `~/.claude/sessions/` (so was missing from `claude agents --json`) until every `CLAUDE*` and `AI_AGENT` variable was removed from its environment. Set a pty size too.
- Hook `session_id` does not carry the short `id`; join on `sessionId`.

## Reproduce
Scratch: `<scratch>/spikes/s3` with `repo/` (new local git repo, trusted once by hand), `settings.json` (a command hook on SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, Notification, SessionEnd, PermissionRequest, SubagentStart, SubagentStop) and `hook.js`, which appends `{ev, sid, src, ...}` per payload to `hooks.jsonl`.
```
cd <scratch>/spikes/s3/repo
claude --bg --model haiku --settings ../settings.json --name s3bg "Reply with the single word ok, nothing else."
claude agents --json --all | grep -A8 s3bg        # sessionId vs hooks.jsonl sid
claude stop <id>; claude agents --json; claude agents --json --all   # stopped: only in --all
claude respawn <id>; claude agents --json --all  # same name, sessionId
claude --bg --model haiku --permission-mode default --settings ../settings.json --name s3perm "Use the Write tool to create perm2.txt containing hello"
claude agents --json                              # waiting / permission prompt
claude stop <id>; claude rm <id>
```
Interactive: a Python `pty.fork()` driver that removes `CLAUDE*`/`AI_AGENT` from the environment, sets a 45x150 window, runs `claude --model haiku --settings ../settings.json --name s3int`, sends a prompt, `/clear`, another prompt, `/exit`, and runs `claude agents --json` between steps. For the pending prompt: relaunch with `--resume <sessionId> --permission-mode default` and ask for a Write, then kill the process.
Cleanup check: `claude agents --json --all | grep -c spikes/s3` gives 0.

## Consequence
None blocking. Plan for: `/clear` re-keys the session (same pid, new `sessionId`); stopped `--bg` sessions are visible only through `--all`, so the session list should call `claude agents --json --all` if stopped sessions should show.
