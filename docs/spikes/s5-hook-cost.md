# S5: cost of the async observe hook at 20 sessions
Claude Code: 2.1.325   Date: 2026-11-15   Verdict: fail

Simulated: 20 sessions firing PostToolUse payloads (about 2 KB) at a local server, one call per 500 ms each, 10 calls per session. Machine: macOS, Node 22. The hook is the v1 shape without the `ps` tty walk. A no-op `node` script gives the process-start floor.

| Criterion | Result | Evidence |
|---|---|---|
| ms added per tool call, command hook (median, p95), bar: under 50 ms | fail | 1 session: 65.8 / 99.6 ms; 20 sessions: 115.3 / 242.7 ms. No-op node floor: 36.9 / 65.8 ms (1) and 63.9 / 113.7 ms (20). The process spawn counts as added time, so 115 ms median is over the bar |
| ms added per tool call, `type: "http"` (median, p95) | pass | in-process POST: 1 session 3.1 / 4.9 ms; 20 sessions 3.0 / 14.9 ms |
| Server CPU at 20 sessions | pass | command hook: 160 ms CPU over the run, 2.4 % of one core (200 events); http: 36.7 ms, 0.73 % (200 events) |
| Command hook vs `type: "http"` | pass | http is about 20-40x cheaper per call and needs no process spawn; both shapes delivered 1 event in a real `claude -p --model haiku` session |
| `async: true` command hook accepted by Claude Code and delivers | pass | real session with `"async": true` delivered 1 PostToolUse event; run took 9 s, same as sync (9 s) and http (8 s) |
| Added ms measured inside a real Claude session | fail | a one-tool-call `-p` run is dominated by model latency (8-9 s); the hook cost is below that noise. Only the simulated numbers above are measured |

## Reproduce
Scratch folder `<scratch>/spikes/s5/` holds `server.mjs` (port 4799, `/events`, `/stats`), `hook.mjs`, `noop.mjs`, `bench.mjs`, `httpbench.mjs`.
```
node <scratch>/spikes/s5/server.mjs &
node bench.mjs noop.mjs 20 10      # floor
node bench.mjs hook.mjs 20 10      # command hook: median, p95, serverCpuMs
node httpbench.mjs 20 10           # type: http
```
Real session check (settings file `{"hooks":{"PostToolUse":[{"matcher":"*","hooks":[X]}]}}`, X one of `{"type":"command","command":"node <scratch>/spikes/s5/hook.mjs"}`, the same with `"async":true`, or `{"type":"http","url":"http://127.0.0.1:4799/events"}`):
```
cd <scratch-repo>; claude -p "Run the shell command: echo hi" --model haiku --settings <file> --allowedTools=Bash
curl -s 127.0.0.1:4799/stats
```
Put the prompt before `--allowedTools`; that flag takes several values and swallows a trailing prompt.

## Consequence
Fail means: switch the observe hook to `type: "http"`, which measured 3 ms median and 15 ms p95 at 20 sessions. The command hook (115 ms median, 243 ms p95) is over the 50 ms bar. The per-call cost inside a live session was not timed (see the last row), and the `ps` tty lookup needs another source (the agents JSON) once the hook is http.
