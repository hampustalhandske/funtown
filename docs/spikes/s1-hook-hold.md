# S1: a hook that holds and returns a decision
Claude Code: 2.1.325 (Claude Code)   Date: 2026-11-15   Verdict: partial

Model `haiku`, permission mode `manual` (shown as `default` in hook payloads), hooks given through `claude --settings <file>`. The hook is a command hook that POSTs its stdin to a local server and prints the reply; the server holds the request until a decision file appears.

| Criterion | Result | Evidence |
|---|---|---|
| Permission: allow applies (interactive) | pass | PermissionRequest on `touch m1` held 11 s, reply `decision.behavior: allow`; dialog closed and `m1` exists |
| Permission: deny applies, message reaches Claude (interactive) | pass | Reply `behavior: deny, message: "Denied by Funtown spike"`; no file created; Claude said it was "denied by the Funtown spike" |
| Permission: allow applies (`--bg`) | pass | `claude agents --json` showed `status: waiting, waitingFor: "permission prompt", state: blocked` while held; after allow, `bg1` exists, status `idle` |
| AskUserQuestion answer applies (interactive) | pass | PreToolUse on `AskUserQuestion` held, reply `permissionDecision: allow` + `updatedInput` (original `questions` + `answers: {"Which color?": "blue"}`); tool result `Which color? → blue`; Claude said "You answered: blue" |
| AskUserQuestion answer applies (`--bg`) | pass | Same reply in a `--bg` session; Claude said "You answered: blue" (also S6) |
| ExitPlanMode approval applies (interactive) | pass | PreToolUse on `ExitPlanMode` (input has `plan`, `planFilePath`), reply allow + the input unchanged as `updatedInput`; terminal "User approved Claude's plan", mode became `acceptEdits`, file created |
| ExitPlanMode approval applies (`--bg`) | pass | Same in a `--permission-mode plan` `--bg` session: "User approved Claude's plan"; it then went on to write the file |
| A killed hook falls back to the normal dialog | pass | `kill` of the hook process while PermissionRequest was held: server saw the connection close, the dialog stayed on screen, pressing `1` ran the tool (`m2` exists). Tested interactive only |
| What the terminal shows while held | pass | PermissionRequest: the normal permission dialog (Yes / always / auto mode / No), no marker that a hook is pending; answering it in the terminal works. PreToolUse (AskUserQuestion, ExitPlanMode): spinner line `running PreToolUse hooks… 1/2 · 11s`, no dialog. In `--bg`, `claude attach <id>` shows the same dialog |
| Esc while held fires Stop | pass (it does not) | Esc on the held PermissionRequest dialog: terminal `Interrupted · What should Claude do instead?`, server saw the hook connection close, no `Stop` event reached the server within 8 s. Stop fired only after normal turn ends |
| 2 h timeout honoured | not tested: moved to m8 | Hook with `"timeout": 7200` was still held (connection open, no `closed`) 1802 s (30 min) after its request, past the 600 s default, so the configured timeout is what applies. Not run to 7200 s. The hooks docs set the default at 600 s and state no upper cap for `command` hooks; the CLI has no hook-timeout option |
| Answer typed in the terminal while held (extra) | finding | Pressing `1` in the dialog while the hook was held applied the choice, but the hook process and its server connection stayed open (`lsof` showed it ESTABLISHED) until the server replied; Esc closed it. The server must treat a later `Stop` / `PostToolUse` of the same session as "answered elsewhere" and release the request |

## Reproduce
Scratch folder `<scratch>/spikes/s1` (outside the repo). Needs node, python3 and `pip3 install --target <scratch>/spikes/s1/lib pyte` (screen rendering for the pty driver). The Funtown hooks in `~/.claude/settings.json` still run; they only POST to `127.0.0.1:4777`.

