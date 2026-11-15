# S2: attach through node-pty and xterm.js
Claude Code: 2.1.325   Date: 2026-11-15   Verdict: partial

Setup: a Node server (node-pty + ws) spawns `claude attach <id>` per WebSocket; a page runs xterm.js and fit addon; Chromium driven by playwright-core sent real key, wheel and paste events. Session: idle `--bg --model haiku` in a new local repo.

| Criterion | Result | Evidence |
|---|---|---|
| Render | pass | page shows the Claude Code banner, input box and status line; terminal is 109x35 for a 1000x600 viewport; the app runs in the alternate screen with mouse tracking on |
| Resize | pass | viewport 1000x600 to 600x380: terminal 109x35 to 65x22, input box and status line redrawn to the new width at the bottom; back to 109x35 |
| Shift+Enter | partial | xterm.js sends a plain `\r` for Shift+Enter, so the prompt is submitted. With a key handler that sends `\x1b\r` (Esc then Enter) the input shows `line1` / `line2` on two lines, nothing submitted. `\n` was not tested |
| Esc | pass | Esc Esc clears typed text; one Esc during a running turn prints `Interrupted · What should Claude do instead?` and the status goes busy to idle |
| `!cmd` | pass | `!echo spike-bang-ok` shows `! echo spike-bang-ok` then `⎿ spike-bang-ok` (the model then comments on it) |
| Slash command | pass | `/context` shows the menu while typing and the context breakdown after Enter |
| Wheel | pass | `page.mouse.wheel` sends mouse sequences (`\x1b[<64;..M`) to the app; after `!seq 1 150` and wheel up the transcript scrolled to lines 126-128; xterm's own scrollback stays empty (alternate screen) |
| Killing the client leaves the session working | pass | long prompt sent, browser closed (server SIGHUPs the pty) while `status` was busy; later `idle` and the transcript holds the final text; re-attach shows the finished turn |
| Paste + Enter when idle | pass | `term.paste(...)` arrives as a bracketed paste (mode on), sits in the input box, Enter starts the turn (`status` busy); transcript holds the reply `PASTE-IDLE-OK` |
| Paste + Enter when busy | pass | while the model wrote a long reply, paste + Enter showed `ctrl+x ctrl+s to send now` and `Press up to edit queued messages`; after the turn ended the queued text ran as the next turn (reply `PASTE-BUSY-OK`) |
| Second attach | pass | two clients on one session both stay connected and show the same screen; typing in either lands in the same input line (`hello from A +B`); both render at the narrower client's width (87 cols, not 109) |

