# What the town knows

Status: ready-for-agent
Serves: GOAL.md, "Glance: the world tells the truth at a glance. A red PR is a burning house ...
Only the most urgent thing is loud, and the town never looks calm when it doesn't know", and the
success line "The three-second glance: ... you can name what needs you and what's burning".

## Problem Statement

Funtown can't tell me what's burning. It lists my open PRs as parcels, but not whether their checks
failed, so a red PR looks the same as a green one. To find out I open GitHub.

It also shows one project as two or three houses. A run started from Funtown works in its own
worktree, and that worktree becomes a second house with the same PRs. A session I start in a
subfolder becomes a house of its own too. The town grows with every run instead of with every
project, and Morning splits one project's night into several sections.

When Funtown can't look, it doesn't say so. If `claude agents --json` keeps failing, or `gh` is
offline or signed out, the server keeps the last list and logs once, and the page shows it as if it
were fresh. If the page loses the server, it goes on showing the last town as if nothing happened.
A town that looks calm because it stopped looking is worse than no town.

## Solution

Each project is one house. A run's worktree and a session in a subfolder stand in their project's
house as its leads, and each lead carries its own folder, so I can still tell a run in its worktree
from the lead in the main folder. Morning groups by house.

Each PR carries its checks: failed, running, passed or none, and when it failed. A house with a
failed PR is on **fire**. While a lead of that project is working, the fire is **handled** (someone
holds the bucket). While nobody is, the house is **burning**, and that goes into the urgency list
after the asks and the stuck agents, before anything quiet. A PR with nothing failed and nothing
running, in a project where no lead is working, **waits for me**: a quiet sign, never loud.

