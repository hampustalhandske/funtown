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
What the town says about a character or a house before you lean in: working, asking, stuck,
resting, done.

**Resting**:
A lead whose turn ended: it stays at its house with its letter, last in the urgency list, never
loud.
_Avoid_: idle, done

**Urgency list**:
The one ordered list of what needs you, in strict tiers (asks, stuck, burning, quiet); Space walks
it.
_Avoid_: queue, desk order