## Reproduce
Scratch folder `<scratch>/s2` with `npm i node-pty @xterm/xterm @xterm/addon-fit ws playwright-core`.
```
chmod +x node_modules/node-pty/prebuilds/*/spawn-helper   # npm install leaves it without the exec bit; spawn fails with "posix_spawnp failed"
git init repo && git -C repo commit --allow-empty -m init
claude                       # once in repo, accept the trust prompt (--bg refuses an untrusted folder)
(cd repo && claude --bg --model haiku)       # prints the id; never add --help after --bg, it starts a session
PORT=4792 node server.js              # spawns: pty.spawn('claude', ['attach', id], { name: 'xterm-256color', cols, rows })
# page: new Terminal + FitAddon, ws.send({t:'in',d}) from term.onData, {t:'resize',c,r} from term.onResize
# Shift+Enter: term.attachCustomKeyEventHandler: on Shift+Enter keydown send '\x1b\r', return false
# drive with playwright-core: keyboard.type / press, mouse.wheel, term.paste; read screen via term.buffer.active
claude stop <id>; claude rm <id>
```
Status was read with `claude agents --json` (`status`: `busy` / `idle`). The files, all in `<scratch>/s2`:
`server.js`:
```js
// Spike S2: node-pty runs `claude attach <id>`; xterm.js page over a WebSocket.
const http = require('http'), fs = require('fs'), path = require('path');
const pty = require('node-pty'); const { WebSocketServer } = require('ws');
const nm = path.join(__dirname, 'node_modules');
const files = {
  '/': ['page.html', 'text/html'],
  '/xterm.js': [nm + '/@xterm/xterm/lib/xterm.js', 'text/javascript'],
  '/xterm.css': [nm + '/@xterm/xterm/css/xterm.css', 'text/css'],
  '/fit.js': [nm + '/@xterm/addon-fit/lib/addon-fit.js', 'text/javascript'],
};
const srv = http.createServer((q, r) => {
  const f = files[q.url.split('?')[0]]; if (!f) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': f[1] }); r.end(fs.readFileSync(path.resolve(__dirname, f[0])));
});
const wss = new WebSocketServer({ server: srv });
wss.on('connection', (ws, req) => {
  const u = new URL(req.url, 'http://x'); const id = u.searchParams.get('id');
  const cols = +u.searchParams.get('cols') || 100, rows = +u.searchParams.get('rows') || 30;
  const p = pty.spawn('claude', ['attach', id], { name: 'xterm-256color', cols, rows, cwd: process.env.HOME, env: process.env });
  console.log('spawn', id, 'pid', p.pid);
  p.onData(d => ws.readyState === 1 && ws.send(d));
  p.onExit(e => { console.log('pty exit', p.pid, e); ws.close(); });
  ws.on('message', m => { const o = JSON.parse(m); if (o.t === 'in') p.write(o.d); else if (o.t === 'resize') p.resize(o.c, o.r); });
  ws.on('close', () => { console.log('ws close, kill pty', p.pid); try { p.kill(); } catch {} });
});
srv.listen(+process.env.PORT || 4790, '127.0.0.1', () => console.log('up'));
```
`page.html`:
```html
<!doctype html><html><head><link rel="stylesheet" href="/xterm.css"><style>body{margin:0;background:#000}#t{width:100vw;height:100vh}</style></head>
<body><div id="t"></div><script src="/xterm.js"></script><script src="/fit.js"></script><script>
const q = new URLSearchParams(location.search);
window.sent=[];const term = new Terminal({ cursorBlink: true, scrollback: 1000 }); const fit = new FitAddon.FitAddon();
term.loadAddon(fit);
const sf=q.get('shiftfix'); if(sf) term.attachCustomKeyEventHandler(e=>{ if(e.key==='Enter'&&e.shiftKey){ if(e.type==='keydown'){ const d=sf==='esc'?'\x1b\r':'\n'; window.sent.push(d); ws.send(JSON.stringify({t:'in',d})); } return false;} return true; }); term.open(document.getElementById('t')); fit.fit();
const ws = new WebSocket(`ws://${location.host}/?id=${q.get('id')}&cols=${term.cols}&rows=${term.rows}`);
window.term = term; window.ws = ws;
ws.onmessage = e => term.write(e.data);
term.onData(d => { window.sent.push(d); ws.send(JSON.stringify({ t: 'in', d })); });
term.onResize(({ cols, rows }) => ws.send(JSON.stringify({ t: 'resize', c: cols, r: rows })));
window.addEventListener('resize', () => fit.fit());
window.screen_ = () => { const b = term.buffer.active; const out = []; for (let i = 0; i < b.length; i++) out.push(b.getLine(i).translateToString(true)); return out.join('\n').replace(/\n+$/, ''); };
window.viewport_ = () => { const b = term.buffer.active; const out = []; for (let i = 0; i < term.rows; i++) out.push(b.getLine(b.viewportY + i)?.translateToString(true) ?? ''); return out.join('\n'); };
</script></body></html>
```
`lib.js`:
```js
const { chromium } = require('playwright-core');
const fs = require('fs');
const base = process.env.BASE || 'http://127.0.0.1:4792';
exports.sleep = ms => new Promise(r => setTimeout(r, ms));
exports.open = async (id, w = 1000, h = 600) => {
  const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac/Chromium.app/Contents/MacOS/Chromium';
  const b = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined, headless: true });
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  await p.goto(`${base}/?id=${id}`);
  return { b, p, vp: () => p.evaluate(() => window.viewport_()), all: () => p.evaluate(() => window.screen_()),
    size: () => p.evaluate(() => [term.cols, term.rows]),
    waitText: async (t, ms = 30000) => { const e = Date.now() + ms; while (Date.now() < e) { const s = await p.evaluate(() => window.screen_()); if (s.includes(t)) return true; await exports.sleep(300); } return false; } };
};
const { execSync } = require('child_process');
exports.status = id => { const a = JSON.parse(execSync('claude agents --json', { encoding: 'utf8' })); const x = a.find(s => s.id === id || s.sessionId?.startsWith(id)); return x ? x.status : 'gone'; };
exports.waitIdle = async (id, ms = 90000) => { const e = Date.now() + ms; while (Date.now() < e) { if (exports.status(id) === 'idle') return true; await exports.sleep(1000); } return false; };
```
`lib.js` is the helper every driver below uses. Each driver takes the session id as its first argument and Chromium opens the page at `http://127.0.0.1:4792/?id=<id>`; `t2.js` takes a second argument (`esc` or `nl`) for the Shift+Enter variant. `t0` renders, `t1` resizes and covers Esc and slash commands, `t2` Shift+Enter, `t3` Esc and `!cmd`, `t4` the wheel, `t5` paste, `t6` killing the client, `t7` a second attach.
`t0.js`:
```js
const { open, sleep } = require('./lib'); (async () => {
  const s = await open(process.argv[2]); await sleep(4000); console.log(await s.size()); console.log(await s.vp()); await s.b.close(); })();
```
`t1.js`:
```js
const { open, sleep } = require('./lib'); const id = process.argv[2];
const tail = (s, n = 8) => s.split('\n').filter(l => l.trim()).slice(-n).join('\n');
(async () => {
  const s = await open(id, 1000, 600), p = s.p; await sleep(3000);
  // resize
  console.log('size0', await s.size());
  await p.setViewportSize({ width: 600, height: 380 }); await sleep(1500);
  console.log('size1', await s.size()); console.log(tail(await s.vp(), 4));
  await p.setViewportSize({ width: 1000, height: 600 }); await sleep(1500);
  console.log('size2', await s.size());
  await p.click('#t');
  // Shift+Enter
  await p.keyboard.type('line1'); await p.keyboard.press('Shift+Enter'); await p.keyboard.type('line2'); await sleep(800);
  console.log('SHIFT+ENTER sent', JSON.stringify(await p.evaluate(() => sent.slice(-3)))); console.log(tail(await s.vp(), 6));
  // Esc Esc clears
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await sleep(800);
  console.log('after ESC ESC'); console.log(tail(await s.vp(), 5));
  await p.keyboard.press('Control+U'); await sleep(300);
  // bang
  await p.keyboard.type('!echo spike-bang-ok'); await p.keyboard.press('Enter'); await sleep(3000);
  console.log('BANG'); console.log(tail(await s.vp(), 8));
  // slash
  await p.keyboard.type('/context'); await sleep(600); console.log('SLASH menu'); console.log(tail(await s.vp(), 6));
  await p.keyboard.press('Enter'); await sleep(3000); console.log('after /context'); console.log(tail(await s.vp(), 12));
  await s.b.close();
})();
```
`t2.js`:
```js
const { open, sleep } = require('./lib'); const id = process.argv[2], mode = process.argv[3];
const tail = (s, n = 8) => s.split('\n').filter(l => l.trim()).slice(-n).join('\n');
(async () => {
  const s = await open(id, 1000, 600), p = s.p; await sleep(300);
  if (mode) { await p.goto(`http://127.0.0.1:4792/?id=${id}&shiftfix=${mode}`); }
  await sleep(3000); await p.click('#t');
  await p.keyboard.type('line1'); await p.keyboard.press('Shift+Enter'); await p.keyboard.type('line2'); await sleep(800);
  console.log('mode', mode, 'sent', JSON.stringify(await p.evaluate(() => sent.filter(x=>!x.startsWith('\x1b[?')).slice(-5)))); console.log(tail(await s.vp(), 7));
  await s.b.close();
})();
```
`t3.js`:
```js
const { open, sleep } = require('./lib'); const id = process.argv[2];
const tail = (s, n = 8) => s.split('\n').filter(l => l.trim()).slice(-n).join('\n');
(async () => {
  const s = await open(id, 1000, 600), p = s.p; await sleep(300);
  await p.goto(`http://127.0.0.1:4792/?id=${id}&shiftfix=esc`); await sleep(3000); await p.click('#t');
  await p.keyboard.type('draft text'); await sleep(300); await p.keyboard.press('Escape'); await sleep(200); await p.keyboard.press('Escape'); await sleep(800);
  console.log('ESC ESC idle:'); console.log(tail(await s.vp(), 4));
  await p.keyboard.type('!echo spike-bang-ok'); await sleep(400);
  await p.keyboard.press('Enter'); await sleep(3000); console.log('bang result:'); console.log(tail(await s.vp(), 7));
  console.log('status', require('./lib').status(id));
  await p.keyboard.type('Run the bash command: sleep 40, then say done'); await p.keyboard.press('Enter'); await sleep(10000);
  console.log('busy:'); console.log(tail(await s.vp(), 6));
  await p.keyboard.press('Escape'); await sleep(3000); console.log('after Esc:'); console.log(tail(await s.vp(), 6));
  await s.b.close();
})();
```
`t4.js`:
```js
const { open, sleep } = require('./lib'); const id = process.argv[2];
const tail = (s, n = 8) => s.split('\n').filter(l => l.trim()).slice(-n).join('\n');
(async () => {
  const s = await open(id, 1000, 600), p = s.p; await sleep(300);
  await p.goto(`http://127.0.0.1:4792/?id=${id}&shiftfix=esc`); await sleep(3000); await p.click('#t');
  await p.keyboard.type('!seq 1 150'); await p.keyboard.press('Enter'); await sleep(6000);
  const info = () => p.evaluate(() => ({ y: term.buffer.active.viewportY, base: term.buffer.active.baseY, len: term.buffer.active.length, alt: term.buffer.active.type, mouse: term.modes.mouseTrackingMode, sent: sent.filter(x => x.startsWith('\x1b[<')).length }));
  console.log('before', JSON.stringify(await info())); console.log(tail(await s.vp(), 5));
  await p.mouse.move(500, 300);
  for (let i = 0; i < 5; i++) { await p.mouse.wheel(0, -300); await sleep(200); }
  await sleep(800); console.log('after wheel up', JSON.stringify(await info())); console.log((await s.vp()).split('\n').filter(l=>l.trim()).slice(0,4).join('\n'));
  for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, 300); await sleep(100); }
  await sleep(500); console.log('after wheel down', JSON.stringify(await info()));
  await s.b.close();
})();
```
`t5.js`:
```js
const { open, sleep, status } = require('./lib'); const id = process.argv[2];
const tail = (s, n = 8) => s.split('\n').filter(l => l.trim()).slice(-n).join('\n');
(async () => {
  const s = await open(id, 1000, 600), p = s.p; await sleep(300);
  await p.goto(`http://127.0.0.1:4792/?id=${id}&shiftfix=esc`); await sleep(3000); await p.click('#t');
  await p.keyboard.type('/clear'); await p.keyboard.press('Enter'); await sleep(2500);
  console.log('bracketed paste mode:', await p.evaluate(() => term.modes.bracketedPasteMode));
  await p.evaluate(() => term.paste('Reply with exactly: PASTE-IDLE-OK')); await sleep(800);
  console.log('after paste, before Enter (status ' + status(id) + '):'); console.log(tail(await s.vp(), 4));
  await p.keyboard.press('Enter'); await sleep(1500); console.log('after Enter, status', status(id)); console.log(tail(await s.vp(), 6)); await sleep(6000); console.log(tail(await s.vp(), 6));
  // busy
  await p.keyboard.type('Write a 600 word story about a lighthouse keeper. No tools.'); await p.keyboard.press('Enter'); await sleep(2500);
  console.log('busy status', status(id));
  await p.evaluate(() => term.paste('Reply with exactly: PASTE-BUSY-OK')); await sleep(600);
  await p.keyboard.press('Enter'); await sleep(1000);
  console.log('after busy paste+Enter:'); console.log(tail(await s.vp(), 8));
  for (let i = 0; i < 40 && status(id) !== 'idle'; i++) await sleep(1500);
  await sleep(8000); console.log('later, status', status(id)); console.log(tail(await s.vp(), 10));
  await s.b.close();
})();
```
`t6.js`:
```js
const { open, sleep, status } = require('./lib'); const id = process.argv[2];
const tail = (s, n = 8) => s.split('\n').filter(l => l.trim()).slice(-n).join('\n');
(async () => {
  const s = await open(id, 1000, 600), p = s.p; await sleep(300);
  await p.goto(`http://127.0.0.1:4792/?id=${id}&shiftfix=esc`); await sleep(3000); await p.click('#t');
  await p.keyboard.type('Count from 1 to 60, one number per line, then write KILL-TEST-DONE. No tools.'); await p.keyboard.press('Enter'); await sleep(2000);
  console.log('status before kill', status(id));
  await s.b.close(); // ws close -> server kills pty (SIGHUP)
  await sleep(1500); console.log('status right after client killed', status(id));
  for (let i = 0; i < 30 && status(id) !== 'idle'; i++) await sleep(1000);
  console.log('status later', status(id));
  const { execSync } = require('child_process');
  console.log(execSync(`grep -c KILL-TEST-DONE ~/.claude/projects/*s2-repo/*.jsonl | head -3`).toString());
  // re-attach works and shows result
  const s2 = await open(id, 1000, 600); await sleep(3500); console.log('reattach:'); console.log(tail(await s2.all(), 6));
  await s2.b.close();
})();
```
`t7.js`:
```js
const { open, sleep, status } = require('./lib'); const id = process.argv[2];
const tail = (s, n = 6) => s.split('\n').filter(l => l.trim()).slice(-n).join('\n');
(async () => {
  const A = await open(id, 1000, 600); await sleep(3000);
  const B = await open(id, 800, 500); await sleep(3000);
  console.log('A tail:\n' + tail(await A.all())); console.log('B tail:\n' + tail(await B.all()));
  await A.p.click('#t'); await A.p.keyboard.type('hello from A'); await sleep(1000);
  console.log('after typing in A -> A:\n' + tail(await A.all(), 4)); console.log('B:\n' + tail(await B.all(), 4));
  await B.p.click('#t'); await B.p.keyboard.type(' +B'); await sleep(1000);
  console.log('after typing in B -> A:\n' + tail(await A.all(), 4)); console.log('B:\n' + tail(await B.all(), 4));
  console.log('A open?', await A.p.evaluate(() => ws.readyState), 'B open?', await B.p.evaluate(() => ws.readyState));
  console.log('status', status(id));
  await A.b.close(); await B.b.close();
})();
```

## Consequence
Shift+Enter needs the `\x1b\r` mapping in the page's key handler; add it to the attach panel (no plan item fails). Two clients on one session share the input line and the narrower width, so a proposal for the user to decide in m7: the panel warns or blocks a second attach to a session already attached elsewhere.