`server.js` (hold server; `PORT` and `SDIR` override port and folder):
```js
const http=require('http'),fs=require('fs'),path=require('path');
const D=process.env.SDIR||__dirname, PORT=+(process.env.PORT||47931);
fs.mkdirSync(path.join(D,'decision'),{recursive:true});
const log=o=>fs.appendFileSync(path.join(D,'log.jsonl'),JSON.stringify({t:Date.now(),...o})+'\n');
http.createServer((req,res)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{
  let p={};try{p=JSON.parse(b)}catch{}
  const key=p.hook_event_name+'.'+(p.tool_name||'');
  log({dir:'in',key,sid:p.session_id,agent:p.agent_id,tuid:p.tool_use_id,input:p.tool_input,mode:p.permission_mode});
  const f=path.join(D,'decision',key+'.json'), g=path.join(D,'decision',p.hook_event_name+'.json');
  const hold=['decision/'+key+'.hold','decision/'+p.hook_event_name+'.hold'].some(x=>fs.existsSync(path.join(D,x)));
  if(!hold){res.writeHead(204);res.end();return}
  const iv=setInterval(()=>{for(const x of [f,g])if(fs.existsSync(x)){const body=fs.readFileSync(x,'utf8');fs.unlinkSync(x);clearInterval(iv);
    log({dir:'out',key,body});res.writeHead(200,{'content-type':'application/json'});res.end(body);return}},200);
  res.on('close',()=>{clearInterval(iv);log({dir:'closed',key})});
});}).listen(PORT,'127.0.0.1');
```
`hook.js` (command hook):
```js
const http=require('http');let b='';process.stdin.on('data',c=>b+=c).on('end',()=>{
  const r=http.request({host:'127.0.0.1',port:+(process.env.PORT||47931),path:'/hook',method:'POST'},res=>{let o='';res.on('data',c=>o+=c);res.on('end',()=>{if(o)process.stdout.write(o);process.exit(0)})});
  r.on('error',()=>process.exit(0));r.end(b)});
```
`settings.json` (`<s1>` is the scratch folder):
```json
{"hooks":{
 "PermissionRequest":[{"hooks":[{"type":"command","command":"node <s1>/hook.js","timeout":600}]}],
 "PreToolUse":[{"matcher":"AskUserQuestion|ExitPlanMode","hooks":[{"type":"command","command":"node <s1>/hook.js","timeout":600}]}],
 "Stop":[{"hooks":[{"type":"command","command":"node <s1>/hook.js","timeout":10}]}],
 "SubagentStart":[{"hooks":[{"type":"command","command":"node <s1>/hook.js","timeout":10}]}]}}
```
`drive.py <cwd> <cmd...>` (pty driver) forks the command on a 120x40 pty, feeds output to a `pyte.Screen`, writes the rendered screen to `$NAME.screen.txt` every 0.5 s and writes any text found in `ctl/$NAME/keys` to the pty (read with `unicode_escape`, so `\r` and `\x1b[B` work). It must subclass `pyte.Screen` with no-op `report_device_status(*a, **k)` or pyte raises on Claude Code's private DSR query. Name it anything but `pty.py`. In the child, delete every `CLAUDE*` environment variable first.

Commands:
```
git init <s1>/work/repo1 && git -C <s1>/work/repo1 commit --allow-empty -m init
(cd <s1> && node server.js &)
touch <s1>/decision/PermissionRequest.hold              # hold every PermissionRequest
cd <s1> && NAME=a python3 drive.py work/repo1 claude --settings <s1>/settings.json --model haiku --permission-mode manual &
# first run: trust dialog; send '\x1b[B' then '\r'
# send the prompt text and, in a separate write, '\r' (a single write with both is not submitted):
#   'Run this exact bash command and nothing else: touch m1'
cat <s1>/log.jsonl                                       # PermissionRequest.Bash is held
echo '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}' > <s1>/decision/PermissionRequest.Bash.json
# deny: "decision":{"behavior":"deny","message":"Denied by Funtown spike"}
# kill: kill the hook's node PID (by PID, not pkill -f) while held
# AskUserQuestion / ExitPlanMode: touch decision/PreToolUse.hold, ask Claude to use the tool (plan mode: shift+tab to "plan mode on"),
#   reply with hookSpecificOutput {hookEventName:"PreToolUse", permissionDecision:"allow", updatedInput:{...tool input..., answers:{...}}}
# --bg: from <s1>/work/repo1
env $(env | grep -o '^CLAUDE[A-Z_]*' | sed 's/^/-u /') claude --bg --settings <s1>/settings.json --model haiku --permission-mode manual -n s1-bg "Run this exact bash command and nothing else: touch bg1"
claude agents --json; claude stop <id>; claude rm <id>
```
Long hold run: second server on `PORT=47932 SDIR=<s1>/t2h`, `touch <s1>/t2h/decision/PermissionRequest.hold` (after the folder exists), settings with `"command":"PORT=47932 node <s1>/hook.js","timeout":7200`, an interactive session in a second repo, one `touch` prompt, then nothing answered. Check that no `closed` line appears after 600 s; for the full 2 h, compare the `in` and `closed` timestamps in `<s1>/t2h/log.jsonl`.

Side effects to know: `echo` and other read-only commands never reach PermissionRequest; use `touch`. A first run in a new folder asks to trust it, and Claude Code records that in its own state. Plan mode writes its plan file to `~/.claude/plans/` itself. A `--bg` session in a git repo asked to write a file chose to create its own worktree under `<repo>/.claude/worktrees/` (see S4); `claude rm <id>` removes it.

## Consequence
The 2 h row is untested (m8 runs it); all other rows pass. Answer path: a PermissionRequest hook (permission) and a PreToolUse hook (AskUserQuestion, ExitPlanMode) can hold and return the decision; killing the hook or pressing Esc leaves the normal terminal dialog. The server must release a held request when the terminal answers first (the hook process otherwise lives until its timeout).
