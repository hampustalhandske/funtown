import { basename } from "node:path";
import type { Listed } from "./agents.ts";
import type { Character, House, Lead, Stage, Town } from "./types.ts";

/** How long hook data waits for its session to appear in `claude agents --json`. */
const UNLISTED_MS = 10_000;

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


/**
 * Holds the sessions `claude agents --json` lists and the hook data for them. Only listed
 * sessions are on the Town; hook data for a session the list doesn't show is kept for
 * `UNLISTED_MS`, so a session that just started keeps its first events.
 */
export class TownState {
  private leads = new Map<string, Lead>();
  // listed session id -> its cwd, in list order
  private listed = new Map<string, string>();
  // unlisted session id -> when its first hook event arrived
  private heard = new Map<string, number>();
  private agentCounts = new Map<string, number>();
  private readonly claude: Town["claude"];

  /** `claude` is the version check's result, carried on every snapshot. */
  constructor(claude: Town["claude"]) {
    this.claude = claude;
  }

  /** Applies one hook event; an event for an unknown session starts its hook data. */
  apply(event: HookEvent, now = Date.now()): void {
    const sid = event.session_id;
    if (!sid || !event.hook_event_name) return;
    let lead = this.leads.get(sid);
    if (!lead) {
      lead = this.newLead(sid);
      this.heard.set(sid, now);
    }
    if (event.funtown?.tty) lead.tty = event.funtown.tty;
    if (event.funtown?.term_program) lead.termProgram = event.funtown.term_program;

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
          if (activity) agent.step = activity;
        } else {
          this.setLead(lead, "working", activity);
          if (activity) lead.step = activity;
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
    }
  }

  /**
   * Makes `list` (one good `claude agents --json` result) the sessions on the Town: sets each
   * one's name, kind, short id and stage, and forgets sessions that left the list and hook data
   * unlisted for longer than `UNLISTED_MS`.
   */
  sync(list: Listed[], now = Date.now()): void {
    const next = new Map<string, string>();
    for (const s of list) {
      const lead = this.leads.get(s.sessionId) ?? this.newLead(s.sessionId);
      this.heard.delete(s.sessionId);
      lead.name = s.name || lead.name || `lead-${this.nextNumber(`${s.cwd}\0lead`)}`;
      lead.kind = s.kind === "interactive" ? "terminal" : "background";
      lead.shortId = lead.kind === "background" ? (s.id ?? null) : null;
      if (s.status === "busy") {
        lead.stage = "working";
        delete lead.needs;
      } else if (s.status === "waiting") {
        this.setLead(lead, "needs_you", null, s.waitingFor);
      } else if (s.status === "idle") {
        this.setLead(lead, "needs_you", null, "turn ended");
      }
      next.set(s.sessionId, s.cwd);
    }
    for (const sid of this.listed.keys()) if (!next.has(sid)) this.forget(sid);
    for (const [sid, at] of this.heard) if (now - at > UNLISTED_MS) this.forget(sid);
    this.listed = next;
  }

  /** The listed lead with this session id, or undefined. */
  lead(sessionId: string): Lead | undefined {
    return this.listed.has(sessionId) ? this.leads.get(sessionId) : undefined;
  }

  /** The listed sessions, one house per cwd in list order. */
  snapshot(): Town {
    const houses = new Map<string, House>();
    for (const [sid, cwd] of this.listed) {
      let house = houses.get(cwd);
      if (!house) {
        house = { project: basename(cwd) || cwd, cwd, leads: [] };
        houses.set(cwd, house);
      }
      house.leads.push(this.leads.get(sid)!);
    }
    return { houses: [...houses.values()], claude: this.claude };
  }

  private forget(sessionId: string): void {
    this.leads.delete(sessionId);
    this.heard.delete(sessionId);
    for (const key of this.agentCounts.keys()) {
      if (key.startsWith(`${sessionId}\0`)) this.agentCounts.delete(key);
    }
  }

  private setLead(lead: Lead, stage: Stage, activity: string | null, needs?: string): void {
    lead.stage = stage;
    lead.activity = activity;
    if (needs) lead.needs = needs;
    else delete lead.needs;
  }

  private newLead(sid: string): Lead {
    const lead: Lead = {
      id: sid,
      name: "",
      stage: "working",
      activity: null,
      step: null,
      tty: null,
      termProgram: null,
      subagents: [],
      kind: "terminal",
      shortId: null,
    };
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
        step: null,
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