A project with no GitHub repo (no git, no remote, a remote that isn't GitHub) has no PRs, and that
is a known fact, not a failure.

When Funtown can't look, it says so in words:

- a house whose PR list hasn't worked for 3 minutes says when its PRs were last read, and a fire
  there is quiet, because Funtown can't be sure it still burns;
- when the session list hasn't worked for 10 seconds, the plain list says since when;
- when the page has lost the server for 3 seconds, the plain list says so, the town shows an icon in
  its controls row, and nothing chimes.

Space walks to a burning house or a waiting PR like any other entry: it marks the house and opens a
small PR pane inside Funtown, never GitHub. The pane has the PR's checks, its review and an "Open
PR" link that only a click follows.

The 3D world draws none of this yet: fire, smoke and fog come with the new look (spec 4). This spec
shows the states as words in the plain list and in the town's screen-reader list, and the town's
keys reach them.

## User Stories

**One project, one house**

1. As a user, I want a run's worktree to stand in its project's house, so that the town has one
   house per project and not one per run.
2. As a user, I want a session started in a subfolder of a project to stand in that project's
   house, so that a session in `web/` doesn't make a new house.
3. As a user, I want each lead to carry its own folder, so that the plain list and the card can say
   which worktree a run works in.
4. As a user, I want a project's PRs read once per project, so that a run's worktree doesn't show
   the same PRs a second time.
5. As a user, I want the house to show the project folder's phase file, so that a run's subagents
   get the project's tags too.
6. As a user with two nested added projects, I want a session to go to the deepest project that
   holds its folder, so that `/a/b/c` goes to `/a/b` and `/a/c` to `/a`.
7. As a user, I want `<project>-other` never to count as inside `<project>`, so that two projects
   with a shared name prefix stay apart.
8. As a user, I want a session in no added project to stay hidden, as today, so that Funtown sees
   no more than before.
9. As a user, I want the steward's folder to stay a house of its own, so that the Queen keeps her
   place at the castle.
10. As a user, I want a shell running in a subfolder of a project to count under that project's
    house, so that it doesn't make a house of its own.
11. As a user, I want the places where a session, run or shell may start to stay exactly what they
    are today, so that nothing new may be started anywhere and nothing that works today stops.
12. As a user, I want Morning to group a night's letters and stuck agents by house, so that a run's
    worktree doesn't get its own section.
13. As a user running Funtown without a projects file, I want every folder to stay its own house,
    so that the tests and a bare server work as today.

**Checks on PRs**

14. As a user, I want each PR to carry its check state (failed, running, passed, none), so that a
    red PR doesn't look like a green one.
15. As a user, I want a PR's state read the way `gh pr checks` reads it, so that Funtown and gh
    never disagree about a PR.
16. As a user, I want a startup failure to count as failed, so that a workflow that never started
    doesn't look like it is still running.
17. As a user, I want a cancelled or skipped check not to set a house on fire, so that fire means
    one thing: a check failed.
18. As a user, I want a PR with no checks to say "no checks", never "passed", so that the town
    doesn't look calm when nothing checked the PR.
19. As a user, I want each failed PR to carry when it went red, so that the oldest fire goes first
    and the list can say "failed 12m ago".
20. As a user, I want drafts to count, so that the workflow's draft PRs can set a house on fire.
21. As a user, I want only my own PRs to count, as today, so that Dependabot's and other people's PRs
    never set a house burning.
22. As a user, I want a merge, a close or a re-run that is pending to put the fire out on the next
    PR list, so that a fire never outlives its failure.
23. As a user, I want a restart to lose nothing, so that the check states and "when it went red"
    come back from gh.

**Fire, handled and a PR waiting**

24. As a user, I want a house with a failed PR and no lead working to be burning, so that I can see
    what is broken and nobody is fixing.
25. As a user, I want a fire to be handled while any lead of the project works, a run in its
    worktree included, so that a run fixing CI doesn't leave its house burning.
26. As a user, I want a burning house to sit in the urgency list after every ask and every stuck
    agent and before anything quiet, so that a question that stops an agent comes first.
27. As a user, I want the burning house whose check failed first to go first among burning houses,
    so that the oldest fire isn't buried.
28. As a user, I want a handled fire to stay out of the urgency list, so that the list holds only
    what waits on me.
29. As a user, I want a burning house to chime, toast and notify the way an ask does, so that a
    fire is loud like the other loud tiers.
30. As a user, I want a PR with nothing failed and nothing running, in a project where no lead is
    working, to wait for me as a quiet entry, so that I know it is ready to look at.
31. As a user, I want a waiting PR with the Queen's review ready to come before the other waiting
    PRs, so that a reviewed PR is the first one I read.
32. As a user, I want a waiting PR never to chime, toast or notify, so that a ready PR stays a quiet
    sign.

**Funtown could not look**

33. As a user, I want the State to carry when the session list last worked, so that the page can
    tell a fresh list from an old one.
34. As a user, I want each house to carry when its PR list last worked, so that the page can tell
    fresh PRs from old ones.
35. As a user, I want a house whose PR list has failed for 3 minutes to say "PRs last read 14:02" in
    the plain list, so that an old check state doesn't look fresh.
36. As a user, I want a house whose PR list hasn't come back since the server started to say "PRs
    not read yet", so that the first minute after a start doesn't look calm.
37. As a user, I want a fire under fog to be quiet, first among the quiet entries, so that loud
    always means "sure, act now".
38. As a user, I want a fire under fog to keep its last known PR and say "failed when last read",
    so that I still find it with Space.
39. As a user, I want no "waiting for you" entry from a house under fog, so that an unknown PR state
    is never called ready.
40. As a user, I want a project with no GitHub repo to be sure, with no PRs, so that a non-GitHub
    project never sits in fog.
41. As a user, I want the plain list to say "Could not list sessions since 14:02" once the session
    list has failed for 10 seconds, so that I know the leads may have moved on.
42. As a user, I want a known ask to stay loud while the session list fails, so that a card that
    still works can still be answered.
43. As a user, I want the page to know when it has lost the server for 3 seconds, so that it never
    shows the last town as if it were fresh.
44. As a user, I want the plain list to say "Lost the server at 14:02: this is the town as it was
    then", so that I don't act on an old town.
45. As a user, I want the town page to show a "can't see" icon in its controls row while the page
    has lost the server or the session list fails, with the reason on hover, so that the town
    doesn't look calm when it doesn't know.
46. As a user, I want nothing to chime, toast or notify while the page has lost the server, so that
    nothing is loud when nothing can be answered.
47. As a user, I want the page to recover by itself when the stream comes back, so that I don't
    have to reload.
48. As a user, I want missing hooks or an old Claude Code not to count as fog, so that the town
    stays sure when the list still tells the truth.

**Space, the mark and the PR pane**

49. As a user, I want Space to reach a burning house in its place in the urgency list, so that I
    walk to a fire the same way I walk to an ask.
50. As a user, I want Space on a burning house or a waiting PR to mark that house in the town, so
    that I can see where it is.
51. As a user, I want Space on a burning house or a waiting PR to open a small PR pane inside
    Funtown, never GitHub, so that a stray Space never opens a browser tab.
52. As a user, I want the PR pane to show the PR's number, title, draft badge, check state, when it
    failed, and whether the house is burning, handled or waiting, so that I know what it is before
    I open GitHub.
53. As a user, I want the PR pane to carry today's review actions (ask the Queen to review, read her
    review when ready), so that the pane is the one place for a PR.
