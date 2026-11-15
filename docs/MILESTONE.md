# Milestone 1: town

Serves: charter items 1–3: sessions and subagents appear as named characters at their
project's house, "needs you" stands out, and each shows its stage and current command.
Estimate: ~650 net production lines of an 800 budget
Mode: away: open the PR after review and continue with the queue

## Done when

1. `npm run install-hooks` adds Funtown's hook entries to `~/.claude/settings.json` and
   leaves every other entry as it was; `npm run uninstall-hooks` removes exactly those
   entries (tested on a temp copy: the file after install + uninstall equals the original).
2. With `npm start` running, opening http://127.0.0.1:4777 shows the town; a newly started
   `claude` in another project appears as `lead-1` at a house named after its folder within
   5 s.
3. A permission prompt or a finished turn turns that lead 🔴 "needs you" within 5 s; the
   next prompt or tool call turns it back to 🟢 working.
4. A subagent started by a lead appears next to it as `<agent type>-<n>` (for example
   `Explore-1`) while it works and shows ⚪ done when it stops.
5. Each character shows its current tool and, for Bash, the command (for example
   `Bash: npm test`).
6. After `SessionEnd` the lead shows as gone and disappears 10 min later.
7. Each lead's state holds its terminal tty and `TERM_PROGRAM`, for the jump in m2.
8. The test command passes.

## Must not

- Add a dependency, service or paid API without asking. Allowed: `react`, `react-dom`;
  dev only: `typescript`, `vite`, `@vitejs/plugin-react`, `vitest`, `eslint`,
  `typescript-eslint`, `@playwright/test`, `@types/react`, `@types/react-dom`, `@types/node`.
- Change or reorder any entry in `~/.claude/settings.json` that Funtown didn't add, or touch
  the real file from a test.
- Listen on anything but 127.0.0.1, or send any data off the machine.
- Slow Claude down: the hook script exits within 1 s, even when Funtown is not running.
- Use a real project name, path or transcript in a test or fixture.

## Contracts

### Hook event

Produced by task 1 (hook script), consumed by task 2 (server).
`POST http://127.0.0.1:4777/events`, body = the JSON Claude Code passes the hook on stdin,
unchanged, plus one added key:

```json
{
  "hook_event_name": "PreToolUse",
  "session_id": "abc123",
  "cwd": "/Users/someone/dev/demo-app",
  "transcript_path": "/Users/someone/.claude/projects/.../abc123.jsonl",
  "tool_name": "Bash",
  "tool_input": { "command": "npm test" },
  "agent_id": "optional, set inside a subagent",
  "agent_type": "optional, set inside a subagent",
  "funtown": { "tty": "ttys000", "term_program": "Apple_Terminal", "at": 1763112000000 }
}
```

Reply `204`. `tty` comes from the hook's parent process (the `claude` session).

### Town state

Produced by task 2 (server), consumed by task 3 (page).
`GET /stream`: Server-Sent Events; on connect and after every change, one `state` event:

```ts
type Stage = "working" | "needs_you" | "done" | "gone";
type Character = {
  id: string;             // session_id for a lead, agent_id for a subagent
  name: string;           // "lead-1", "Explore-1"
  stage: Stage;           // leads: working | needs_you | gone; subagents: working | done
  activity: string | null; // "Bash: npm test", "Edit", null when idle
  needs?: string;         // why it needs you: "permission", "question", "turn ended"
};
type Lead = Character & { tty: string | null; termProgram: string | null; subagents: Character[] };
type House = { project: string; cwd: string; leads: Lead[] };
type Town = { houses: House[] };
```

The server also serves the built page from `web/dist/` at `/`.

## Tasks

| # | Owner | Owned paths | Does | Done when |
|---|---|---|---|---|
| 1 | hooks | `hooks/` | Hook script (read stdin, add `funtown`, POST, exit fast) and install/uninstall of Funtown's entries in a given settings file | Done when 1 and 7 hold |
| 2 | server | `server/` | HTTP server on 127.0.0.1:4777: `/events`, the event → Town reducer, `/stream`, static page, 10 min removal of gone leads | Done when 2–6 hold against fake events |
| 3 | ui | `web/` | React page: houses, emoji characters, state rings, a loud 🔴 "needs you", subagents grouped under their lead, plain labels | Done when 2–5 are visible in the browser |
| 4 | tests | `tests/` | Tests at the seams below | They run, and fail only where code is missing |

Before dispatch I add the root config on the branch: `package.json` (scripts `start`,
`build`, `install-hooks`, `uninstall-hooks`), `tsconfig.json`, `eslint.config.js`,
`vite.config.ts`, `.gitignore`, and install the dependencies above. TypeScript runs
directly on Node 22 (built-in type stripping), so no build step for the server or hook.

## Test seams

- Install/uninstall on a temp settings file: catches Funtown clobbering or leaving behind
  your own hooks.
- Hook script with a fake stdin event and a local test server: catches a missing tty, a
  changed payload, or a hook that hangs when Funtown is down.
- `POST /events` → `GET /stream` on a running server: catches wrong stages, names
  (`lead-2`, `Explore-1`), subagents attached to the wrong lead, and gone leads not removed.
- Playwright on the page with a fake Town stream: catches "needs you" not showing or not
  standing out, and subagents not shown under their lead.

## Stop and ask

Every agent stops and reports BLOCKED when:
- a contract needs to change;
- the code or the cause doesn't match this plan;
- the budget checkpoint fires;
- a "Done when" can't be met as written.

## Queue

- m2-panel-jump: ~350: click panel (charter item 4), jump to the lead's Terminal tab (item
  5), and rebuilding already-running sessions from transcripts when Funtown starts.
