# The phase file grows by addition only and never carries what a tool reports

A project tells Funtown what Claude Code and GitHub can't through one small file,
`<project>/.claude/phase.json`. It grows only by addition: unknown fields are ignored, a field is
never changed in meaning, there is no version field, and the names `dates` and `practice` are kept
free for Life. It never carries what a tool already reports: the PR comes from `gh`, "next" is the
step after the phase in `steps`, and "now" is the phase plus what the agents are doing live.

v2 planned a bigger, versioned contract with `pr` and `escalation` fields. We took the small file
plus live signals instead, after GOAL.md's "one small, standard form" and "the town never lies": a
written PR number goes stale, a listed one doesn't.

## Consequences

- `goal` and `spec` join as optional one-line fields with the Desk; a value that isn't a string is
  dropped and the rest of the file stays.
- A project without the workflow needs no file, and nobody writes one for it by default.