54. As a user, I want "Open PR" in the pane to open GitHub only on a click, so that GitHub opens only
    when I ask.
55. As a user, I want clicking a parcel without a ready review in the town to open the PR pane
    instead of GitHub, so that a click and Space lead to the same place.
56. As a user, I want Esc to close the PR pane like any pane, so that the layer order stays the
    same.
57. As a user, I want the PR pane on both pages, so that Space on the work view reaches it too.
58. As a user, I want Shift+Space to walk back over burning houses and waiting PRs too, so that the
    walk is the same in both directions.
59. As a user, I want a toast for a burning house to open its PR pane on click, so that the toast
    leads where Space does.

**The words**

60. As a user, I want each house in the plain list to say "burning", "handled" or its fog words
    next to its name, so that I can name what's burning in three seconds.
61. As a user, I want each PR row in the plain list to say "checks failed 12m ago", "checks
    running", "checks passed" or "no checks", so that the facts are one key away.
62. As a user, I want a waiting PR's row to say "waits for you", so that I see which ones are ready.
63. As a user, I want the "Needs you" list to show burning houses and waiting PRs in their tiers
    with the project, the PR and its words, so that the plain list is the whole urgency list.
64. As a screen-reader user, I want the town's hidden list to give each house its state words, so
    that the glance has a words-only twin.
65. As a user, I want the words to follow today's list style, so that nothing new needs learning.

## Implementation Decisions

**One project, one house**

