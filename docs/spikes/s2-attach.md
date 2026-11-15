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
PORT=<free port> node server.js              # spawns: pty.spawn('claude', ['attach', id], { name: 'xterm-256color', cols, rows })
# page: new Terminal + FitAddon, ws.send({t:'in',d}) from term.onData, {t:'resize',c,r} from term.onResize
# Shift+Enter: term.attachCustomKeyEventHandler: on Shift+Enter keydown send '\x1b\r', return false
# drive with playwright-core: keyboard.type / press, mouse.wheel, term.paste; read screen via term.buffer.active
claude stop <id>; claude rm <id>
```
Status was read with `claude agents --json` (`status`: `busy` / `idle`).

## Consequence
Shift+Enter needs the `\x1b\r` mapping in the page's key handler; add it to the attach panel (no plan item fails). Two clients on one session share the input line and the narrower width, so the panel should warn or block a second attach to a session already attached elsewhere.
