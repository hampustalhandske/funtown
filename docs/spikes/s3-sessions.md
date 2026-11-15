# S3: join `claude agents --json` with hook payloads (V3, V5, V7)
Claude Code: 2.1.325   Date: 2026-11-15   Verdict: partial

| Criterion | Result | Evidence |
|---|---|---|
| `sessionId` equals hook `session_id`, `--bg` | pass | `--bg` printed id `2a2362f8`; agents `sessionId` `2a2362f8-95a6-4295-a139-95b3f725b1a2` = hook `session_id` on SessionStart, UserPromptSubmit, Stop. `id` is the first 8 characters of `sessionId`. |
| `sessionId` equals hook `session_id`, interactive | pass | pty session: agents `sessionId` `3918bcca-...` = hook `session_id` on all 4 events; entry has `kind: "interactive"`, no `id` field. |
| `name` stable over a restart | pass | `--bg` name `s3bg`: same after `claude stop` + `claude respawn` (new `pid`, same `sessionId`; hook `SessionEnd`, then `SessionStart` source `resume`). Interactive: `claude --resume <id>` without `--name` still lists `s3int`, same `sessionId`. |
| `id` after `/clear` | pass (changes) | Interactive: `/clear` gives a new `sessionId` (`3918bcca` to `b245c8b8`), same `pid`, same `name`. Hooks: `SessionEnd` (old id), then `SessionStart` with `source: "clear"` (new id). A join must follow the pid and re-key on the new `sessionId`. |
| `status`/`waitingFor` during a pending prompt | pass | `--bg` and interactive, Write tool, `--permission-mode default`: `status: "waiting"`, `waitingFor: "permission prompt"` (`--bg` also `state: "blocked"`). Hooks: PreToolUse, PermissionRequest, then Notification about 6 s later. Working: `status: "busy"` (`--bg` `state: "working"`); idle: `status: "idle"` (`state: "done"`). |
| Hooks fire in `--bg` sessions | pass | With `--settings`: SessionStart (source `startup`), UserPromptSubmit, PreToolUse, PostToolUse, Stop, and SessionEnd on `claude stop`. |
| Idle stopped `--bg` session stays listed | partial | After `claude stop` it is absent from `claude agents --json` and present only with `--all`, with no `pid` and no `status` (`state: "done"`). A live idle `--bg` session stays listed (`status: "idle"`). `claude rm <id>` removes it from `--all` too. |

Other findings:
- In the default mode of the user's setup (auto mode) a Bash `touch` raised no prompt, so a pending-prompt test needs `--permission-mode default` and a Write.
- A `--bg` session in a git repo with a pending Write created a worktree (`.claude/worktrees/<name>`); `claude rm` removed it (relevant to S4).
- A pty child started from inside a Claude session did not register in `~/.claude/sessions/` (so was missing from `claude agents --json`) until every `CLAUDE*` and `AI_AGENT` variable was removed from its environment. Set a pty size too.
- Hook `session_id` does not carry the short `id`; join on `sessionId`.

## Reproduce
Scratch: `<scratch>/spikes/s3` with `repo/` (new local git repo, trusted once by hand), `settings.json` (a command hook on SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, Notification, SessionEnd, PermissionRequest, SubagentStart, SubagentStop) and `hook.js`, which appends `{ev, sid, src, ...}` per payload to `hooks.jsonl`.
`hook.js`:
```js
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
 try{const j=JSON.parse(s);require('fs').appendFileSync(process.env.S3_LOG||__dirname+'/hooks.jsonl',JSON.stringify({t:Date.now(),ev:j.hook_event_name,sid:j.session_id,src:j.source,cwd:j.cwd,tool:j.tool_name,pid:process.ppid})+'\n')}catch(e){}
});
```
`settings.json` (the same command hook on ten events):
```json
{"hooks":{
 "SessionStart":[{"hooks":[{"type":"command","command":"node <scratch>/spikes/s3/hook.js"}]}],
 "UserPromptSubmit":[{"hooks":[{"type":"command","command":"node <scratch>/spikes/s3/hook.js"}]}],
 "PreToolUse":[{"hooks":[{"type":"command","command":"node <scratch>/spikes/s3/hook.js"}]}],
 "PostToolUse":[{"hooks":[{"type":"command","command":"node <scratch>/spikes/s3/hook.js"}]}],
 "Stop":[{"hooks":[{"type":"command","command":"node <scratch>/spikes/s3/hook.js"}]}],
 "Notification":[{"hooks":[{"type":"command","command":"node <scratch>/spikes/s3/hook.js"}]}],
 "SessionEnd":[{"hooks":[{"type":"command","command":"node <scratch>/spikes/s3/hook.js"}]}],
 "PermissionRequest":[{"hooks":[{"type":"command","command":"node <scratch>/spikes/s3/hook.js"}]}],
 "SubagentStart":[{"hooks":[{"type":"command","command":"node <scratch>/spikes/s3/hook.js"}]}],
 "SubagentStop":[{"hooks":[{"type":"command","command":"node <scratch>/spikes/s3/hook.js"}]}]
}}
```

