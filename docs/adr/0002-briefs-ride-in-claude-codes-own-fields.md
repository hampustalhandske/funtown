# Briefs ride in Claude Code's own ask fields, never in parsed prose

Every card at the Desk carries a decision brief: the ask in one line, the goal it serves, each
option and where it leads, the agent's pick and how serious it is. A short ask text at SessionStart
asks agents to write each part into a field Claude Code already has: the question, the header, each
option's description, Bash's description and a plan's top lines. Funtown shows them as written. It
reads only two things: the position of the first option whose label ends " (Recommended)", which is
the pick, and one exact word at the start of the header (`low`, `medium` or `high`, up to a colon or
a space), which is the level. Letters stay "as written, never parsed".

We weighed parsing a "Needs you:" line in letters (a contract change, and prose drifts), a side file
the agent writes (a new channel to keep in sync with the ask), and no agent text at all (facts only,
which is the "not enough context" the user answers in Terminal.app to escape). One Haiku run on
2026-11-20 wrote every field as asked.

## Consequences

- When an agent ignores the ask text, the card still shows every Funtown fact and Claude Code field,
  "not stated" for a question's severity, and no pick.
- Changing what agents write means changing the ask text, never a parser.
