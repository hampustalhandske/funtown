# Milestone 5: live check

Serves: charter item 3 ("gone: the session exited, removed after 10 min") and m4's remaining
work ("a ghost lead can appear when a killed session's pid is reused, and it never leaves"):
a session that died without a SessionEnd hook (killed with `-9`, crashed) or whose pid was
reused no longer stays on screen.
Estimate: ~70 net production lines of a 400 budget
Mode: away: open the PR after review and continue with the queue (empty)

## Done when

1. Started with a Claude folder holding a session file whose pid is alive but whose
   `procStart` differs from the start time `ps` reports for that pid, the first `/stream`
   frame has no character for it.
2. A session file whose `procStart` matches (whitespace runs count as one space) rebuilds
   exactly as in m4: stage, step, subagents, tty and `termProgram`. A session file without
   `procStart` rebuilds as in m4 (pid alive is enough).
3. With `claudeDir` and `sweepMs`, a lead that a sweep or the rebuild once saw live becomes
   `gone` within one `sweepMs` after its session file disappears, its pid dies, or its pid's
   start time stops matching; it is then removed after `goneAfterMs`, as after SessionEnd.
4. A sweep never marks gone: a lead it has not yet seen live (its hook arrived before its
   session file), or a lead whose `ps` call failed in that sweep.
5. A hook event for a lead the sweep marked gone brings it back, as after SessionEnd today.
6. Without `claudeDir`, no sweep runs and nothing reads a Claude folder.
7. By hand (you): with Funtown running, `kill -9` a `claude` session's pid. Its character
   shows "gone" within 5 s. Restarting Funtown, every live session still comes back with
   its tty.
8. The test command passes.

## Must not

- Add a dependency, service or paid API without asking.
- Change `/events`, `/jump`, the hook, the installer, the page, `server/town.ts` or the Town
  shapes.
- Read anything in the Claude folder beyond `sessions/*.json` and what m4 reads.
- Run any command in a test: tests inject `exec`.

## Contracts

### Session file field

Consumed by tasks 1 and 2. `procStart` is the process start time as `ps -o lstart=` prints
it in UTC, e.g. `"Fri Nov 13 12:37:09 2026"`. It may be absent.

```ts
type Session = { pid: number; sessionId: string; cwd: string; startedAt: number; status?: string; procStart?: string };
```

### The one `ps` call per session file with a live pid

Produced by task 1, faked by task 2. Replaces m4's `ps -wwE -o tty=,command=` call, at
rebuild and in every sweep.

```ts
exec("env", ["TZ=UTC", "ps", "-wwE", "-o", "lstart=,tty=,command=", "-p", String(pid)])
// stdout: "Fri Nov 13 12:37:09 2026     ttys008  claude --resume ... TERM_PROGRAM=Apple_Terminal ..."
// the first 5 whitespace-separated tokens are lstart, the 6th is the tty ("??" when none)
```

Those 5 tokens differing from `procStart` (both with whitespace runs collapsed) means the
pid now belongs to another process: the session counts as not live. A failing call writes
one stderr line, as in m4; the rebuild skips that session and the sweep leaves it as it is.

### `startServer` option

Produced by task 1, consumed by task 2.

```ts
startServer({ port, goneAfterMs?, distDir?, run?, claudeDir?, exec?, sweepMs? })
// sweepMs: how often the Claude folder is checked for sessions that ended; default 5000.
// Only with claudeDir. close() stops the sweep.
```

## Tasks

| # | Owner | Owned paths | Does | Done when |
|---|---|---|---|---|
| 1 | server | server/rebuild.ts, server/app.ts | The new `ps` call with the start-time match, shared by the rebuild and a sweep every `sweepMs` that ends leads no longer live through the same path as SessionEnd | Done when 1–6 hold |
| 2 | tests | tests/rebuild.test.ts, tests/sweep.test.ts | Updates the fake `exec` to the new call; adds the seams below | They run, and fail only where code is missing |

## Test seams

- `startServer({ claudeDir, exec })` first `/stream` frame: catches a reused pid showing as
  a lead, a matching session dropped, a session without `procStart` dropped, and the tty
  read from the wrong token after lstart was added.
- `startServer({ claudeDir, exec, sweepMs, goneAfterMs })` later `/stream` frames, with the
  fixture folder and fake `exec` changed between sweeps: catches a dead, reused or deleted
  session staying on screen; a lead marked gone before it was ever seen live; a failed `ps`
  ending a live lead; a gone lead not removed after `goneAfterMs`; a hook event not
  reviving it; a sweep still running after `close()`.

## Stop and ask

Every agent stops and reports BLOCKED when:
- a contract needs to change;
- the code or the cause doesn't match this plan;
- the budget checkpoint fires;
- a "Done when" can't be met as written.

## Queue

- none
