# Milestone 3: panel-jump — handoff

Verdict: ship. Every Should-fix from the review is applied; tests are green.

## Review in five minutes

**Start here**
1. `server/app.ts:25-48` and the `/jump` handler: the Terminal tab script, the 60 s run
   timeout, the same-origin check, and the command chosen per terminal.
2. `web/src/App.tsx`: `Panel` and the selection in `App` (lead lookup, cleared when the
   character leaves the Town).
3. `tests/jump.test.ts`: command per terminal, Origin refusals, 404/409/500.

**Verify**

    npx eslint . && npx vitest run && npx playwright test

**Needs you**
- Restart `npm start` (it builds once; it doesn't reload), then in a real Terminal session:
  minimize its window, click its lead in Funtown, press "Go to terminal". The window should
  come back with that tab in front. Try once with the window visible and once behind others.

## Summary

- Charter item 4: clicking any character opens a details panel with its stage, its step
  (the last tool call, kept after it finishes), why it's waiting, and a lead's subagents.
  It follows live updates and closes with ✕, Escape, or when the character is removed.
- Charter item 5: "Go to terminal" selects the session's exact tab in macOS Terminal by tty;
  iTerm, VS Code, Warp and Ghostty are brought to the front; other terminals get a plain
  message.

## Decisions

- `step` added to `Character` in `server/types.ts`: `activity` is cleared between tools, so a
  waiting session would otherwise show no step.
- `/jump` accepts only `Origin` `http://127.0.0.1:<port>` or `http://localhost:<port>`; the tty
  must match `ttys<N>` and goes to osascript as an argument, never in the script text.
- A subagent's panel jumps to its lead's tab; jumping to the subagent itself stays parked.
- The tab script skips windows whose tabs can't be read (that error broke jumps to minimized
  windows, reproduced by hand), restores a minimized window, and only activates Terminal
  when no tab matches, instead of failing.
- Run timeout is 60 s so the one-time macOS "control Terminal?" prompt can be answered.
- Cursor and other VS Code forks set `TERM_PROGRAM=vscode`, so the button raises VS Code;
  not needed now, parked.
- Not applied (Nice-to-have): Escape listener re-added on each state frame, no guard
  against double-clicked jumps, no body size limit on `/jump` and `/events`, subagent ids
  matched across all leads, a loose stage assertion in the panel test.

## Remaining work

- None from this milestone's Should-fix list.
- Next: m4-rebuild (on start, rebuild already-running sessions from the transcripts in
  `~/.claude/projects/`).
- Charter wording from m1 is still open (needs `workflow approve` after editing): the
  "done" stage for subagents, "HTTP hooks" vs the command hook, and no check for
  "rebuild running sessions on start".

## Notes

- Tests never run osascript or open: `startServer({ run })` records the commands.
- The panel e2e test serves the stream with `retry: 50` and a mutable state, so each
  reconnect gets the next frame.
- `npm start` fails with EADDRINUSE when an older Funtown still holds 4777; stop it first.
- Test/prod ratio is above the 0.5–0.7 band (repo 0.93), mostly from m2's fix tests.

## Numbers

    Branch m3-panel-jump vs ea17400
      Production: +193 -17, net 176 of budget 400
      Tests:      +248 -16, net 232 (test/prod 1.32 on this branch)
      Repo:       836 production lines, 774 test lines (test/prod 0.93; band 0.5-0.7)
