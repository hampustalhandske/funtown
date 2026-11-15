# Milestone 5: live check — handoff

Verdict: ship. Every review finding I agreed with is applied; the ones not applied are
under Decisions with the reason.

## Review in five minutes

**Start here**
1. `server/app.ts:126` the sweep: which leads it ends, and the four cases it leaves alone
   (never seen live, failed `ps`, unreadable file, hook during the sweep).
2. `server/rebuild.ts` `liveCheck`: the `env LC_ALL=C TZ=UTC ps` call and the match against
   `procStart`, used by both the rebuild and the sweep.
3. `tests/sweep.test.ts`: fixture Claude folder and fake `ps` changed between sweeps.

**Verify**

    npx eslint . && npx vitest run && npx playwright test

**Needs you**
- With Funtown running (`npm start`), `kill -9` a running `claude` session's pid. Its
  character should show "gone" within 5 s and leave after 10 min.
- Restart Funtown with two or more sessions open: each comes back with its tty, and
  "Go to terminal" works on one in macOS Terminal.

## Summary

- Charter item 3 ("gone: the session exited"): a session that died without a SessionEnd
  hook (killed with `-9`, crashed) now turns "gone" within 5 s instead of staying forever.
- m4's ghost lead: a reused pid no longer looks alive, because the pid's start time must
  match the session file's `procStart`. A rebuild against the real Claude folder kept all 5
  live sessions, each with its tty and terminal app.

## Decisions

- `procStart` in `~/.claude/sessions/<pid>.json` is `ps -o lstart=` in UTC; checked on 3
  live sessions. `ps` prints `lstart` in the user's locale (`Sön 15 Nov ...` under sv_SE),
  so the call sets `LC_ALL=C` too (user approved in review).
- The sweep ends a lead only after it, or the rebuild, saw it live: a hook can arrive
  before the session file exists. A session file that can't be parsed (Claude rewriting it)
  leaves its lead as it is (user approved in review).
- A lead the sweep ended is forgotten until a sweep sees it live again. The review
  suggested keeping it tracked so a later `kill -9` is caught; that made each sweep end a
  revived lead again while its file stayed missing, so a live session flickered to "gone".
  A test pins the no-flicker case.
- The sweep checks every session file's pid in parallel, every 5 s (default `sweepMs`).
- Not applied, with reasons:
  - a session resumed under a new pid whose new file is half-written: very rare, and its
    next hook brings it back;
  - commit subjects over 50 characters and the `scheduleRemoval` refactor inside the feat
    commit: fixing either means a force-push; the squash title is under 50.

## Remaining work

- `/events` decodes each body chunk on its own (`body += chunk`), so a multi-byte UTF-8
  character split across chunks becomes U+FFFD. Older than this branch; found by the review.
  Fix: `req.setEncoding("utf8")` or `Buffer.concat` before decoding.
- Charter wording: add `~/.claude/sessions/` and `ps` as sources, plus m1's open items (the
  subagent "done" stage, "HTTP hooks" vs the command hook, a check for the rebuild). Then
  run `workflow approve`.
- Next: the charter's 5-day real-use check. Every v1 item now has a milestone.

## Notes

- The sweep's stderr line is "funtown: sweep left pid N as is: <reason>"; it repeats every
  5 s while a pid's `ps` keeps failing.
- Startup still reads whole transcripts one after another (m4); watch it past ~100 MB.
- `npm start` fails with EADDRINUSE when an older Funtown still holds 4777; stop it first.

## Numbers

    Branch m5-live-check vs fa11d14
      Production: +126 -38, net 88 of budget 400
      Tests:      +210 -9, net 201 (test/prod 2.28 on this branch)
      Repo:       1,109 production lines, 1,221 test lines (test/prod 1.10; band 0.5-0.7)
