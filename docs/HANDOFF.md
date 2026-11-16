# Milestone 8: answer cards — handoff

Verdict: ship. Every review finding that holds is applied; the ones declined are under
Decisions with their reasons.

## Review in five minutes

**Start here**
1. `server/holds.ts` `event()`: when a held request counts as answered elsewhere. A wrong
   rule either closes a card nobody answered or leaves a stale one up.
2. `server/holds.ts` `hold()` and `hookOutput()`: what gets held, and the exact JSON Claude
   receives for each answer.
3. `hooks/funtown-hold.ts`: the hook Claude waits on; any failure must print nothing.

**Verify**

    npx eslint . && npx vitest run && npx playwright test

**Needs you**
- Run `npm run install-hooks` once: the two hold entries are new, so cards only appear
  after a reinstall.

## Summary

- Charter item 2, answer cards: a permission request (any session), or a question or plan
  (background sessions) shows a card under its lead and in its panel with the command or
  file and the folder. Allow and Deny, option picks with "Other", Approve and Keep planning
  with feedback go back to Claude through a held hook.
- A card answered in the terminal clears on the session's next event; with no page open
  or no listing for 10 s, Claude's own dialog takes over.
- Every closed card adds a line to `~/.funtown/answers.jsonl` (`by` funtown, elsewhere or
  dropped), for the "Answers through Funtown" check.
- m7's two test gaps are closed: unlisted expiry (`unlistedMs`) and the fake `--bg` env.

## Decisions

- Budget raised to 500 (user); net 468.
- Charter item 2 is split: the pop-up, sound, mute, desk queue, focus rules and stuck
  agents are m9-needs-queue; the queue after it moved up by one (user).
- Terminal sessions get permission cards only; their questions and plans stay in their
  terminal, since a held one shows only a spinner there (user).
- Hold timeout 7200 s (user). Claude kills the hook at exactly 7200 s, so the 2 h check
  answered at 7140 s.
- Release rule, narrowed in review: real PermissionRequest payloads carry no
  `tool_use_id` (checked in a real session), so a card's own call is matched by tool and
  input. A card closes on its own PostToolUse, a different PreToolUse, Stop, SubagentStop,
  UserPromptSubmit or SessionStart; a parallel sibling's PostToolUse no longer closes it.
- A lead leaving the list, no page for 10 s and a server stop log `by: elsewhere`; a hold
  never shown as a card writes no line (server's reading of the contract).
- A PermissionRequest for AskUserQuestion or ExitPlanMode is released at once; those are
  held at PreToolUse.
- Multi-select answers go as `"label, label"`; Claude read both labels in a real session.
- The real checks ran in this repo, not a scratch one: `--bg` can't accept a new folder's
  trust prompt. The test files were removed after.
- A refused answer shows the page's own text: the server sends no body.
- Declined from code review:
  - stamping `funtown.at` before the tty lookup in `funtown-hook.ts`: m8 must not change
    the event hook; it would make the own-call match less needed (see Remaining work);
  - identical back-to-back commands: the first card's own PostToolUse closes it, and both
    payloads come from one serializer;
  - a malformed AskUserQuestion input making a card unanswerable: Claude's tool schema
    requires string questions, and Esc in the terminal still drops it;
  - one broadcast per released hold: a handful of cards, and identical frames are skipped;
  - the "unlisted subagent's card belongs to the lead" rule in both server and page: one
    line each, and moving it would change what `Card.agent` means;
  - a sync write per closed card: one line per human answer;
  - five commit subjects over 50 characters: fixing them needs a force-push; the squash
    uses the PR title.

## Remaining work

- The ten findings a code review raised on m7's code are settled: four fixed in
  `fix/m7-review` (poll keeps running, newer hooks beat an older list, terminal size on
  connect, a new session leaves an open panel alone), two dropped as unlikely (version
  check wait, pty backpressure on loopback), four dropped as not issues (macOS prebuilds
  exist, Claude's own JSON types, the `--bg` id is the first hex word, the e2e fake is
  used by one spec).
- The event hook stamps `funtown.at` after up to four `ps` calls, so its events read up to
  800 ms late against holds; move the stamp first when the event hook may change.
- Next: m9-needs-queue (charter item 2, rest).

## Notes

- Real sessions (`--bg`, haiku, Claude Code 2.1.325): Allow ran `touch`; Deny reached
  Claude as "The user denied this in Funtown."; a question with a single and a
  multi-select answer; Keep planning with feedback gave a revised plan, Approve left plan
  mode; pressing `1` in the attached terminal cleared the card at once, the hold hook
  exited and the log said `elsewhere`; a subagent's card carried its `agent_id` and named
  `general-purpose-1`; while a question was held, `claude agents --json` said `busy` and
  the lead showed needs you.
- 2 h hold: a Write permission held 7152 s (hook still running, card still up); Allow
  then wrote the file and logged `by: funtown`.
- After Approve in a session started with `--permission-mode plan` from manual, Claude
  asked permission for the Write; s1 saw `acceptEdits` instead.
- The hold hook waits for its stdout write before exiting; a pipe write is async, and an
  early exit cut replies at 64 KB.

## Numbers

    Branch m8-answer-cards vs 8e56927
      Production: +505 -37, net 468 of budget 500
      Tests:      +601 -7, net 594 (test/prod 1.27 on this branch)
      Repo:       1,816 production lines, 2,026 test lines (test/prod 1.12; band 0.5-0.7)

Test/prod 1.27 is above the 0.5-0.7 band (test bloat): every release path and card kind
has its own test; trim candidates for a later review.
