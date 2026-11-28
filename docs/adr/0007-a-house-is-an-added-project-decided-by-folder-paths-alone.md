# A house is an added project, decided by folder paths alone

A session, shell or journal entry belongs to the house of the deepest added project whose folder
is its folder or holds it (`houseOf` in `server/projects.ts`), decided by comparing paths and
nothing else. A run's worktree and a session in a subfolder stand in their project's house as its
leads, each carrying its own folder in `Lead.cwd`. A folder no added project holds is a house of
its own: the steward's, and every folder when Funtown runs without a projects file.

Context: "Decisions that bind" lets Funtown run only `claude` and `gh pr list`, and see sessions
only in listed projects. Before this, a house was a folder, so a run's worktree and a subfolder
session each made a second house showing the same PRs.

We weighed two other ways to decide which folders are one project:

- **Ask git** (`git rev-parse --git-common-dir`) which repo a folder belongs to. It would also
  merge two checkouts of one repo, but it is a new kind of child process, outside the two the
  binding line names, run per folder every poll or cached.
- **Group by the repo in the PR links.** No new process, but it only works while a repo has an open
  PR of yours, so houses would merge and split as PRs open and close.

## Consequences

- Two checkouts of one repo stay two houses, each with the same PRs; paths can't tell they are one
  repo. `houseOf` could later take a map of folder to repo.
- A run of a project that is a repo's subfolder moves to a worktree at the repo's root, outside the
  project folder, and stays hidden, as before.
- The State, Morning and the town's one-house-per-project rest on this, so it is hard to reverse.
- The folders where a session, run or shell may start are not the house folders; they stay the
  added projects, the listed sessions' own folders and the shells' folders.