- A new pure server function, `houseOf(cwd, projects)`, gives the folder of the house a session,
  shell or journal entry belongs to: the deepest added project that is `cwd` or holds it (`cwd`
  equal to it or starting with it plus "/"), or `cwd` itself when no added project holds it (the
  steward's folder, or every folder when there is no projects file). It takes real absolute paths,
  as the projects file stores them, and reads no files. This shape came from the "One project, one
  house" decision:

  ```ts
  export function houseOf(cwd: string, projects: readonly string[]): string
  ```

  Paths alone beat asking git which repo a folder is (a new kind of child process, outside "`gh`
  only `pr list`" and the `claude` line) and grouping by the repo in PR links (houses would merge
  and split as PRs open and close). What it can't tell: two checkouts of one repo stay two houses.
- The town's snapshot files each listed lead under `houseOf(its cwd)` and each shell folder the
  same way. A house's `cwd` is its added project's folder; its `seen` follows the same key.
- `Lead.cwd: string`, always present: the session's own folder as `claude agents --json` gives it.
  It beat a worktree name only (a second rule to keep in step with Claude Code's folder layout) and
  no field (a run's worktree would be lost once it shares a house).
- Phase files and PR lists are read once per house folder. The phase file is the project folder's;
  its tags apply to every lead in the house and their subagents. A run's own phase file in its
  worktree is not read.
- The list of folders where a session, run or shell may start stays today's set: the added
  projects, the listed sessions' own folders and the shells' folders. It is kept apart from the
  list of house folders, which now differ.
- `/morning?since=` groups entries by `houseOf(entry.cwd)`. `Morning.projects` means "one per
  house". Same shape, so the Morning view matches sections to houses as today.
- The house's name stays the last part of its folder.

**Checks on parcels**

- The one `gh pr list` call per house adds `statusCheckRollup` to its `--json` fields. Nothing else
  changes in the call (`--author @me` stays, by the user's answer), so "`gh` only `pr list`" holds.
- Each check item is read the way gh's own `pr checks` reads it: its `state` if it has one, else
  its `conclusion` once `status` is COMPLETED, else its `status`. FAILURE, ERROR, TIMED_OUT,
  ACTION_REQUIRED and STARTUP_FAILURE are failed (gh files STARTUP_FAILURE as pending; Funtown
  doesn't, so a workflow that never started isn't "running" for ever). SUCCESS, NEUTRAL, SKIPPED and
  CANCELLED are settled, not failed. Anything else is running.
- A parcel's `checks` is `"red"` if any item failed, else `"running"` if any is running, else
  `"green"`, and `"none"` for an empty rollup. These are the four words the user confirmed; the plain
  list shows them as "checks failed", "checks running", "checks passed" and "no checks".
- A red parcel carries `redAt`: the earliest time a failed item finished (a check run's
  `completedAt`, a status's `startedAt`), as milliseconds; absent when no failed item carries a
  time.
- A rollup that isn't a list makes the PR list invalid, as a malformed list is today. An item of an
  unknown shape counts as running, so an odd item never puts a fire out.
- The rollup is for the PR's newest commit, so a new push resets the state with the next list.

**No GitHub here, and when each source last worked**

- `listPrs` sorts gh's three "no GitHub repo" failures from real ones by their text: "not a git
  repository", "no git remotes found", and "none of the git remotes configured for this repository
  point to a known GitHub host". For these the house gets `parcels: []` and its `parcelsAt` is set,
  as for a good list, and nothing is logged. The texts were checked on the installed gh 2.103.3 on
  2026-11-28. Any other failure keeps the last list and logs once, as today. Matching on stderr is
  fragile across gh versions; each text has its own test, and a changed text only puts that house in
  fog, never on fire.
- `Town.listedAt?: number`: when `claude agents --json` last worked (the server's clock), absent
  until the first. `House.parcelsAt?: number`: when that house's PR list last worked or said "no
  GitHub here", absent until the first. Times, not flags, so the page judges the age. Times beat
  flags (the server would pick the grace times) and nothing (the town would lie when `claude` or
  `gh` breaks). The steward's own house is never polled, so it never has `parcelsAt` and is never in
  fog.
- Because `listedAt` changes on every good poll, the state stream now sends a frame about every 2 s
  even when nothing else changed. That is a few kilobytes on 127.0.0.1 and is accepted.

**The Glance, in the page**

- One pure module in the page works out a house's Glance from the State and the page's clock: its
  fire (none, handled, burning), whether it is under fog and why, and its waiting PRs. The urgency
  list, the plain list, the town's hidden list and Space all read it. Working states out in the page
  beat the server sending ready-made states (a bigger contract change, harder to undo). The rules:
  - **Fire:** any parcel is red. **Handled** while any lead of the house is working (stage
    `working`, a lead waiting on its subagents included); **burning** while none is.
  - **Fog on a house:** it has a PR list to read (not the steward's own house) and its `parcelsAt`
    is absent or more than 3 minutes old.
  - **A PR waiting for you:** its checks are green or none, no lead of the house is working, and
    the house is not under fog.
  - **Town fog:** the page has lost the server for 3 seconds (`lost`), or `listedAt` is absent or
    more than 10 seconds old while the page has the stream.
  - The grace times (3 s, 10 s, 3 min) are one constant each.
- The urgency list takes the town, the page's clock and whether the page has lost the server, and
  keeps its strict tiers ("One urgency list drives the Glance and the Desk", ADR 0006):
  1. asks, cards first, then other asks, oldest first;
  2. stuck, except on a rate limit, oldest first;
  3. **burning houses** not under fog, the oldest `redAt` first, unknown times last; one entry per
     house, for its oldest red PR;
  4. quiet, in this order: a fire under fog (it may still be real); stuck on a rate limit; **PRs
     waiting for you**, those with the Queen's review ready first, then in house order and the
     house's own PR order; resting leads, oldest first.
  Handled fires, fog itself and working characters are not in the list.
- An entry is now either a character (as today) or a PR of a house (tiers 3 and 4), with a key of
  its own (`<cwd>#<number>`). The castle queue and the Morning button keep reading only the
  character entries.
- **Loud:** tiers 1 to 3 chime, toast and notify when they join the list, as tiers 1 and 2 do today.
  A burning house's toast and notification name the project and say "is burning: #<n> checks
  failed", and open its PR pane. While the page has lost the server, nothing alerts. While only the
  session list fails, the tiers stand as they are, so a known ask stays loud.
- The page re-judges on every frame and on its 5 s clock.

**The page losing the server**

- The stream hook tells the page whether it has lost the server: the stream has errored and not
  reopened for 3 seconds. It clears on the next frame. The page never reloads by itself; a restart
  is still told by `started`, as today.

**The PR pane**

- One small pane, shared by both pages, for one PR of a house: number and title, draft badge, its
  check words and when it failed, the house's word (burning, handled, waiting, or its fog words),
  the review part from today's ask panel (ask the Queen to review when idle, the state words while
  queued or reviewing, and a button to read her review when ready), and an "Open PR" link to
  GitHub that only a click follows. It replaces today's ask panel in the town.
- Space or Shift+Space on a PR entry opens the pane; on the town page it also marks the house. A
  click on a parcel in the town with a ready review still opens the Queen's review, as today; any
  other parcel click opens the pane instead of GitHub. The work view's parcel rows keep their GitHub
  link, since a click on a link is an explicit ask.
- The pane is a `pane` layer, so Esc closes it in today's layer order.

**The words**

- Plain list, today's list style:
  - one line at the top while the town is under fog: "Lost the server at 14:02: this is the town as
    it was then." or "Could not list sessions since 14:02.";
  - beside each house's name, a badge: "burning", "handled", "PRs last read 14:02" or "PRs not read
    yet";
  - on each PR row, its check words ("checks failed 12m ago", "checks running", "checks passed",
    "no checks"), and "waits for you" on a waiting PR;
  - in the "Needs you" list, a PR entry shows the project, "#<n>" and its words ("burning: checks
    failed 12m", "failed when last read", "waits for you").
- The town page's hidden list gives each house its state words in its label.
- The town page shows one "can't see" icon in its controls row while the town is under fog, with the
  reason as its label and tooltip (lost the server, or could not list sessions since a time). No
  veil and no fog are drawn: fog's look is out of this stretch, by the user's word. The icon beat a
  plain grey veil, which comes close to the fog look the user found hard to see.

**Contracts and docs that change, with this spec**

- CLAUDE.md, State: after "leads only while listed;" add "a house's `cwd` is its added project's
  folder and each lead carries its own `cwd`;", and add "the Town has `listedAt`, when the session
  list last worked; a house has `parcelsAt`, when its PR list last worked (absent until the first);
  a house with no GitHub repo has `parcels: []`".
- CLAUDE.md, Workflow: "parcels from `gh pr list --author @me` every 60 s" becomes "parcels, each
  with its checks (red, running, green, none) and when they went red, from `gh pr list --author
  @me` every 60 s".
- CLAUDE.md, Projects: "Houses: added projects, those sessions' cwds, folders whose shell runs."
  becomes "Houses: one per added project, holding every session and shell in its folder or a folder
  inside it (a run's worktree, a subfolder; the deepest added project wins); a folder in no added
  project (the steward's) is a house of its own. Sessions, runs and shells start only in an added
  project, a listed session's folder or a shell's folder." `/morning?since=` groups by house.
- CLAUDE.md, the Map: `needs.tsx`'s tiers gain 3, burning houses, and tier 4's fire under fog and
  waiting PRs; the PR pane is named.
- "Decisions that bind" does not change.
- ADR 0007, "A house is an added project, decided by folder paths alone".
- GLOSSARY.md gains: project, house, run, worktree, fire, burning, handled, who holds the bucket,
  fog, the loud thing, calm, a PR waiting for you, check state. "Glance state" gains a house's
  states.

## Testing Decisions

- **A good test** checks what the user or the next program sees: the State a page receives, what
  `/morning` answers, the urgency list's order, the words on the page, what a key does. It never
  checks component state, timers or class names that carry no meaning. Each test names the break
  it catches. Time goes through Playwright's clock or Vitest's fake timers, or as the `now` the pure
  function takes; it is never asserted in milliseconds of wall time.
- **Three seams, all existing**, agreed with the user:
  1. **The server, in Vitest, over HTTP**, with the real server and the fake `claude`, which also
     stands in for `gh`, like the projects, PR, journal and shell tests. It covers:
     - one house per added project: a worktree joins its project, a subfolder joins its project,
       the deepest of two nested projects wins, `<p>-other` is not held by `<p>`, a folder in no
       project gives itself (the steward), no projects file means every folder is its own house;
     - `Lead.cwd` on every lead; one PR list and one phase read per house; the project's tags on a
       run's subagents;
     - the start allow-list unchanged, including a listed worktree folder;
     - `/morning` grouping a worktree's entries under its project;
     - a shell in a subfolder filed under its project's house;
     - each parcel's `checks` and `redAt` from each kind of rollup (failed, startup failure,
       running, passed, cancelled and skipped, empty, a status context, a mix, an unknown item), and
       a rollup that isn't a list;
     - each of gh's three "no GitHub" texts giving `parcels: []` with `parcelsAt` and no log line,
       and another failure keeping the last list, `parcelsAt` unchanged and one log line;
     - `listedAt` set on a good list and kept on a failed one; the steward's house without
       `parcelsAt`.
     The fake gh learns to print a rollup with each PR and to fail with a given text.
  2. **The page's pure Glance functions, in Vitest**, like the urgency and layout tests: fire,
     handled (a run in its worktree working), burning, fog by age and by absence, no fog for the
     steward's house, waiting PRs (green, none, not while a lead works, not under fog, a ready
     review first), the urgency list's tiers 3 and 4 in order with the existing tiers, the oldest
     `redAt` first, town fog by `listedAt` and by `lost`.
  3. **The pages, in Playwright** (one spec file at a time) on a stubbed state stream, like the
     needs, cards and keys specs: the plain list's badges, PR words and the fog line; Space and
     Shift+Space reaching a burning house and a waiting PR, marking the house and opening the PR
     pane; the pane's parts and its "Open PR" link only on click; a parcel click in the town opening
     the pane; Esc closing it; a toast for a burning house and none for a waiting PR; the lost
     server line and the town's icon after 3 s, no alert while lost, and both gone when the stream
     comes back; the hidden list's house words.
- **Tests that pin today's houses and change on purpose:** the projects test that expects a
  worktree as a second house, the journal test that gives a worktree its own Morning section, and
  the shell tests whose setup waits for a house at a subfolder.
- **Prior art:** the projects, PR, journal and shell tests (server); the urgency and layout tests
  (pure); the needs, keys and arrows specs (page).
- **Live checks, not tests**, run once at the end:
  - gh's three "no GitHub repo" texts on the installed gh: done on 2026-11-28 on gh 2.103.3, each
    exits 1 with the text above;
  - a running check seen live: the spec's own draft PR while its CI runs shows "checks running" in
    the plain list, then "checks passed";
  - whether `claude agents --json` gives a folder reached through a symlink as its real path (with
    the user's go, since it runs the real `claude`).
- **Commands:** `npm test` (lint, build, Vitest, Playwright), and Playwright one spec at a time as
  the project's tests README says.

## Out of Scope

- Fire, smoke, fog, the flag and wait postures drawn in the 3D world (spec 4, "The town in its new
  look").
- Stale houses and weeds; merge conflicts as fire.
- Dependabot's and other people's PRs (`--author @me` stays, by the user's answer).
- Two checkouts of one repo as one house.
- Bringing back a run of a project that is a subfolder of its repo once it moves to the repo
  root's worktree (it stays hidden, as today).
- A run's own phase file in its worktree.
- Telling two added projects with the same folder name apart in the list (`parent/name`), and their
  shared colour.
- Parsing a letter's "Needs you:" line.
- The stats panel's numbers (spec 5).
- Severity reordering asks inside tier 1.

## Further Notes

- The planning notes this spec is built from are in the local planning folder: the Glance's
  states, one project one house, how each Glance state shows in the world (the fire-under-fog rule
  only), what gh can tell about a PR, the keyboard map (pick 14, the PR pane), and the spec list
  (spec 3, its gate, disagreement 1). They are untracked.
- The user confirmed: `listedAt`, `parcelsAt`, check states on parcels and "no GitHub here" as an
  empty list; one house per added project by paths alone, `Lead.cwd` and Morning by house; asks
  before stuck before burning houses; a fire under fog quiet, first in tier 4; Dependabot's PRs left
  out. On 2026-11-28 they chose to keep the fog facts and their words in the plain list, the "can't
  see" icon over a grey veil, and the three test seams.
- Smaller picks the user never reviewed are taken here as defaults: what sets a house on fire, who
  holds the bucket, a rate limit is quiet, the grace times, a PR waiting for you, what fog means,
  the project folder's phase file, the house's name, where a session may start, the deepest nested
  project wins, no projects file means every folder is a house. Each is one constant or one
  function, so cheap to change.
- Risky parts: sorting gh's "no GitHub repo" texts from real failures; a running check never seen
  live before this spec's own PR; three tests that pin today's houses change on purpose; a frame
  every 2 s now that `listedAt` changes on every poll.
- A visible change the user has not seen drawn: a run no longer shows as a second house; it stands
  in its project's house.
