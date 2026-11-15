# S4: two --bg runs in one repo, one worktree each
Claude Code: 2.1.325   Date: 2026-11-15   Verdict: partial

| Criterion | Result | Evidence |
|---|---|---|
| Default `--bg`: each run gets its own worktree | pass | `git worktree list` after two runs: main plus `.claude/worktrees/run1-file` and `.claude/worktrees/run2-file`, branches `worktree-run1-file`, `worktree-run2-file` |
| No extra worktree | pass | exactly one worktree per run, none beyond those two |
| Each run's cwd | pass | `claude agents --json` `cwd` is `<repo>/.claude/worktrees/<name>`; the run's file exists only in its own worktree, main stays clean |
| No push, no PR | not tested: moved to m11, approved by the user 2026-11-15 | the plan forbids a remote in spike repos, so nothing could have been pushed or opened as a PR; the runs made one local commit each (`chore: add run1.txt`) |
| `--settings` with `bgIsolation: "none"` applies | pass | `--settings none.json` (`{"worktree":{"bgIsolation":"none"}}`): `git worktree list` shows only main, agents `cwd` is `<repo>`, `run3.txt` and `run4.txt` appear untracked in the main tree |

Other findings:
- A run's name derives from its prompt (`run-pwd-toplevel-file`, `run2 file creation`); the worktree folder name differs (`run1-file`).
- `claude stop` keeps the worktree; `claude rm <id>` refuses while it holds unpushed commits and needs `--discard-unpushed <sha>@<hash>` (printed in its message).
- The scratch repo needs workspace trust accepted once by a person, else `--bg` refuses.
- With default isolation `.claude/` shows as untracked in the main repo.
- Two `bgIsolation: "none"` runs share one working tree, so same-file edits would collide.

## Reproduce
```
cd <scratch>/s4 && mkdir repo && cd repo && git init -b main && echo hi > a.txt && git add . && git commit -m init
echo '{"worktree":{"bgIsolation":"none"}}' > ../none.json
# accept the trust prompt once: run `claude` in the repo
for n in 1 2; do claude --bg --model haiku "Run pwd, then create file run$n.txt containing $n, then reply done."; done
sleep 40; git worktree list; claude agents --json --all --cwd "$PWD" | grep -E '"(id|cwd|state)"'
for n in 3 4; do claude --bg --model haiku --settings ../none.json "Run pwd, then create file run$n.txt containing $n, then reply done."; done
sleep 40; git worktree list; git status --short
claude stop <id>; claude rm <id> [--discard-unpushed <sha>@<hash>]   # every id; never pass --help after --bg
claude agents --json --all --cwd "$PWD"    # expect []
```

## Consequence
Partial. Whether a `--bg` run pushes or opens a PR at the end is still open; m11 retests it against a local bare remote before relying on it. Otherwise: runs per worktree (m11) can rely on the default isolation; `bgIsolation: "none"` via `--settings` is available for runs that must share the tree.
