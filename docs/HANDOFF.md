# Milestone 7: terminal room — handoff

Verdict: ship. All review findings are applied except the two listed under Remaining
work; three decisions came from the user.

## Review in five minutes

**Start here**
1. `server/terminal.ts`: `/term` runs `claude attach` in a pty per socket. This is the
   riskiest part, because a page that gets in can type into a session.
2. `server/app.ts` `fromPage` and the `/sessions` and `/term` handlers: the token, Origin,
   CSP and the "listed project only" rule.
3. `server/town.ts` `sync` and `apply`: the list decides which sessions show, hooks fill in
   activity, and out-of-order events are ignored.

**Verify**

    npx eslint . && npx vitest run && npx playwright test

**Needs you**
- Nothing to approve. To see it: `npm start`, open http://127.0.0.1:4777, click New session
  on a project, type in the terminal, close the panel.

## Summary

- Charter item 1, terminal room: the page lists exactly what `claude agents --json` lists.
  Background sessions open a live terminal (node-pty + xterm.js over a WebSocket). Sessions
  in a Terminal tab show the "← or /bg" hint. New session starts `claude --bg` in the
  project folder with no worktree.
- Constraints: a start-up version check (minimum 2.1.325) prints, and shows in a banner,
  what won't work. `rebuild.ts` and the `ps` sweep are gone, so production code no longer
  reads Claude's folder.
- Security: a per-start page token plus the page's own Origin on `/jump`, `/sessions` and
  `/term`, and a fixed CSP. `/events` decodes split UTF-8 correctly.
- Hooks are installed with `async: true`. SessionEnd is no longer registered.

## Decisions

- `ws` added as a dependency (user), with `@types/ws` and a postinstall that restores
  node-pty's `spawn-helper` exec bit (user, in review).
- New sessions run in the project folder with `bgIsolation: "none"`; worktrees are m11's
  background runs (user).
- Only live sessions are listed (no `--all`). Stage comes from the list's status, and idle
  shows as "needs you: turn ended", as v1's Stop did.
- A second attach to one session gets a warning (`shared`), not a block.
- Child `claude` processes keep `CLAUDE_CONFIG_DIR` and lose every other `CLAUDE*` and
  `AI_AGENT` variable (user, in review).
- Async hooks can arrive out of order: an event older (`funtown.at`) than the last one
  applied to the same character is ignored.
- "Go to terminal" shows only for sessions in a Terminal tab.

## Remaining work

- Not fixed: a test that hook data for a session never listed expires after 10 s. A real
  10 s wait slows every run, and `startServer` has no option to shorten it.
- Not fixed: the fake `--bg` doesn't record its environment, so the `CLAUDE_CONFIG_DIR` test
  covers `attach` only.
- Next: m8-answer-cards (charter item 2).

## Notes

- Checked in real sessions before the review fixes: New session → no worktree; typed text,
  Shift+Enter (two lines, nothing sent), Esc Esc, `!ls` and `/context` in the panel; the
  session stays listed after the panel closes; no CSP violations. An async 10 s hook:
  5–6 s per `claude -p` run against 16 s with a sync one.
- For m8, from a review of m6's notes:
  - a PreToolUse hold (AskUserQuestion, ExitPlanMode) shows only a "running PreToolUse
    hooks" spinner in the terminal, not the dialog, so the terminal can't answer while held;
  - s6's claim that a subagent's tool calls carry `agent_id` was never logged for a
    subagent question; rerun it before cards depend on it;
  - the charter's Open questions still read as unanswered; m6's README answers them.
- `claude --bg` prints a bare 8-hex id; the server takes the first 8-hex word of stdout.
- The xterm bundle trips Vite's 500 kB chunk-size warning.
- A pty child must lose `CLAUDE*`/`AI_AGENT` to register in `claude agents` (s3); the
  server does this for every child.

## Numbers

    Branch m7-terminal-room vs d6e9518
      Production: +621 -382, net 239 of budget 800
      Tests:      +742 -531, net 211 (test/prod 0.88 on this branch)
      Repo:       1,348 production lines, 1,432 test lines (test/prod 1.06; band 0.5-0.7)

Gross production is 1,003 lines because `rebuild.ts` and the sweep (382 deleted) were
replaced by the agents list.
