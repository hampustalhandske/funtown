# Milestone 2: cleanup — handoff

Verdict: ship. Both Must-fix items from the review are applied; tests are green.

## Review in five minutes

**Start here**
1. `server/app.ts:43-80`: `/events` now refuses any request with an `Origin` header (403)
   and keeps one removal timer per session, cancelled by that session's next event.
2. `server/app.ts:98-112`: `distDir` option and the 503 "page isn't built yet" reply.
3. `tests/server.test.ts:114-140`: the three new server tests (returning lead, Origin, 503).

**Verify**

    npx eslint . && npx vitest run && npx playwright test

**Needs you**
- Nothing to try by hand: m2 changes no visible behaviour beyond the removed "live" text
  and the new 🏠 tab icon. Open http://127.0.0.1:4777 after `npm start` to see both.
- Charter wording from m1 is still open (needs `workflow approve` after editing): the
  "done" stage for subagents, "HTTP hooks" vs the command hook, and no check for
  "rebuild running sessions on start".

## Summary

- Clears the m1 should-fix list; charter items 1–3 behave as in m1.
- The Town types live once, in `server/types.ts`; the page and tests import them.
- A session that comes back after ending is no longer deleted by its old 10 min timer.
- Web pages in your browser can no longer post fake events: requests with `Origin` get 403.
- An unbuilt page says so (503) instead of a bare 404; the page has a favicon.

## Decisions

- Origin check applies to `POST /events` only; the hook never sends `Origin`. The m3 jump
  endpoint will be called by the page itself, so it needs its own same-origin check.
- Favicon is an inline emoji SVG data URL in `web/index.html`: no file, no route.
- `startServer` takes `distDir` so a test can check the unbuilt-page reply.
- Review fixes applied in away mode: the favicon test now checks for the icon link
  (headless Chromium never requests `/favicon.ico`, so the old check could not fail); the
  tty hook test sets `FUNTOWN_LOG` to a temp file so it can't write to the real home.
- The `/code-review` pass reviewed the m1 merge commit instead of this branch. Its findings
  that still hold on this branch are listed below; it was not rerun.

## Remaining work

Should-fix, not applied:
- `server/app.ts:50`: `for await (const chunk of req)` sits outside any try. A client that
  drops mid-upload (the hook's own timeout) rejects the handler unhandled, which can stop
  the server. Wrap the body read and answer 400.
- `server/app.ts:60`: any POST with a `session_id` cancels the gone timer, even one
  `town.apply` ignored (no `hook_event_name`); that lead then stays "gone" forever. Cancel
  only for applied events.
- `server/app.ts:104`: the bare `catch` sends every read error on `/` to the 503 "not
  built" reply. Catch only `ENOENT`; log and 500 the rest.
- `hooks/funtown-hook.ts:46`: `remaining()` in `findTty` is outside `psRow`'s try, so a
  slow `ps` drops the whole event instead of posting it with tty null.
- `hooks/install.ts:53`: an unknown flag (`--setings`, `--settings=x`) is ignored and the
  real `~/.claude/settings.json` is edited. Reject unknown arguments.
- No `Host` header check: a DNS-rebinding page could read `/stream`. Accept only
  `127.0.0.1:<port>` and `localhost:<port>`.

Nice-to-have: `server/town.ts:156` counter keys never deleted on `remove()`; the SSE frame
built in two places in `server/app.ts`; `// fall through` comment at `server/app.ts:105`;
temp dir in `tests/server.test.ts:135` never removed.

Next: m3-panel-jump (charter items 4 and 5), then m4-rebuild.

## Notes

- `startServer({ port, goneAfterMs?, distDir? })` is the test entry point; tests point
  `distDir` at an empty temp dir.
- The repo test/prod ratio is 0.75, just above the 0.5–0.7 band, because m2 added tests
  while removing production lines.
- Headless Chromium doesn't fetch favicons; check icons through the page's `<link>`.

## Numbers

    Branch m2-cleanup vs 146bb7a
      Production: +40 -41, net -1 of budget 400
      Tests:      +63 -10, net 53 (test/prod n/a on this branch)
      Repo:       639 production lines, 480 test lines (test/prod 0.75; band 0.5-0.7)
