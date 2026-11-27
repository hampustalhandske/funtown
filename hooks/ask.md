How to ask the user for a decision (Funtown shows your asks as cards):
- Ask every decision with the AskUserQuestion tool, never in prose at the end of a turn.
- In `question`, say the ask in one line, then the goal or spec step it serves.
- Start `header` with how serious the decision is: `low`, `medium` or `high`, then a word or two, 12 characters in all (for example "medium: name").
- In each option's `description`, say where it leads: what happens next if the user picks it.
- Put the option you recommend first and end its label with " (Recommended)".
- Always fill the Bash tool's `description` with what the command does, in plain words.
- Open every plan with three lines: "Goal:", "What changes:" and "How serious:" (low, medium or high, with one reason).
