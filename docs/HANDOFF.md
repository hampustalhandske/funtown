# Milestone 2: cleanup — handoff

Verdict: ship. Every review finding is applied; tests are green.

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
- All review findings are applied in this PR, at the user's call: in away mode, every
  appropriate fix goes in before the PR, not only Must-fix.
- The `/code-review` pass reviewed the m1 merge commit instead of this branch; its findings
  that still held are fixed here (R1–R8 in docs/MILESTONE.md). It was not rerun.
- `Host` must be `127.0.0.1:<port>` or `localhost:<port>` on every route, against DNS
  rebinding. A later native wrapper that serves another host must add it.
- `install.ts` takes only `install|uninstall [--settings <path>]`; anything else exits
  before touching a file.

## Remaining work

None from this milestone's review.

Next: m3-panel-jump (charter items 4 and 5), then m4-rebuild.

## Notes

- `startServer({ port, goneAfterMs?, distDir? })` is the test entry point; tests point
  `distDir` at an empty temp dir.
- The repo test/prod ratio is 0.82, above the 0.5–0.7 band, because m2 added tests
  for fixes that are mostly a few production lines each.
- Headless Chromium doesn't fetch favicons; check icons through the page's `<link>`.

## Numbers

    Branch m2-cleanup vs 146bb7a
      Production: +72 -52, net 20 of budget 400
      Tests:      +126 -11, net 115 (test/prod 5.75 on this branch)
      Repo:       660 production lines, 542 test lines (test/prod 0.82; band 0.5-0.7)
