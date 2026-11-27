# The Desk: every ask with its brief

Status: ready-for-agent
Serves: GOAL.md, "Desk: whatever needs you ... comes with the context to answer it well: which
goal and spec it serves, the options and what each leads to, what the agent proposes and what the
Queen suggests, and how serious the decision is ... Short keyboard commands do the rest", and the
success line "Answers go through Funtown" ("not enough context" is the second of the two reasons
answers still go through Terminal.app).

## Problem Statement

When a session needs me, Funtown's card doesn't give me enough to answer. In my words: "the card
showed the agents running and often not any text at all from the agent only sometimes the proposed
answer." A permission shows a command and a folder. A question shows its options, but not which one
the agent would take, what each one leads to, which goal it serves, or how much is at stake. So I
open the terminal to find out, or I answer there in the first place.

Answering is slow, too. Option+N is the only key. Enter in a card's form sends whatever is chosen,
whatever it risks. Esc closes the whole pane and loses a reply I was typing.

The castle also fills with leads that only finished a turn. Every finished turn queues at the desk
next to the real asks, so the queue doesn't tell me what is waiting on me.

The Queen can review a PR, but I can't ask her what she thinks of a card before I answer it.

## Solution

Every ask that waits at the Desk (a question, a plan or a permission) comes as a card with its
**decision brief**:

- who asks and where;
- the ask in one line;
- the goal it serves;
- each option and where it leads;
- the agent's pick, already chosen;
- how serious it is, and why.

