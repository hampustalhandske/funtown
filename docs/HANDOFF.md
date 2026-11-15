# Milestone 4: rebuild — handoff

Verdict: ship once #5 (hook deadline 800 ms) is merged; until then one hook timing test
fails about one run in three on this branch. Every review finding I agreed with is applied.

## Review in five minutes

**Start here**
1. `server/rebuild.ts:75` `rebuild`: which sessions count as live, what is skipped and
   logged, and the events it feeds the reducer.
2. `server/app.ts:95`: the rebuild runs before the server listens, only with `claudeDir`.
3. `tests/rebuild.test.ts`: fixture Claude folders and a fake `ps`.

**Verify**

    npx eslint . && npx vitest run && npx playwright test

**Needs you**
- Merge #5 first (the hook deadline). That fixes the flaky `hook_exits_0_within_1s...` test.
- With two or more `claude` sessions open, restart `npm start` (stop the old one first). Each
  should show at its house within 5 s with the right stage. Then press "Go to terminal" on a
  rebuilt waiting session in macOS Terminal: its tab should come to the front.

## Summary

- Charter constraint "on start, rebuild already-running sessions": Funtown now shows every
  live session on start, with its stage (idle → "needs you: turn ended", busy → working), its
  last step, its subagents, and the tty and terminal app it needs for "Go to terminal".
- A run against the real Claude folder brought back all 5 live sessions, each with its
  tty, terminal app, step and subagents.

## Decisions

- Live sessions come from `~/.claude/sessions/<pid>.json` (pid alive), and tty and
  `TERM_PROGRAM` from `ps -wwE`. The charter names only hooks and `~/.claude/projects/`.
  The user approved both sources; the charter wording still needs an edit and
  `workflow approve`.
- The rebuild feeds `TownState.apply` the events a hook would send, so `town.ts` stays the
  one place that builds characters.
- A session file that can't be parsed, a pid that exits before `ps`, or a broken subagent
  meta skips just that one with a stderr line, so Funtown still starts (user: "fix the stuff
  you agree with").
- Tests use a fixed dead pid (999999) instead of spawning a process, per "Must not run any
  command in a test".
- Not applied, with reasons:
  - reading sessions in parallel with one `ps` call: startup was 1 s with 5 sessions;
  - reading transcripts from the end: the largest here is 65 MB and reads fine;
  - catching a reused pid (a session killed with -9, its pid given to another process): no
    reliable way yet to tell the process is Claude.

## Remaining work

- A ghost lead can appear when a killed session's pid is reused, and it never leaves.
- Startup reads whole transcripts one after another; watch it if transcripts grow past
  ~100 MB or many sessions run at once.
- Charter wording: add `~/.claude/sessions/` and `ps` as sources, plus m1's open items (the
  subagent "done" stage, "HTTP hooks" vs the command hook, a check for the rebuild). Then
  run `workflow approve`.
- Next: the charter's 5-day real-use check. Every v1 item now has a milestone.

## Notes

- `startServer` without `claudeDir` never touches a Claude folder. Playwright's server
  gets `FUNTOWN_CLAUDE_DIR` set to a path that doesn't exist, so e2e sees an empty Town.
- `npm start` fails with EADDRINUSE when an older Funtown still holds 4777; stop it first.
- A rebuilt lead with many finished subagents lists all of them, as a live lead does.
- The parked-ideas commit (de27da0) is on this branch and on #5; whichever merges first
  carries it.

## Numbers

    Branch m4-rebuild vs de27da0
      Production: +170 -3, net 167 of budget 400
      Tests:      +223 -7, net 216 (test/prod 1.29 on this branch)
      Repo:       1,021 production lines, 1,020 test lines (test/prod 1.00; band 0.5-0.7)
