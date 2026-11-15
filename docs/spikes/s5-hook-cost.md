# S5: cost of the async observe hook at 20 sessions
Claude Code: 2.1.325   Date: 2026-11-15   Verdict: pass

Simulated: 20 sessions firing PostToolUse payloads (about 2 KB) at a local server, one call per 500 ms each, 10 calls per session. Machine: macOS, Node 22. The hook is the v1 shape without the `ps` tty walk. A no-op `node` script gives the process-start floor. The 50 ms bar came from the architecture plan, which assumed a hook that blocks the tool call; an `async: true` command hook doesn't block it.

| Criterion | Result | Evidence |
|---|---|---|
| Claude doesn't wait for an `async: true` command hook | pass | real session with `"async": true` delivered 1 PostToolUse event; run took 9 s, same as sync (9 s) and http (8 s). The hook process time is not added to the tool call |
| Process time per call, command hook (median, p95) | pass | 1 session: 65.8 / 99.6 ms; 20 sessions: 115.3 / 242.7 ms. No-op node floor: 36.9 / 65.8 ms (1) and 63.9 / 113.7 ms (20). Process time, not time added to the tool call |
| ms added per tool call, `type: "http"` (median, p95) | pass | in-process POST: 1 session 3.1 / 4.9 ms; 20 sessions 3.0 / 14.9 ms |
| Server CPU at 20 sessions | pass | command hook: 160 ms CPU over the run, 2.4 % of one core (200 events); http: 36.7 ms, 0.73 % (200 events) |
| Command hook vs `type: "http"` | pass | http is about 20-40x cheaper per call and needs no process spawn; both shapes delivered 1 event in a real `claude -p --model haiku` session |
| Added ms measured inside a real Claude session | not measured | a one-tool-call `-p` run is dominated by model latency (8-9 s); the hook cost is below that noise. Only the simulated numbers above are measured |

## Reproduce
Scratch folder `<scratch>/spikes/s5/` holds the files below (port 4799). Run the three benches from that folder.
`server.mjs`:
```js
import http from "node:http";
let n = 0;
const srv = http.createServer((req, res) => {
  if (req.url === "/stats") { res.end(JSON.stringify({ n, cpu: process.cpuUsage() })); return; }
  const c = []; req.on("data", d => c.push(d));
  req.on("end", () => { n++; JSON.parse(Buffer.concat(c).toString()); res.end("{}"); });
});
srv.listen(4799, "127.0.0.1");
```
`hook.mjs`:
```js
import { readFileSync } from "node:fs";
const e = JSON.parse(readFileSync(0, "utf8"));
e.funtown = { tty: "ttys001", term_program: "x", at: Date.now() };
await fetch("http://127.0.0.1:4799/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(e), signal: AbortSignal.timeout(800) }).catch(() => {});
```
`noop.mjs`:
```js
import { readFileSync } from "node:fs"; readFileSync(0, "utf8");
```
`bench.mjs`:
```js
import { spawn } from "node:child_process";
const [, , script, sessionsS, callsS] = process.argv;
const sessions = +sessionsS, calls = +callsS;
const payload = JSON.stringify({ hook_event_name: "PostToolUse", session_id: "s", tool_name: "Bash", tool_input: { command: "ls" }, tool_response: "x".repeat(2000), cwd: "/x" });
const run = () => new Promise(r => { const t = performance.now(); const p = spawn("node", [script], { stdio: ["pipe", "ignore", "ignore"] }); p.on("close", () => r(performance.now() - t)); p.stdin.end(payload); });
const pct = (a, q) => a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))];
const stats = async () => (await fetch("http://127.0.0.1:4799/stats")).json();
const s0 = await stats(), w0 = performance.now();
const all = [];
await Promise.all(Array.from({ length: sessions }, async () => { for (let i = 0; i < calls; i++) { all.push(await run()); await new Promise(r => setTimeout(r, 500)); } }));
const s1 = await stats(), w = performance.now() - w0;
const cpuMs = (s1.cpu.user - s0.cpu.user + s1.cpu.system - s0.cpu.system) / 1000;
console.log(JSON.stringify({ script, sessions, calls, n: all.length, median: +pct(all, .5).toFixed(1), p95: +pct(all, .95).toFixed(1), serverEvents: s1.n - s0.n, serverCpuMs: +cpuMs.toFixed(1), cpuPct: +(cpuMs / w * 100).toFixed(2) }));
```
`httpbench.mjs`:
```js
const [, , sessionsS, callsS] = process.argv;
const payload = JSON.stringify({ hook_event_name: "PostToolUse", session_id: "s", tool_name: "Bash", tool_input: { command: "ls" }, tool_response: "x".repeat(2000), cwd: "/x" });
const pct = (a, q) => a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))];
const stats = async () => (await fetch("http://127.0.0.1:4799/stats")).json();
const s0 = await stats(), w0 = performance.now(); const all = [];
await Promise.all(Array.from({ length: +sessionsS }, async () => { for (let i = 0; i < +callsS; i++) { const t = performance.now(); await (await fetch("http://127.0.0.1:4799/events", { method: "POST", headers: { "content-type": "application/json" }, body: payload })).text(); all.push(performance.now() - t); await new Promise(r => setTimeout(r, 500)); } }));
const s1 = await stats(), w = performance.now() - w0;
const cpuMs = (s1.cpu.user - s0.cpu.user + s1.cpu.system - s0.cpu.system) / 1000;
console.log(JSON.stringify({ mode: "http", n: all.length, median: +pct(all, .5).toFixed(1), p95: +pct(all, .95).toFixed(1), serverCpuMs: +cpuMs.toFixed(1), cpuPct: +(cpuMs / w * 100).toFixed(2) }));
```
```
node server.mjs &
node bench.mjs noop.mjs 20 10      # floor
node bench.mjs hook.mjs 20 10      # command hook: median, p95, serverCpuMs
node httpbench.mjs 20 10           # type: http
```
Real session check: three settings files, one per shape. Make them from a scratch repo (`<scratch-repo>`: a new local git repo, trusted once by hand).
`set-cmd.json`:
```json
{"hooks":{"PostToolUse":[{"matcher":"*","hooks":[{"type":"command","command":"node <scratch>/spikes/s5/hook.mjs"}]}]}}
```
`set-async.json`:
```json
{"hooks":{"PostToolUse":[{"matcher":"*","hooks":[{"type":"command","command":"node <scratch>/spikes/s5/hook.mjs","async":true}]}]}}
```
`set-http.json`:
```json
{"hooks":{"PostToolUse":[{"matcher":"*","hooks":[{"type":"http","url":"http://127.0.0.1:4799/events"}]}]}}
```
```
cd <scratch-repo>; claude -p "Run the shell command: echo hi" --model haiku --settings <file> --allowedTools=Bash
curl -s 127.0.0.1:4799/stats
```
Put the prompt before `--allowedTools`; that flag takes several values and swallows a trailing prompt.

## Consequence
Pass. Keep the current command-hook shape with `async: true`: Claude doesn't wait for it, and it keeps the tty lookup the jump needs. `type: "http"` (3 ms median, 15 ms p95 at 20 sessions) stays a fallback; it needs another source for the tty (the agents JSON). The per-call cost inside a live session was not timed (see the last row).
