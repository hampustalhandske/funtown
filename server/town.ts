import { basename } from "node:path";
import type { Character, House, Lead, Stage, Town } from "./types.ts";

/** The hook payload fields the reducer reads. */
export type HookEvent = {
  hook_event_name?: string;
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: { command?: unknown };
  agent_id?: string;
  agent_type?: string;
  notification_type?: string;
  funtown?: { tty?: string | null; term_program?: string | null };
};

/** Text shown for a tool call: "Bash: <command>" for Bash, the tool name otherwise. */
function describeTool(event: HookEvent): string | null {
  const tool = event.tool_name;
  if (!tool) return null;
  const command = event.tool_input?.command;
  return tool === "Bash" && typeof command === "string" ? `Bash: ${command}` : tool;
}

/** Why a Notification needs the user, or null when it does not. */
function notificationNeed(type: string | undefined): string | null {
  if (type === "permission_prompt") return "permission";
  if (type === "elicitation_dialog") return "question";
  if (type === "idle_prompt") return "turn ended";
  return null;
}

/** Holds every known session and turns hook events into the Town. */
export class TownState {
  private houses = new Map<string, House>();
  private leads = new Map<string, Lead>();
  private agentCounts = new Map<string, number>();

  /**
   * Applies one hook event. Returns the id of a lead that just became gone, or null.
   * Events for an unknown session create its lead.
   */
  apply(event: HookEvent): string | null {
    const sid = event.session_id;
    if (!sid || !event.hook_event_name) return null;
    const lead = this.leads.get(sid) ?? this.addLead(sid, event.cwd ?? "");
    if (event.funtown?.tty) lead.tty = event.funtown.tty;
    if (event.funtown?.term_program) lead.termProgram = event.funtown.term_program;
    if (lead.stage === "gone" && event.hook_event_name !== "SessionEnd") {
      lead.stage = "working";
    }

    const inSubagent = event.agent_id !== undefined;
    switch (event.hook_event_name) {
      case "SessionStart":
      case "UserPromptSubmit":
        this.setLead(lead, "working", null);
        break;
      case "PreToolUse":
      case "PostToolUse": {
        const activity = event.hook_event_name === "PreToolUse" ? describeTool(event) : null;
        if (inSubagent) {
          const agent = this.agent(lead, event);
          agent.stage = "working";
          agent.activity = activity;
        } else {
          this.setLead(lead, "working", activity);
        }
        break;
      }
      case "PermissionRequest":
        this.setLead(lead, "needs_you", null, "permission");
        break;
      case "Notification": {
        const need = notificationNeed(event.notification_type);
        if (need) this.setLead(lead, "needs_you", null, need);
        break;
      }
      case "Stop":
        this.setLead(lead, "needs_you", null, "turn ended");
        break;
      case "SubagentStart":
        this.agent(lead, event).stage = "working";
        break;
      case "SubagentStop": {
        const agent = this.agent(lead, event);
        agent.stage = "done";
        agent.activity = null;
        break;
      }
      case "SessionEnd":
        this.setLead(lead, "gone", null);
        return sid;
    }
    return null;
  }

  /** Removes a lead, and its house when it was the last one. */
  remove(sessionId: string): void {
    const lead = this.leads.get(sessionId);
    if (!lead) return;
    this.leads.delete(sessionId);
    for (const key of this.agentCounts.keys()) {
      if (key.startsWith(`${sessionId}\0`)) this.agentCounts.delete(key);
    }
    for (const [cwd, house] of this.houses) {
      house.leads = house.leads.filter((l) => l !== lead);
      if (house.leads.length === 0) this.houses.delete(cwd);
    }
  }

  snapshot(): Town {
    return { houses: [...this.houses.values()] };
  }

  private setLead(lead: Lead, stage: Stage, activity: string | null, needs?: string): void {
    lead.stage = stage;
    lead.activity = activity;
    if (needs) lead.needs = needs;
    else delete lead.needs;
  }

  private addLead(sid: string, cwd: string): Lead {
    let house = this.houses.get(cwd);
    if (!house) {
      house = { project: basename(cwd) || cwd, cwd, leads: [] };
      this.houses.set(cwd, house);
    }
    const lead: Lead = {
      id: sid,
      name: `lead-${this.nextNumber(`${cwd}\0lead`)}`,
      stage: "working",
      activity: null,
      tty: null,
      termProgram: null,
      subagents: [],
    };
    house.leads.push(lead);
    this.leads.set(sid, lead);
    return lead;
  }

  private agent(lead: Lead, event: HookEvent): Character {
    const id = event.agent_id ?? "";
    let agent = lead.subagents.find((a) => a.id === id);
    if (!agent) {
      const type = event.agent_type ?? "agent";
      agent = {
        id,
        name: `${type}-${this.nextNumber(`${lead.id}\0${type}`)}`,
        stage: "working",
        activity: null,
      };
      lead.subagents.push(agent);
    }
    return agent;
  }

  private nextNumber(key: string): number {
    const n = (this.agentCounts.get(key) ?? 0) + 1;
    this.agentCounts.set(key, n);
    return n;
  }
}
