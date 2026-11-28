# Funtown

Funtown shows every Claude Code session across your projects as a town you tend, with the real
terminal one key away. These are the words its specs and code use.

## Language

**The app**:
Funtown's own window on the Mac, showing the town and the work view. Say "Mac app" where the Mac
must be said.
_Avoid_: shell, wrapper, desktop app

**Open time**:
The time from the click or key that shows a session's terminal to its text being visible in it.
_Avoid_: load time, attach time

**Early attach**:
A session's `claude attach` started once its panel has been open 300 ms, before the terminal is shown.
_Avoid_: warm client, pre-attach, keep-alive

**Detach**:
Claude's attach client ends while the session keeps running.
_Avoid_: close, exit (Close session stops the session)

**Terminal sheet**:
The large sheet over the town or the list that holds a session's panel column and its terminal
while the terminal is shown.
_Avoid_: modal, overlay, fullscreen

**Typing place**:
A text box or the terminal, where every key is typing and Funtown takes none. Cmd+Esc leaves the
terminal.

**Card**:
One held ask (a question, a plan or a permission) waiting at the Desk.

**Decision brief**:
What every card carries: who asks and where, the ask in one line, the goal it serves, the options
and where each leads, the agent's pick, how serious it is, and the Queen's word when asked.
_Avoid_: card (the thing on screen that shows it)

**Ask text**:
The short text printed at SessionStart that tells agents how to write their part of the brief.
_Avoid_: letter (the letter is a separate text, off on this Mac)

**Severity**:
How much a decision can cost if it goes wrong: low, medium, high, or not stated.
_Avoid_: door, priority, urgency (urgency orders the list)

**The agent's pick**:
The option the agent recommends: the first option whose label ends " (Recommended)".

**Bare permission**:
A permission no agent wrote a brief for; its card shows facts only.

**Heavy card**:
A card whose severity is high or not stated.
_Avoid_: urgent

**Stakes box**:
What a heavy card opens above its options: the reason, the exact command for a permission, the
agent's own words and the last step.

**Act row**:
The row with the button that sends the card's choices; it stays on screen.
_Avoid_: footer

**Armed**:
A card Enter would answer right now.
_Avoid_: ready, active

**Undo window**:
The 1.5 s after Enter or Q before the send goes out; Esc stops it.

**The marked house**:
The house the arrow keys have reached; Enter goes in.
_Avoid_: selected, focused, cursor

**The Queen**:
The steward as the town shows her: the one session that reviews PRs and gives her word on cards
when asked. Say steward in the code and contracts.

**The Queen's word**:
Her second opinion on one card, asked for by the user: Pick, Why and Check first. Advice; it never
answers the card.
_Avoid_: suggestion, recommendation (the agent's pick is the recommendation)

**Ask the Queen**:
The user's act that sends one card to her for her word.

**Project**:
A folder the user added to Funtown.
_Avoid_: repo (two checkouts of one repo are two projects)

**House**:
One project in the town, holding every session in its folder or a folder inside it.
_Avoid_: building (the look's word for the model, not the idea)

**Run**:
A background session started from Funtown with a prompt; it works in its own worktree.

**Worktree**:
A second checkout of the same repo on its own branch; a run's sits inside its project folder, so
the run stays in the project's house.

**Phase file**:
The one small file a project keeps (`.claude/phase.json`) to tell Funtown what Claude Code and
GitHub can't.
_Avoid_: status file, manifest

**Phase**:
Where a project stands in its own workflow, in that workflow's own word.
_Avoid_: stage (in the code a Stage is a character's state)

**Steps**:
A workflow's phases in order; next is the step after the phase.

**Goal (of a project)**:
One line on where the project is heading.
_Avoid_: intent, mission

**Glance state**:
What the town says about a character or a house before you lean in. A character: working, asking,
stuck, resting, done. A house: no fire, handled, burning, or a PR waiting for you.

**Fire**:
A house with a failed PR: any of its PRs has a red check state. One thing, a check failed.
_Avoid_: broken, red house

**Burning**:
A fire while no lead of the house works. It is loud, tier 3 of the urgency list.

**Handled**:
A fire while any lead of the house works, a run in its worktree included. Not in the urgency list.

**Who holds the bucket**:
Any lead of the house that is working: it decides burning from handled.

**Fog**:
A house whose PRs Funtown could not look at lately: its PR list never worked since the server
started, or last worked over 3 minutes ago. Its fire is quiet (first in tier 4, "failed when last
read") and no PR waits for you there. The steward's own house, which has no PR list, is never in
fog. Fog is not a state of the house's work: Funtown could not look.
_Avoid_: neglect, stale, idle

**The loud thing**:
The one entry the town makes noise for: the head of the urgency list when it is in tiers 1 to 3.

**Calm**:
Nothing in tiers 1 to 3 and nothing unknown. Quiet entries (a rate limit, a PR waiting for you,
a resting lead) leave the town calm.

**A PR waiting for you**:
A PR with nothing failed and nothing running (green, or no checks), in a house where no lead
works and which is not in fog. A quiet entry, tier 4, never alerting.

**Check state**:
What a PR's checks say, as gh's buckets read them: red (any check failed, a workflow that never
started included), running (none failed, one still going), green (all settled: passed, neutral,
skipped or cancelled) or none (the PR has no checks, which is never green).
_Avoid_: CI status, build status

**Resting**:
A lead whose turn ended: it stays at its house with its letter, last in the urgency list, never
loud.
_Avoid_: idle, done

**Urgency list**:
The one ordered list of what needs you, in strict tiers (asks, stuck, burning, quiet); Space walks
it.
_Avoid_: queue, desk order
