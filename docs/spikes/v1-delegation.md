# V1: delegation through the Agent tool (with V6)
Claude Code: 2.1.325   Date: 2026-11-15   Verdict: pass

| Criterion | Result | Evidence |
|---|---|---|
| PreToolUse on Agent carries description, prompt and subagent_type | pass | `tool_name: "Agent"`, `tool_input: {description: "say word", prompt: "Reply with exactly the sentence: ...", subagent_type: "general-purpose"}` |
| `tool_use_id` of PreToolUse joins SubagentStart's `agent_id` | partial | SubagentStart has `agent_id`, `agent_type`, `session_id`, no `tool_use_id`. The join is PostToolUse on Agent: same `tool_use_id` as PreToolUse, and `tool_response.agentId` equals SubagentStart `agent_id` (`a1736a57adf53880d`) |
| SubagentStop `last_assistant_message` equals the text the lead receives | pass | `last_assistant_message: "The pelican sings at dawn."`; the lead's `<task-notification>` (from Claude's transcript, reference only) has `<tool-use-id>` equal to the Agent `tool_use_id` and `<result>The pelican sings at dawn.</result>` |

Other findings:
- The Agent tool launched the subagent asynchronously (`tool_response.status: "async_launched"`). The lead's immediate tool result holds no subagent text; the text arrives later as the task notification, which names the Agent `tool_use_id`.
- Reference only: the notification's `<task-id>` equals `agent_id`. The notification comes from Claude's transcript, which Funtown doesn't read, so the PostToolUse join is the one to use.
- SubagentStop also carries `agent_transcript_path` and `background_tasks`.
- One run, one short single-line answer. Multi-line or long answers were not tested for exact equality.

## Reproduce
The two files in `<scratch>/spikes/v1/`:
`log.sh`:
```bash
#!/bin/bash
cat >> <scratch>/spikes/v1/hooks.jsonl; echo >> <scratch>/spikes/v1/hooks.jsonl
```
`settings.json`:
```json
{"hooks":{
 "PreToolUse":[{"matcher":"Agent","hooks":[{"type":"command","command":"<scratch>/spikes/v1/log.sh"}]}],
 "PostToolUse":[{"matcher":"Agent","hooks":[{"type":"command","command":"<scratch>/spikes/v1/log.sh"}]}],
 "SubagentStart":[{"hooks":[{"type":"command","command":"<scratch>/spikes/v1/log.sh"}]}],
 "SubagentStop":[{"hooks":[{"type":"command","command":"<scratch>/spikes/v1/log.sh"}]}]
}}
```
```
S=<scratch>/spikes/v1; mkdir -p $S/repo && git -C $S/repo init -q
chmod +x $S/log.sh        # $S/log.sh and $S/settings.json are the two files above
cd $S/repo && claude -p --model haiku --settings $S/settings.json --allowedTools Agent \
  --output-format stream-json --verbose \
  "Use the Agent tool once with subagent_type general-purpose, description 'say word', prompt 'Reply with exactly the sentence: The pelican sings at dawn. Nothing else.' Then tell me what the subagent returned." > $S/out.jsonl
# compare tool_use_id / agent_id / last_assistant_message in $S/hooks.jsonl;
# reference only: the notification is in the lead transcript under ~/.claude/projects/<project>/<session_id>.jsonl
claude agents --json   # no session for the spike repo remains
```

## Consequence
Join by PostToolUse `tool_response.agentId`, not by SubagentStart. A map from Agent `tool_use_id` to prompt and description must be kept from PreToolUse until PostToolUse.
