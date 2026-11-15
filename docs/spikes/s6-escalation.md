# S6: AskUserQuestion from a --bg lead with a subagent running
Claude Code: 2.1.325   Date: 2026-11-15   Verdict: pass

| Criterion | Result | Evidence |
|---|---|---|
| AskUserQuestion from a `--bg` lead reaches the PreToolUse hook while a subagent runs | pass | Log order: `SubagentStart` (agent_id `a894f3d1...`) at t, then `PreToolUse.AskUserQuestion` with the lead's `session_id` and no `agent_id` 1.7 s later; `claude agents --json` showed the lead `status: busy` and the subagent's `agent-<id>.jsonl` under the lead's `subagents/` folder |
| The answer returns to the lead | pass | Hook reply `permissionDecision: allow` + `updatedInput.answers = {"Which color?": "blue"}`; the lead's log shows `User answered Claude's questions: Which color? → blue` and its next message "You answered blue" |
| The subagent keeps running while the question is held | pass | After the answer, the lead said the background agent was still on its `sleep 60` step; the footer read `1 shell still running` |

The hold server and hook are the ones in `s1-hook-hold.md` (Reproduce). The question reaches the hook with the lead's `session_id`; a subagent's own tool calls carry `agent_id`, the lead's do not, so a card can tell them apart.

## Reproduce
Set up the hold server and hook as in `s1-hook-hold.md`, then:

```
cd <scratch>/spikes/s1
touch decision/PreToolUse.hold
cd work/repo1
env $(env | grep -oE '^(CLAUDE[A-Z_]*|AI_AGENT)' | sed 's/^/-u /') claude --bg \
  --settings <scratch>/spikes/s1/settings.json --model haiku --permission-mode manual -n s6-lead \
  "First, use the Agent tool with run_in_background set to true to start a general-purpose subagent whose task is: read every file in the current directory one by one, then run the bash command sleep 60, then reply done. Do not wait for it. Immediately after launching it, use the AskUserQuestion tool to ask me one question: Which color? with options red and blue. Then state exactly what I answered and stop."
sleep 40; cat <scratch>/spikes/s1/log.jsonl          # SubagentStart, then PreToolUse.AskUserQuestion held
cat > <scratch>/spikes/s1/decision/PreToolUse.AskUserQuestion.json <<'EOF'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","updatedInput":{"questions":[{"question":"Which color?","header":"Color","options":[{"label":"red","description":"Choose red"},{"label":"blue","description":"Choose blue"}],"multiSelect":false}],"answers":{"Which color?":"blue"}}}}
EOF
claude logs <id>        # shows the answer reaching the lead
claude stop <id>; claude rm <id>
```

The `env -u` wrapper (every `CLAUDE*` and `AI_AGENT` variable) is needed only when launching from inside another Claude Code session, whose inherited markers switch transcript saving off.

## Consequence
None: pass. Cards can answer a lead's AskUserQuestion through a PreToolUse hook even while its subagents run.
