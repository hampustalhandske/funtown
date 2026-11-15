# Milestone 1: town — handoff

Verdict: ship. All five must-fix review items are applied; tests are green.

## Review in five minutes

**Start here**
1. `hooks/install.ts`: edits your real `~/.claude/settings.json`. Check that it only adds
   and removes Funtown's entries, and the install record in `~/.funtown/installed.json`.
2. `hooks/funtown-hook.ts`: runs inside every Claude Code session. Check the 900 ms
   deadline and that it always exits 0.
3. `server/town.ts`: turns hook events into stages (working, needs you, done, gone).

**Verify**

    npx eslint . && npx vitest run && npx playwright test

**Needs you**
- Live check: `npm run install-hooks`, `npm start`, open http://127.0.0.1:4777, then start
  `claude` in another project folder. Within 5 s `lead-1` should appear at a house named
  after that folder; trigger a permission prompt and it should turn 🔴 "needs you".
  `npm run uninstall-hooks` removes the hooks again.
- Real Claude Code payloads (`notification_type` values, `agent_id` on subagent events) are
  only checked against the docs, not a live session.
- The UI review left a server on port 4790: `lsof -ti tcp:4790 | xargs kill`.
- Charter wording to decide on (needs `workflow approve` after editing): subagents use a
  "done" stage the charter doesn't define; the hooks open question says "HTTP hooks" but the
  build uses a command hook (needed to read the tty); "rebuild running sessions on start"
  has no check.

## Summary

- Item 1: every Claude Code session shows as `lead-N` at a house named after its project
  folder; subagents show as `<agent type>-N` next to their lead.
- Item 2: a permission prompt, question or finished turn turns the lead 🔴 "needs you",
  with a red banner across the top.
- Item 3: each character shows its stage and current tool or command, e.g. `Bash: npm test`.

## Decisions

- Command hook, not an HTTP hook: only a process can read the session's tty for the m2 jump.
- Install records what it created so uninstall restores your settings exactly (user chose
  this over treating empty hook lists as missing).
- Hook deadline 900 ms overall; when Funtown isn't running the hook logs one line to
  `~/.funtown/hook.log` and exits 0.
- A server error applying an event returns 500 and is printed to the server's stderr.
- Stack: Node 22 + TypeScript (runs directly, no build), React + Vite, plain CSS, emoji art.
- `lead-N` is numbered per house; subagents per lead and agent type.
- Commits re-authored to the GitHub noreply address before the first push.

## Remaining work

Should-fix, not applied:
- The Town types are written three times: `server/types.ts`, `web/src/town.ts`,
  `tests/helpers.ts`. Import the server's from web and tests.
- Unused dev-server proxy in `vite.config.ts` and the `dev` script in `package.json`.
- "live / connecting" indicator in `web/src/App.tsx` that no task asked for.
- `server/town.ts`: a session that comes back after SessionEnd is still deleted by the old
  10 min timer. Cancel the timer when a gone lead returns.
- Any web page open in your browser can POST fake events to 127.0.0.1:4777. Reject requests
  that carry an `Origin` header (the hook never sends one).
- `.gitignore`: `data/` matches folders at any depth; use `/data/`.
- `tests/hook.test.ts`: the tty check only asserts the key exists.
- `server/app.ts`: a missing `web/dist` shows as 404 instead of saying the page isn't built.
- Missing favicon (404 in the console).

Next: m2-panel-jump (charter items 4 and 5, plus rebuilding running sessions on start).

## Notes

- Tests never touch your home folder: they set `FUNTOWN_URL`, `FUNTOWN_LOG`,
  `FUNTOWN_STATE` and `--settings` to temp paths.
- The hook's deadline doesn't cover reading stdin; Claude Code closes stdin after the event.
- Install rewrites `settings.json` as 2-space JSON: same content, possibly new formatting.
- `.claude/never-push`, `.claude/settings.json`, `docs/ideas.md` and the approval file are
  gitignored on purpose.

## Numbers

    Branch m1-town vs e8306c9
      Production: +640 -0, net 640 of budget 800
      Tests:      +427 -0, net 427 (test/prod 0.67 on this branch)
      Repo:       640 production lines, 427 test lines (test/prod 0.67; band 0.5-0.7)