The agents write their part into fields Claude Code already has, because a short **ask text** at
SessionStart tells them how. Funtown adds the facts it knows (project, lead, phase, step n of m,
the project's goal and spec lines) and works out the severity and the pick. Nothing is parsed from
prose.

The card is take C, "Weighed". The options are tiles, and the agent's pick wears an "Agent's pick"
ribbon. Severity shows as a three-step weight meter with its word and reason. Above all, it shows
in how much the card opens:

- **Low:** one compact row.
- **Medium:** the options stacked.
- **High and "not stated":** a stakes box first (the reason, the exact command, the agent's own
  words, the last step), every consequence in full, the Queen offered before the act, and a button
  that names what it sends.

The act row stays at the bottom of the panel, or of the 19rem column beside a shown terminal, so
the answer is always on screen. The panel is 32rem wide while it holds a card.

I can press **Ask the Queen** (or Q) on a card. One press sends one request to the steward session.
Her word comes back on the card as three labelled parts (Pick, Why, Check first), as written. It
never answers the card.

Keys make answering quicker than in a terminal:

- **Space** goes to the next thing that needs me, and Shift+Space goes back.
- **Enter** sends a low or medium card once it has been on screen for a second. A 1.5 s undo window
  follows, and Esc stops it.
- **1 to 4** choose an option. **Q** asks the Queen. **D** shows the raw detail.
- **R** puts the cursor where a reply is typed. **M** opens the next letter. **L** flips between
  the town and the plain list. **?** opens the key sheet.
- **The arrows** move a mark between houses, and Enter goes into the marked house.

A key never answers a card by accident.

A lead that only finished a turn **rests** at its house with its letter. It is last in the Space
list and never loud. The castle holds only what is waiting on me.

Funtown also logs where each ask was answered: on a card, in Funtown's own terminal, elsewhere,
never shown, or dropped. It logs each ask's severity and whether the Queen was asked. That lets the
five-day test count the share of answers given in Funtown.

## User Stories

**The brief on every card**

1. As the user, I want every card to say who asks (the lead, or the subagent and the lead it works
   under), in which project, and how long it has waited, so that I know whose work I'm deciding on.
2. As the user, I want a question card to show the agent's question as written, so that the ask is
   in the agent's own words.
3. As the user, I want a question card to show its `header` as the question's topic, so that I can
   tell several questions apart at a glance.
4. As the user, I want each option to show its label and, under it, where it leads (the option's
   description), so that I can see the consequence of each choice.
5. As the user, I want the option the agent recommends to be already chosen and marked "Agent's
   pick", so that agreeing with the agent costs me one key.
6. As the user, I want no option chosen when the agent marked none as recommended, so that Funtown
   never invents a pick.
7. As the user, I want " (Recommended)" dropped from the label on screen, since the ribbon says it,
   while the raw detail keeps the label as sent, so that the text isn't said twice and the original
   is still one key away.
8. As the user, I want a plan card to show the plan's top lines (Goal, What changes, How serious)
   as written above Approve and Keep planning, so that I see what I'm approving without reading the
   whole plan.
9. As the user, I want Keep planning to open a note box whose text goes back to the agent, so that
   I can say what to change.
10. As the user, I want a permission card to show Bash's own description as its one-line ask, and
    the exact command in a mono box, so that I read both the intent and the real thing.
11. As the user, I want a permission card without a description to say what the tool does to which
    path ("Edit server/town.ts"), so that a bare permission still reads as a sentence.
12. As the user, I want every card to show the goal it serves (the project's goal line, its spec
    line, and phase and step n of m from the phase file, beside the agent's own words), so that each
    decision comes with what it means for my goals.
13. As the user, I want a card from a project without a phase file to show no goal line, never a
    guess, so that the card never lies.
14. As the user, I want the card to show what the character was doing last and to have its newest
    letter one key away, so that I can see the context without opening the terminal.
15. As the user, I want the whole `tool_input` as sent one key away (D), including an option's
    preview, a plan's file path and a permission's suggestions, so that the real request is never
    hidden.
16. As the user, I want the same brief at the castle and in the plain list, so that I learn one
    card.

**Severity**

17. As the user, I want every card to carry a severity (low, medium, high or "not stated") with its
    reason and who set it, so that I know how much a wrong answer could cost.
18. As the user, I want a question's severity to be the agent's word (the first word of its header,
    read up to a colon or a space), so that the one who sees the stakes says them.
19. As the user, I want a question with no level word to be "not stated", never low, so that
    unknown stakes are never shown as small.
20. As the user, I want a card with several questions to take the highest level (any high makes it
    high, else any "not stated", else the highest stated), with each question showing its own word,
    so that one serious question isn't hidden by easy ones.
21. As the user, I want every plan to be medium, raised to high when the plan's own "How serious"
    line says high and never lowered by it, with that line shown as written, so that approving edits
    is never treated as trivial on the agent's word alone.
22. As the user, I want a permission's severity to come from Funtown's rule over the tool and the
    command, with its reason ("git push: leaves this Mac"), so that a bare permission still has its
    stakes.
23. As the user, I want "not stated" to read as high on the card ("The agent didn't say how serious
    this is. Read it as a high one."), so that I treat unknown stakes with care.
24. As the user, I want each level to show as a word and a shape as well as a colour, so that
    severity reads without colour.
25. As the user, I want a high or "not stated" card to open its stakes box (the reason, the exact
    command for a permission, the agent's own words, the last step) and show every consequence
    uncut, so that a serious ask asks me to read more rather than shouting.
26. As the user, I want a heavy card's button to name what it sends ("Answer: Dry run first",
    "Allow once"), so that a click is a deliberate act and not a habit.

**Long text**

27. As the user, I want a long ask and each long consequence cut at three lines with "more" to open
    the rest in place (never cut on a heavy card), so that a medium card fits without hiding
    anything for good.
28. As the user, I want the act row to stick to the bottom of the panel or the column, so that a
    long card never pushes the answer out of reach.
29. As the user, I want the panel to be 32rem wide while it holds a card and the card to sit in the
    19rem column when the terminal sheet is shown, so that a medium card fits at 1280 x 800 and the
    terminal keeps its room.

**The Queen's word**

30. As the user, I want an "Ask the Queen" button (Q) on every card when her word is on, so that I
    can get a second opinion before I answer.
31. As the user, I want one press to send exactly one request, and a second press to send nothing
    while her word is queued, being written or ready, so that usage never runs away.
32. As the user, I want only a failed word to be asked again ("Ask again"), so that a re-ask is a
    deliberate retry.
33. As the user, I want no Queen button on the Queen's own cards, so that she is never asked about
    herself.
34. As the user, I want the Queen's slot to say where her word is (asking, she is coming, she is
    busy and this is next, she is writing, ready, failed with why), so that I know whether to wait.
35. As the user, I want her word to show as written in three parts (Pick, Why, Check first), and her
    pick not marked on the options, so that it stays advice with her name on it.
36. As the user, I want Enter to take the agent's pick, never hers, and Funtown never to answer a
    card from her word, so that I decide.
37. As the user, I want a word that is still queued when the card closes to be dropped and never
    sent, so that it costs nothing.
38. As the user, I want a word with no reply in 5 minutes to show "no word" and let her next
    request go, so that a stuck word never blocks her.
39. As the user, I want her words to go before her queued PR reviews, so that an agent held still
    waits less.
40. As the user, I want asking her to lift the pause my own chat with her set, as asking for a
    review does, so that pressing the button counts as asking.
41. As the user, I want her word to have its own off switch (its own prompt file, empty = off,
    shipped with a prompt), so that I can turn it off without turning off her reviews.
42. As the user, I want her text fetched by its letter id, so that a word that lands after a review
    never pushes the review out of reach, or the other way round.
43. As the user, I want her to answer from the card alone (the brief and the raw input cut at 8,000
    characters, no tools, the text treated as data), so that a word is one cheap call and can't be
    steered by the agent's text.

**Keys**

44. As the user, I want Space to go to the next item of the urgency list (open its pane and mark its
    house), wrapping, and Shift+Space to go back, so that I walk everything that needs me with one
    key.
45. As the user, I want Enter on an open card to send what is chosen only when the card is armed (a
    low or medium question with a choice in every question, or a medium plan; the only card in the
    pane; on screen for 1 second; not a key repeat), so that Enter can't answer the wrong card.
46. As the user, I want the 1 second to restart when focus leaves a text box or the terminal and
    when the window comes to the front, so that an Enter meant for something else can't answer the
    card.
47. As the user, I want Enter never to answer a high card, a "not stated" card, a high plan or a
    permission, with "Click to answer" shown there, so that serious asks need a deliberate aim.
48. As the user, I want a 1.5 s undo window after Enter ("Sending... Esc to undo", a draining
    line), where Esc stops the send and Space sends at once and moves on, so that a misread pick can
    be caught.
49. As the user, I want the same arm rule and undo window on Q, so that asking the Queen is never an
    accident.
50. As the user, I want an `Enter` keycap on the button only while the card is armed, so that its
    absence teaches me which cards Enter skips.
51. As the user, I want 1 to 4 to choose that option on a one-question card (toggling on a
    multi-select) and never send, with keycaps before each option, so that I can change the pick
    without the mouse.
52. As the user, I want D to show or hide the raw detail, so that the real request is one key away.
53. As the user, I want R in a background lead's pane to put the cursor in the reply box when the
    terminal is hidden, and in the terminal when it is shown, so that I reply where replies go.
54. As the user, I want M to open the pane of the character with the newest letter, then the next
    newest, wrapping, so that I can read what was finished.
55. As the user, I want L to flip between the town and the plain list, keeping the house I'm at, so
    that the plain facts are one key away.
56. As the user, I want ? (or a keyboard icon in the icon row) to open the key sheet as a pane, so
    that I can learn the keys without words on the town.
57. As the user, I want the arrow keys in the town, with no pane open, to move a mark to the nearest
    house that way on screen, showing its name plate, and Enter to go into the marked house, so
    that I can move around without the mouse.
58. As the user, I want "back the way I came" to return to the house I came from, and an arrow with
    no house that way to leave the mark where it is, so that the arrows feel predictable on an
    island that isn't a grid.
59. As the user, I want Esc to close one layer per press (the undo window, a text box with its text
    kept, the key sheet, a pane, the classroom, the mark), so that I never lose a typed reply.
60. As the user, I want Funtown to take no key while I type in a text box or the terminal, nor any
    key with Cmd, Ctrl or Option held, nor during an IME composition or a dead key, so that typing
    is always typing.
61. As the user, I want a card's form not to send on Enter by itself, so that the arm rule is the
    only key path to an answer.
62. As the user, I want a mouse click never to leave a button focused, so that a stray Space or
    Enter never presses it again.
63. As the user, I want Option+N retired for Space, and the plain list's hint to say "Space: next",
    so that there is one key per action and no Option key.
64. As the user, I want icon titles to name their key ("Work view (L)"), so that I learn the keys
    where I already look.

**Resting and the urgency list**

65. As the user, I want a lead whose turn ended to rest at its house with its letter instead of
    queueing at the castle, so that the castle shows only what waits on me.
66. As the user, I want one urgency list (asks, then stuck, then quiet things: stuck on a rate
    limit, then resting leads), oldest first within each, to drive Space, the plain list's order
    and the castle queue, so that every view agrees on what comes next.
67. As the user, I want a resting lead and a lead stuck on a rate limit never to chime, toast or
    notify, so that "loud" means "act now".
68. As the user, I want a lead that asks in prose at the end of a turn still to be reachable (in the
    Space list as resting, its letter one key away), so that nothing is lost when an agent ignores
    the ask text.

**The ask text**

69. As the user, I want a short ask text printed at SessionStart, beside the letter, telling agents
    to ask decisions with AskUserQuestion, to start the header with low, medium or high, to say
    where each option leads, to put their pick first with " (Recommended)", to fill Bash's
    description and to open every plan with Goal, What changes and How serious, so that every card
    has its brief.
70. As the user, I want the ask text in its own file with its own override in my Funtown folder
    (empty = off), so that I can change or switch it off without touching the letter.

**The phase file**

71. As the user, I want a project's phase file to be able to say its goal (one line on where it is
    heading) and its spec (the spec or feature now), so that the card and the plain list's row can
    show them.
72. As a writer of phase files, I want unknown fields ignored, fields only ever added, and a `goal`
    or `spec` that isn't a string dropped while the rest of the file stays, so that old and new
    writers never break each other.
73. As the user, I want `goal` and `spec` shown on the plain list's row next to the phase and note,
    and never as words in the 3D town, so that the town stays wordless.

**The answer log**

74. As the user, I want each closed ask logged with where it was answered: `funtown` (on a card),
    `terminal` (typed in Funtown's own terminal for that lead), `elsewhere`, `unshown` (never
    carded: a terminal lead's question or plan, or no page open) or `dropped`, so that the five-day
    test can count the share given in Funtown.
75. As the user, I want each log line to carry the card's kind, its severity level and source, and
    whether the Queen was asked, so that a short share can be split by kind and severity.
76. As the user, I want an unshown ask logged with why it wasn't shown, so that a habit (starting
    sessions in a terminal) can be told from a defect.

## Implementation Decisions

**The brief's parts and where they come from**

- A card's brief is built from what Claude Code already sends plus Funtown's own facts. Funtown
  reads only position and one exact word from agent text: the first option whose label ends
  " (Recommended)" is the pick, and a header's first word (up to a colon or a space) is the level.
  Letters stay "as written, never parsed". This beat parsing a "Needs you:" line in letters (a
  contract change, left out) and a side file the agent writes (a new channel to keep in sync).
- The subagent's task line is left out: no field carries an Agent call's description to Funtown
  today. A subagent's card shows its name, its role and the lead it works under.
- "For which goal": the project's `goal` and `spec` lines and "phase, step n of m" (the phase's
  position in `steps`) from the phase file, beside the agent's own words. With no phase file there
  is no goal line.

