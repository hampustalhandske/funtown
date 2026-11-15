# Milestone 8: answer cards

Serves: charter item 2, "Needs you": answer cards (allow or deny, pick an option, approve a
plan) showing the exact command and folder; and the answer log behind the "Answers through
Funtown" check. Also m7's two remaining test gaps.
Not here (m9-needs-queue): the pop-up, sound and mute, the desk queue with its key, focus
rules, stuck agents.
Estimate: ~390 net production lines of a 400 budget
Mode: away: open the PR after review and continue with the queue (approved 2026-11-15)

## Done when

1. A permission request from a listed session shows a card under its lead and in its
   panel with the tool, the exact command (Bash) or file path (Edit, Write), and the
   folder; Allow runs the tool, Deny stops it and Claude is told it was denied in Funtown.
2. An AskUserQuestion from a listed background session shows a card with every question
   and its options plus an "Other" text box; Send gives Claude the picked labels (several
   for a multi-select) or the typed text.
3. An ExitPlanMode from a listed background session shows the plan text; Approve leaves
   plan mode, Keep planning sends the typed feedback and Claude stays in plan mode.
4. A held question or plan sets its lead to needs you, with `needs` "question" or "plan",
   even while `claude agents --json` says busy.
5. A permission answered in the terminal removes its card within 2 s of the session's
   next hook event, and its hook process exits.
6. Questions and plans from terminal sessions are not held: their dialog shows in their
   terminal as today. With no page open for 10 s, every held request is released and the
   terminal's own dialog takes over; a request from a session that isn't listed within
   10 s is released too.
7. Every card that closes adds one line to the answer log (`~/.funtown/answers.jsonl`):
   `at`, `lead`, `project`, `kind`, `by` = funtown, elsewhere or dropped.
8. With the Funtown server stopped, a permission request shows the normal terminal dialog
   at once (the hold hook exits 0 with no output).
9. Real sessions (orchestrator, a `--bg` haiku session in a scratch repo, stopped and
   removed after): items 1, 2, 3 and 5 work end to end; a subagent's permission card names
   the subagent (its event carries `agent_id`); a request held 2 h is still held, then
   Allow still applies.
10. `npx eslint . && npx vitest run && npx playwright test` passes, and no test runs the
    real `claude`.

## Must not

- Change the event hook (`funtown-hook.ts`) or its 800 ms deadline; holds are a separate
  hook.
- Hold anything other than PermissionRequest and PreToolUse for AskUserQuestion and
  ExitPlanMode.
- Answer for the user: no auto-allow, no "always allow", no timeout that picks an answer.
- Accept `/hold` with an `Origin` header, or `/answer` without the page's token and Origin.
- Add a dependency.

## Contracts

### Hold hook → server

Produced by task 1 (hook), consumed by task 2 (server).

`hooks/funtown-hold.ts`, a command hook with no deadline of its own. It reads the hook JSON
from stdin, adds `funtown: { at: Date.now() }`, POSTs it to `${FUNTOWN_URL}/hold`, and
waits. Reply 200: print the body to stdout, exit 0. Any other reply, a network error or no
server: print nothing, exit 0 (Claude shows its own dialog). Errors go to `FUNTOWN_LOG`.

Installer entries, added beside the nine event entries and removed with them:

```json
"PermissionRequest": [{ "hooks": [{ "type": "command", "command": "node \"<dir>/funtown-hold.ts\"", "timeout": 7200 }] }],
"PreToolUse": [{ "matcher": "AskUserQuestion|ExitPlanMode",
                 "hooks": [{ "type": "command", "command": "node \"<dir>/funtown-hold.ts\"", "timeout": 7200 }] }]
```

No `async`: Claude waits for these.

`POST /hold`: refuses any `Origin` (403), no body limit, same Host rule as `/events`. The
server holds the request open until the card closes, then replies:
- 200 with the hook output for the answer (below), when answered in Funtown;
- 204 with no body, when released (answered elsewhere, no page, not listed, lead left).
- 204 at once for a question or plan from a terminal lead, or when no page has been
  connected for 10 s.
