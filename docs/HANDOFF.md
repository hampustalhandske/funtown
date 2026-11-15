# Milestone 6: spikes — handoff

Verdict: ship. Every review finding is applied; two checks moved to later milestones with
the user's approval.

## Review in five minutes

**Start here**
1. `docs/spikes/README.md`: the charter's two open questions answered, and one line per
   spike on what the next milestone does with it.
2. `docs/spikes/s1-hook-hold.md`: how answer cards will reach a session (the riskiest
   behaviour v2 relies on).
3. `docs/CHARTER.md`: three wording fixes (privacy exception, licence rule, error check).

**Verify**

    npx eslint . && npx vitest run && npx playwright test

**Needs you**
- Re-approve the charter: run `workflow approve` in your terminal (three lines changed).
- Before m7: `workflow budget 800 m7-terminal-room`.

## Summary

- Serves the charter's open questions, which block items 1 and 2. Seven spikes on Claude
  Code 2.1.325: held hooks answer permission, question and plan prompts (s1, s6); a live
  terminal through `claude attach` in node-pty works (s2); `claude agents --json` replaces
  v1's file reading (s3); background runs get their own worktree (s4); the async event
  hook doesn't slow Claude (s5); subagents join their lead's task (v1).
- No production code; scripts live in the notes, the runs in a scratch folder.

## Decisions

- The 2 h hold moved to m8 and the background-run push/PR check to m11 (user, 2026-11-15).
- The 50 ms bar was the architect's, not the user's; an `async: true` command hook doesn't
  make Claude wait, so it passes and m7 keeps today's hook shape; `type: "http"` (3 ms) is
  the fallback (user, 2026-11-15).
- Charter fixes ride in this PR instead of a charter PR of their own (user).
- PARKING.md: the embedded terminal and answering from Funtown are now in scope and left
  the list; the two phone entries became one.
- A copy of the s3 driver for the pending-prompt case is described in prose with its
  exact command, not inlined.

## Remaining work

- m7-terminal-room, next in the queue (needs this PR merged).
- s5's "Claude doesn't wait for an async hook" rests on Claude Code's documented async
  behaviour; the live runs couldn't separate it from model latency. m7 checks it in a
  real session.
- `tests/hook.test.ts` "exits within 1 s" failed once at 1.1 s under load (load average
  13 during the spikes) and passed three reruns. It's a timing test that can trip on a
  busy Mac.

## Notes

- Every new spike folder needs the trust prompt accepted once, by a person.
- Never pass `--help` after `claude --bg`: it starts a real session.
- A pty child started from a Claude session registers in `claude agents` only with every
  `CLAUDE*` and `AI_AGENT` variable removed from its environment.
- node-pty's `spawn-helper` installs without its exec bit: `chmod +x` it.
- The s1 driver accepted the trust prompt for its own folder by sending keys; plan mode
  wrote two files to `~/.claude/plans/` (Claude Code itself).

## Numbers

    Branch m6-spikes vs dea4ec4
      Production: +0 -0, net 0 of budget 400
      Tests:      +0 -0, net 0 (test/prod n/a on this branch)
      Repo:       1,109 production lines, 1,221 test lines (test/prod 1.10; band 0.5-0.7)