**The ask text**

- A new file in the hooks folder, printed at SessionStart beside the letter by the same installed
  hook pattern: the user's own file in the Funtown folder overrides it, and an empty file turns it
  off. It is about 200 tokens per session start. Its words start from the text tested on
  2026-11-20 (one Haiku run passed all six checks). It beat folding the brief into the letter (the
  user turned the letter off for its cost) and no text at all (briefs would be facts only).
- `npm start` reinstalls hooks as today, so the ask text reaches sessions started after it.

**Severity (server side, one pure module)**

- Levels: `low`, `medium`, `high`, and `unstated` (shown as "not stated"). A card carries
  `severity: { level, reason, source }`, where `source` is `rule` (Funtown's permission rule),
  `agent` (the header word, or a plan's own "How serious: high") or `kind` (a plan's medium by
  default). The reason is one short line ("the agent's word: medium: data", "Funtown's rule: git
  push leaves this Mac", "Funtown's rule: every plan is medium", "the agent didn't say").
- A question card also carries one entry per question, in the order of `input.questions`:
  `{ level, pick }`, where `pick` is the index of the recommended option or null. The card's level
  follows the several-questions rule (any high, else any unstated, else the highest stated).
- A plan is `medium` (source `kind`), raised to `high` (source `agent`) when the plan's own "How
  serious:" line, among its first lines, starts with `high`; never lowered.
- The permission rule, over the tool and, for Bash, each part of the command split at `&&`, `||`,
  `;` and `|` (the card takes its highest part):
  - **high** (leaves this Mac or can't be walked back): `git push`; any `gh` subcommand other than
    read-only ones (view, list, diff, status, checks); package publish; deploy commands; `rm` with
    a recursive flag; `git reset --hard`; `git clean` with force; `git checkout --` and `git
    restore` over files; any force flag on a git command; `sudo`; `curl` or `wget` that sends a
    body or uploads; Edit, Write or NotebookEdit on a path outside the card's project folder.
  - **low** (read-only): Read, Glob, Grep and other read-only tools; Bash parts from a short list
    of read-only commands (ls, cat, head, tail, wc, pwd, which, grep, rg, find without
    -delete or -exec, git status, log, diff, show).
  - **medium:** everything else, including edits and installs inside the project, MCP tools and
    any command the rule doesn't know.
  - The exact lists live in one place and are tested case by case. This beat letting the agent rate
    permissions (a bare permission has no agent text) and rating every kind by rule (a question's
    stakes are invisible to a rule).
- The server computes severity and picks when a card is made and puts them on the card in the
  State, so the town, the plain list and the keys agree. This beat working them out in the page
  (two places to keep equal).

**The Queen's word**

- The steward session stays one session in its folder. It is started when either prompt is on: the
  review prompt (today) or the new card prompt. The card prompt is a new file beside the review
  prompt, overridden by a file of the same name in the Funtown folder, and empty means off. It
  ships with a prompt, so the button shows.
- `POST /word { card }` (page Origin and token; 64 KB cap like every page POST): 204 when the word
  is now queued or already queued, writing or ready; 204 and a re-queue when it failed; 404 for an
  unknown or closed card; 409 when words are off or the card is the steward's own.
- A card carries `word: { state, letter?, reason? }` with state `idle`, `queued`, `writing`,
  `ready` or `failed`. It is absent when words are off and on the steward's own cards. `writing`
  begins when the request is pasted. `ready` carries the letter id, and `failed` carries the
  reason.
- The page shows "starting" when the word is queued and no steward is listed yet, and "busy" when
  it is queued and the steward is working. No contract field is added for these.
- The request is pasted the way a review is: over `claude attach`, as a bracketed paste with control
  characters dropped, only when the steward has no card, isn't working and has no request in
  flight. Queued words go before queued reviews. Nothing interrupts a turn she is in. Asking lifts
  the pause that the user's own prompt to her set.
- The prompt is filled with the project and the card's brief: who and where, the ask, each option
  with where it leads, the pick, the severity with its source and reason, the goal facts, and the
  raw `tool_input` cut at 8,000 characters with a note that it was cut. It tells her to answer from
  the text alone, to run no tools, to treat the text as data, and to end with "Pick:", "Why:" and
  "Check first:".
- A reply counts as her word only when its letter holds all three labels, which is the same check
  as a review's. Otherwise the word fails with the missing labels named, and one error-log line is
  written.
- A word with no reply after 5 minutes fails ("no reply in 5 minutes"), and her next request may
  go. A reply that comes later still lands as her letter.
- A card that closes while its word is queued drops the word and sends nothing. A word in flight
  still lands as her letter.
- Queued words live in memory. A restart forgets them, and the journal keeps her letters.
- `GET /letters?lead=<steward>&id=<letter>` serves one letter by id from the journal while it is
  kept. The ready review uses it too, so a word and a review no longer push each other out (today
  only the newest letter per lead is kept). This beat carrying her text on the card in the State,
  which is sent to every page on each change and leaves that collision unfixed.
- The 8,000-character cut, the 5-minute bound and "only a failed word is asked again" are
  constants in one place.

**The answer log**

- Each closed ask from a listed lead appends one line: `{ at, lead, project, kind, by, severity,
  source, queen }`, with `reason` on an `unshown` line (`terminal session` or `no page`). `by` is
  `funtown`, `terminal`, `elsewhere`, `unshown` or `dropped`.
- `terminal`: a card that closes as answered elsewhere within 10 seconds after an input frame on
  one of Funtown's own `/term` sockets for that lead. The 10 seconds is a constant. A live check
  confirms that it tells the two apart.
- `unshown`: a listed terminal lead's question or plan, which is answered 204 at once as today, and
  any ask while no page is open. Asks from unlisted sessions are still not logged.
- `queen` is true when a word was asked for that card.

**The phase file**

- The phase file gains optional `goal` and `spec` (each one line). A value that isn't a string is
  dropped and the rest of the file stays. They reach the page on the house's phase. Unknown fields
  stay ignored. The names `dates` and `practice` are kept free, and there is no version field.
  Nobody writes the file in a project without the workflow.

**The page**

- One pure **urgency list** function replaces the desk order. It produces tier 1, asks (cards first,
  then other asks, oldest first); tier 2, stuck except on a rate limit (oldest first); and tier 4,
  quiet (stuck on a rate limit, then resting leads, oldest first). Tier 3, burning houses, is spec
  3's. Space, the plain list, the castle queue and the alerts all read it. Only tiers 1 and 2
  chime, toast or notify.
- **Resting** is worked out in the page: a lead whose `needs` is "turn ended" rests at its house
  (standing by its door with its letter), never in the castle queue. The server's State is
  unchanged: the stage stays `needs_you` with `needs` "turn ended". This beat a new server stage (a
  contract change for what is a reading of the same facts).
- One **keys** module owns every page key: the typing-place check, the modifier and composition
  rules, key repeat, the arm rule, the undo window and the Esc layer order. Cards, panes and the
  town register into it rather than each adding its own window listener. Cmd+Esc stays as spec 1
  built it.
- **Arm rule:** armed when the card is low or medium and every question has a choice (or a medium
  plan), it is the only card in its pane, and 1 second has passed since the latest of: the card
  appearing, focus leaving a typing place, and the window coming to the front. Repeat key events
  are ignored. The answer names the card the pane shows. A card that is already closed answers
  "already closed".
- **Undo window:** 1.5 s after Enter or Q. Esc stops it, and Space sends at once and moves on.
- **`nextHouse(points, from, direction, lastMove)`**, a pure function over each house's door
  projected to the screen with the camera at the key press:
  - Candidates lie forward (`forward > 0`) and within `sideways <= 2 x forward`.
  - The winner is the smallest `forward + 2 x sideways`. Ties go to the smaller straight-line
    distance, then to the folder name.
  - Back the way you came returns to where you came from.
  - With no candidate, the mark stays.
  - With no mark yet, the first press marks the house nearest the screen's middle, or the last
    marked house if the town still has it.
  - The castle is not a stop.

  This beat a fixed house order (it feels random on an island) and world directions (the camera
  tilts).
- **The card** is take C "Weighed", as drawn in the prototype and described in the Solution. The
  severity colours and words live in one place. A mouse click blurs the button it pressed, page
  wide. Card forms prevent implicit submission.
- **The key sheet** is a pane listing every key, opened by ? or a keyboard icon in the icon row.
- **R** focuses the reply box when the terminal is hidden (the sheet stays closed) and the
  terminal when it is shown. **L** loads the other page, keeping the house (`/work.html#<cwd>`,
  back to `/`), so an open terminal closes this stretch. **M** walks letters newest first and
  keeps no "read" memory.

**Contract and doc lines that change (CLAUDE.md), each with the ticket that builds it**

- Map, `hooks/`: gains the ask text and its override.
- Map, `needs.tsx`: "`waitingList`, the desk order, card kinds first then oldest" becomes the
  urgency list's tiers. The keys module is added, and the `AnswerCard` line changes.
- State: each card carries `severity` (level, reason, source), per-question `{ level, pick }` on a
  question card, and `word` (absent when words are off or on the steward's own cards; `idle` until
  asked).
- Workflow: the phase file line gains `goal?, spec?` and the growth rule. The steward sentence gains
  "and one per asked card, only after `POST /word { card }` (`server/steward-card.md`; overridden
  by `~/.funtown/steward-card.md`, empty = off; before queued reviews; a reply counts as her word
  only with its three labelled parts)".
- Letters: "`GET /letters?lead=`" becomes "`GET /letters?lead=` (`&id=` for a steward's review or
  word, from the journal)".
- Holds: "log `by` funtown, elsewhere or dropped" becomes "log `by` funtown, terminal (typed in
  Funtown's own terminal for that lead), elsewhere, dropped or unshown (an ask from a listed lead
  that was never carded: a terminal lead's question or plan, or no page open), with the card's kind
  and severity".
- Page token: `/word` joins the list that needs the Origin and the token.
- Decisions that bind: "only the steward gets requests (reviews)" becomes "only the steward gets
  requests (reviews, and her word on a card the user asks for)". This line, the ADRs and the
  glossary terms land with this spec, before the tickets.

## Testing Decisions

- **A good test** checks what the user or the next program sees: the State a page receives, the
  bytes the fake `claude attach` gets, the answer log's lines, the hook's output, the card on the
  page, what a key does. It never checks component state, timers or class names that carry no
  meaning. Each test names the break it catches. Timing goes through Playwright's clock or Vitest's
  fake timers and is never asserted in milliseconds of wall time.
- **Three seams, all existing**, agreed with you:
  1. **The server, in Vitest, over HTTP** with the real server and the fake `claude`, like the
     holds, steward, letters and phase tests. It covers:
     - severity and picks on cards for questions (levels, the colon read, several questions, no
       pick), plans (medium, raised to high, never lowered) and permissions (the rule's cases,
       compound commands, paths outside the project);
     - `word` on cards: absent when off, idle, queued, writing, ready with a letter id, failed for
       missing labels and for the 5-minute bound; one paste per press; words before reviews; a
       dropped word when the card closes; no button on the steward's own card; `/word`'s 404, 409
       and the refusal without token or Origin;
     - the steward starting when only the card prompt is on;
     - `GET /letters` by id from the journal;
     - every answer-log value, including `terminal` after `/term` input and `unshown` with each
       reason;
     - `goal` and `spec` read, dropped when not strings, and other fields ignored;
     - the installed SessionStart hook printing the ask text, its override, and nothing when the
       override is empty.
  2. **The page, in Playwright** (one spec file at a time) on a stubbed state stream, like the
     cards and needs specs. It covers:
     - the card for each case (low, medium, high, not stated, no pick, several questions, plan,
       permission, bare permission, long);
     - the 32rem panel and the 19rem column;
     - the sticky act row;
     - the Queen's slot in each state, and her text fetched by id;
     - every key: Space and Shift+Space, Enter armed and not armed (each accident case that can be
       driven: first second, typing place, key repeat, window focus, heavy card, permission), the
       undo window, 1 to 4, Q, D, R both ways, M, L, ?, the arrows, Esc's layer order, a click
       leaving no focus, a form not sending on Enter;
     - resting leads at their houses and out of the castle queue;
     - alerts only for tiers 1 and 2.
  3. **Two pure page functions, in Vitest**, like the layout and waiting tests:
     - the urgency list's tiers and order;
     - `nextHouse` on plain points: a straight row, a staggered row, a cove, nothing to one side,
       the way back, ties, the first press.
- **Prior art:** the holds, steward, letters, phase and install tests (server); the cards, needs and
  panel specs (page); the layout and waiting tests (pure).
- **Live checks, not tests**, run once at the end with your go, because they use the real `claude`
  and cost usage:
  - a lead in the mode Funtown starts leads in (no plan mode, no "decide with me" in the prompt) on
    your default model still asks with AskUserQuestion and writes the header word;
  - a Bash call that really asks for permission shows a rule-rated card;
  - one warm and one cold Queen's word, measured;
  - an answer typed in Funtown's own terminal logs `terminal`, and one typed elsewhere logs
    `elsewhere`.
- **Commands:** `npm test` (Vitest), and Playwright one spec at a time as the project's tests README
  says.

## Out of Scope

- Burning houses, fog, a PR waiting in the list, `listedAt` and `parcelsAt` (spec 3, "What the town
  knows").
- The lead's walk to the castle, the Queen's seat, the forecourt and the new look (spec 4).
- Her PR review calling the global `/steward`; her word on every card by itself; Funtown marking
  her pick on the options.
- Parsing a letter's "Needs you:" line.
- Number keys on multi-question cards; a switch to turn single-letter keys off.
- The subagent's task line on a card.
- Staleness of the phase file.
- Carrying `goal` and `spec` into the workflow plugin (done in the setup's own project).
- Severity reordering asks inside tier 1.

## Further Notes

- The look to build from is in the local planning folder: take C, "Weighed", in the brief-on-a-card
  prototype (its page, its build script and its screenshots), and the key sheet prototype. The
  brief's content check is in the decision-brief folder. These are untracked; the tickets name them.
- ADRs written with this spec:
  - briefs ride in Claude Code's own ask fields, never in parsed prose;
  - the Queen speaks only when asked;
  - Enter answers only low and medium cards, after a second on screen;
  - the phase file grows by addition only and never carries what a tool reports;
  - one urgency list drives the Glance and the Desk.
- Glossary terms added with this spec: decision brief, card, severity, the agent's pick, bare
  permission, ask text, stakes box, act row, heavy card, armed, undo window, the marked house, the
  Queen, the Queen's word, Ask the Queen, phase file, phase, steps, goal (of a project), Glance
  state, resting, urgency list.
- Smaller picks the user never reviewed are taken here as defaults: the pick rule, the goal line,
  the bare permission, held asks only, one brief for both views, the Queen's order, what she reads,
  her word's form, the 5-minute bound, re-asking, the preselected pick, the 1.5 s undo, the 1 s
  arm, the letter keys, the arrows, number keys, M by newest, no key switch, the sticky row, the
  several-questions rule, the ribbon, the heavy card, "not stated" as high, the "starting" state,
  severity never by colour alone. Each is one constant or one function, so cheap to change.
- Risky parts, from the spec list: the arm rule and its accident cases; the Queen's word sharing one
  session and one paste queue with her reviews (the code where the 2026-11-17 run sent 28 requests
  on its own); agents' behaviour, seen in one Haiku run only.
- After merge, the five-day test starts once all four specs are in. Its count script lives under
  `.scratch/`.