The request closing early (Esc, the hook's timeout, a kill) closes the card as dropped.

Hook output per answer:

```json
permission allow  {"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}
permission deny   {"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"The user denied this in Funtown."}}}
question          {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow",
                    "updatedInput":{...tool_input, "answers":{"<question text>":"<label>, <label> | <typed text>"}}}}
plan approve      {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","updatedInput":{...tool_input}}}
plan keep         {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",
                    "permissionDecisionReason":"<feedback, or: Keep planning.>"}}
```

Release rule ("answered elsewhere"): a card closes as elsewhere when `/events` applies an
event from the same `session_id` and `agent_id` with `funtown.at` later than the card's
`at`, other than PermissionRequest and Notification, and other than a PreToolUse with the
card's own `tool_use_id`.

### Town state (`server/types.ts`)

Produced by task 2, consumed by task 3.

```ts
export type Card = {
  id: string;                    // server-made, unique per start
  lead: string;                  // session_id
  agent: string | null;          // agent_id when a subagent asks
  kind: "permission" | "question" | "plan";
  tool: string;                  // tool_name
  input: Record<string, unknown>; // tool_input as sent
  cwd: string;                   // the hook payload's cwd
  at: number;                    // funtown.at
};
export type Town = { houses: House[]; cards: Card[]; claude: {...} };  // cards oldest first
```

`cards` holds only cards of listed leads. The lead (or subagent) a card belongs to has
`stage` "needs_you" and `needs` = the card's kind while the card is open.

### `POST /answer`

Produced by task 2, consumed by task 3. Page token and Origin as `/jump`, 64 KB cap.

```
{ "card": "<id>", "decision": "allow" | "deny",
  "answers"?: { "<question text>": "<string>" },   // question cards, with allow
  "feedback"?: "<string>" }                         // plan cards, with deny
```

204 once the hold has its reply; 404 when the card is gone; 400 for a body that doesn't
fit the card's kind (a question without an answer for every question, deny on a question).

### Answer log and options

Produced by task 2, consumed by task 4.

`startServer({ ..., answerLog?, unlistedMs? })`: `answerLog` is the JSONL path (no log when
absent; `main.ts` passes `FUNTOWN_ANSWERS` or `~/.funtown/answers.jsonl`); `unlistedMs`
(default 10 000) is both the unlisted-hook-data expiry and the hold's wait for a listing
or a page. One line per closed card:

```json
{"at":1731670000000,"lead":"<session_id>","project":"<basename of cwd>","kind":"permission","by":"funtown"}
```

### Fake `claude --bg`

Produced and consumed by task 4: the fake records its environment for `--bg` as it does
for `attach`, so the `CLAUDE_CONFIG_DIR` test covers both.

## Tasks

| # | Owner | Owned paths | Does | Done when |
|---|---|---|---|---|
| 1 | hooks | hooks/funtown-hold.ts, hooks/install.ts | The hold hook; the installer adds and removes its two entries | The contract holds; `npx eslint .` clean |
| 2 | server | server/ | Holds (new `server/holds.ts`): `/hold`, `/answer`, release rules, needs_you override, answer log, `answerLog` and `unlistedMs` | The contracts hold; `npx eslint .` clean |
| 3 | ui | web/ | One answer-card component shown under its lead and in the panel: permission (tool, command or path, folder; Allow, Deny), question (options, Other, Send), plan (plan text in a `<pre>`; Approve, Keep planning with feedback); no autofocus; errors shown | The contracts hold; `vite build` clean |
| 4 | tests | tests/ | Tests at the seams below; m7's two gaps (unlisted expiry via `unlistedMs`, fake `--bg` env) | They run, and fail only where code is missing |

## Test seams

- Hold hook: catches output printed on a non-200, a non-zero exit, a hang when no server.
- `install-hooks`: catches a hold entry missing, marked `async`, without the matcher, or
  left behind by uninstall.
- `/hold` + `/answer`: catches a wrong hook output per kind, an answer without token or
  Origin let through, `/hold` with an Origin accepted, a second answer to a closed card.
- Release: catches a card kept after a later event, a card closed by its own PreToolUse or
  an older out-of-order event, terminal-lead questions held, holds kept with no page or for
  an unlisted session past `unlistedMs`.
- Town: catches a held question not turning its lead to needs you while the list says busy.
- Answer log: catches a missing line or a wrong `by` for each way a card closes.
- Page (Playwright): catches a card without the command or folder, buttons that send the
  wrong body, a card that stays after it closes, a card that takes focus.

## Stop and ask

Every agent stops and reports BLOCKED when:
- a contract needs to change;
- the code or the cause doesn't match this plan;
- the budget checkpoint fires;
- a "Done when" can't be met as written.

## Queue

Each needs the one before it merged.

- m9-needs-queue: ~400 (pop-up, soft sound per project, mute, desk queue oldest first
  with a jump key, never steals focus, stuck agents join the queue)
- m10-letters: ~400
- m11-workflow: ~400
- m12-runs-shell: ~400
- m13-town-kit: ~400
- m14-village: ~400
- m15-interiors: ~400
- m16-looks: ~400
