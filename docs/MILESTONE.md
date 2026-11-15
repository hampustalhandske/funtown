# Milestone 2: cleanup

Serves: the should-fix items left in docs/HANDOFF.md after m1 (charter items 1–3 as built).
Estimate: ~0 net production lines (about +30, -30) of a 400 budget
Mode: away: open the PR after review and continue with the queue

## Done when

1. The Town types exist once, in `server/types.ts`: `grep -rn "type Lead =" server web tests`
   prints one line; `web/src/` and `tests/` import them from there.
2. `vite.config.ts` has no `server.proxy`, `package.json` has no `dev` script, and the page
   shows no "live" / "connecting" text.
3. A lead that gets `SessionEnd` and then any other event before `goneAfterMs` is still in
   the Town after `goneAfterMs` has passed.
4. `POST /events` with an `Origin` header returns 403 and leaves the Town unchanged; without
   one it returns 204 as before.
5. `.gitignore` ignores `/data/` (root only), `.claude/ui-review/` and `.playwright-mcp/`.
6. The hook test asserts the posted `funtown.tty` equals the test process's own tty from
   `ps -o tty= -p <pid>` (null when that prints `??`), not just that the key exists.
7. When the page isn't built, `GET /` returns 503 with the text
   `Funtown's page isn't built yet. Run: npm run build`.
8. Loading the page logs no 404 (a favicon is served).
9. The test command passes.

## Must not

- Add a dependency, service or paid API without asking.
- Change the hook event or the Town state shapes from m1.
- Touch `hooks/`, or the real home folder from a test.
- Listen on anything but 127.0.0.1.

## Contracts

### startServer

Produced by task 1, consumed by task 2.

```ts
startServer(opts: {
  port: number;
  goneAfterMs?: number; // default 600000
  distDir?: string;     // default <repo>/web/dist/; tests point it at an empty temp dir
}): Promise<{ url: string; close(): Promise<void> }>
```

- `POST /events` with any `Origin` header → `403`, empty body, event not applied.
- `GET /` when `<distDir>/index.html` is missing → `503`, `text/plain`, body
  `Funtown's page isn't built yet. Run: npm run build`.
- A gone lead that receives a non-`SessionEnd` event has its removal timer cancelled; a
  later `SessionEnd` starts a fresh one.

### Shared types

`server/types.ts` keeps its m1 exports (`Stage`, `Character`, `Lead`, `House`, `Town`).
`web/src/town.ts` and the type block in `tests/helpers.ts` are removed; both import
`import type { ... } from "<relative>/server/types.ts"`.

## Tasks

| # | Owner | Owned paths | Does | Done when |
|---|---|---|---|---|
| 1 | app | `server/`, `web/`, `vite.config.ts`, `package.json`, `.gitignore`, `tsconfig.json` | Shared types in web, drop proxy, `dev` script and live indicator, cancel the gone timer, reject `Origin`, `/data/` and tooling ignores, 503 for an unbuilt page, favicon | Done when 1–5, 7, 8 hold |
| 2 | tests | `tests/` | Import types from `server/types.ts`; tests at the seams below; fix the tty assertion | Done when 1 and 6 hold; tests fail only where code is missing |

## Test seams

- `POST /events` → `GET /stream`: catches a returning lead still deleted by the old timer,
  and an event with an `Origin` header changing the Town.
- `startServer({ distDir: <empty dir> })` → `GET /`: catches a missing page showing as a
  bare 404.
- Hook script with a fake stdin event: catches a wrong or missing tty.
- Playwright on the page: catches a favicon 404 in the console.

## Stop and ask

Every agent stops and reports BLOCKED when:
- a contract needs to change;
- the code or the cause doesn't match this plan;
- the budget checkpoint fires;
- a "Done when" can't be met as written.

## Queue

- m3-panel-jump: ~250, after m2: click a character to open a panel with its current step
  and subagents (charter item 4); a button focuses the lead's macOS Terminal tab by tty via
  `osascript`, other terminal apps are brought to the front (item 5).
- m4-rebuild: ~200, after m3: on start, rebuild already-running sessions from the
  transcripts in `~/.claude/projects/`.