```
cd <scratch>/spikes/s3/repo
claude --bg --model haiku --settings ../settings.json --name s3bg "Reply with the single word ok, nothing else."
claude agents --json --all | grep -A8 s3bg        # sessionId vs hooks.jsonl sid
claude stop <id>; claude agents --json; claude agents --json --all   # stopped: only in --all
claude respawn <id>; claude agents --json --all  # same name, sessionId
claude --bg --model haiku --permission-mode default --settings ../settings.json --name s3perm "Use the Write tool to create perm2.txt containing hello"
claude agents --json                              # waiting / permission prompt
claude stop <id>; claude rm <id>
```
Interactive: a Python `pty.fork()` driver, run as `python3 drive.py <scratch>/spikes/s3`, that removes `CLAUDE*`/`AI_AGENT` from the environment, sets a 45x150 window, runs `claude --model haiku --settings ../settings.json --name s3int`, sends a prompt, `/clear`, another prompt, `/exit`, and runs `claude agents --json` between steps:
`drive.py`:
```python
import pty,os,sys,time,select,subprocess,json,re
S=sys.argv[1]
def snap(tag):
    #print(tag,'files',[ (f,open(os.path.expanduser('~/.claude/sessions/'+f)).read()[:200]) for f in os.listdir(os.path.expanduser('~/.claude/sessions')) if f.startswith(str(cpid)+'.')],flush=True)
    out=subprocess.run(['claude','agents','--json'],capture_output=True,text=True).stdout
    for a in json.loads(out):
        if a.get('name')=='s3int' or a['pid']==cpid: print(tag,{k:v for k,v in a.items() if k not in('cwd','startedAt')},flush=True)
pid,fd=pty.fork()
if pid==0:
    for k in list(os.environ):
        if k.startswith('CLAUDE') or k=='AI_AGENT': del os.environ[k]
    os.chdir(S+'/repo')
    os.execvp('claude',['claude','--model','haiku','--settings',S+'/settings.json','--name','s3int'])
import fcntl,termios,struct
fcntl.ioctl(fd,termios.TIOCSWINSZ,struct.pack('HHHH',45,150,0,0))
def pump(t):
    end=time.time()+t
    while time.time()<end:
        r,_,_=select.select([fd],[],[],0.3)
        if r:
            try: os.read(fd,65536)
            except OSError: return
def send(s): os.write(fd,s.encode())
cpid=pid
pump(6); send('Reply with the word one and nothing else.'); pump(1); send('\r'); pump(10)
snap('before-clear')
send('/clear'); pump(1); send('\r'); pump(4); snap('after-clear')
send('Reply with the word two and nothing else.'); pump(1); send('\r'); pump(8); snap('after-prompt')
send('/exit'); pump(1); send('\r'); pump(4)
try: os.kill(pid,9)
except: pass
```
 For the pending prompt: a copy of the driver that launches `claude --model haiku --settings <scratch>/spikes/s3/settings.json --resume <sessionId> --permission-mode default`, waits 8 s, runs the snapshot, sends `Use the Write tool to create perm3.txt containing hi` then `\r`, waits 10 s, runs the snapshot and kills the process.
Cleanup check: `claude agents --json --all | grep -c spikes/s3` gives 0.

## Consequence
None blocking. Plan for: `/clear` re-keys the session (same pid, new `sessionId`); stopped `--bg` sessions are visible only through `--all`, so the session list should call `claude agents --json --all` if stopped sessions should show.
