import { basename } from "node:path";
import type { Listed } from "./agents.ts";
import type { Card, Character, House, Lead, Stage, Town } from "./types.ts";

/** The hook payload fields the reducer reads. */
export type HookEvent = {
  hook_event_name?: string;
  session_id?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_use_id?: string;
  cwd?: string;
  agent_id?: string;
  agent_type?: string;
  notification_type?: string;
  funtown?: { tty?: string | null; term_program?: string | null; at?: number };
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

/** A copy of `lead` with the needs of its open `cards`, or `lead` itself when it has none. */
function withCards(lead: Lead, cards: Card[]): Lead {
  const own = cards.filter((c) => c.lead === lead.id);
  if (own.length === 0) return lead;
  const shown: Lead = { ...lead, subagents: lead.subagents.map((a) => ({ ...a })) };
  for (const card of own) {
    // A subagent the hooks haven't named yet shows its card's need on its lead.
    const who: Character = shown.subagents.find((a) => a.id === card.agent) ?? shown;
    who.stage = "needs_you";
    who.needs = card.kind;
  }
  return shown;
}

/**
 * Holds the sessions `claude agents --json` lists and the hook data for them. Only listed
 * sessions are on the Town; hook data for a session the list doesn't show is kept for
 * `unlistedMs`, so a session that just started keeps its first events.
 */
export class TownState {
  private leads = new Map<string, Lead>();
  // listed session id -> its cwd, in list order
  private listed = new Map<string, string>();
  // unlisted session id -> when its first hook event arrived
  private heard = new Map<string, number>();
  private agentCounts = new Map<string, number>();
  // session id + agent id ("" for the lead) -> `funtown.at` of the last event applied to it
  private lastAt = new Map<string, number>();
  private readonly claude: Town["claude"];
  private readonly unlistedMs: number;

  /** `claude` is the version check's result, carried on every snapshot; `unlistedMs` how long unlisted hook data is kept. */
  constructor(claude: Town["claude"], unlistedMs: number) {
    this.claude = claude;
    this.unlistedMs = unlistedMs;
  }

  /**
   * Applies one hook event and gives true, or false when it is ignored (no session or name,
   * or older than the last one applied to its character). An event for an unknown session
   * starts its hook data.
   */
  apply(event: HookEvent): boolean {
    const sid = event.session_id;
    if (!sid || !event.hook_event_name) return false;
    const at = event.funtown?.at;
    if (typeof at === "number") {
      const key = `${sid}\0${event.agent_id ?? ""}`;
      if (at < (this.lastAt.get(key) ?? -Infinity)) return false;
      this.lastAt.set(key, at);
    }
    let lead = this.leads.get(sid);
    if (!lead) {
      lead = this.newLead(sid);
      this.heard.set(sid, Date.now());
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
    return true;
  }

  /**
   * Makes `list` (one good `claude agents --json` result) the sessions on the Town: sets each
   * one's name, kind, short id and stage, and forgets sessions that left the list and hook data
   * unlisted for longer than `unlistedMs`.
   */
  sync(list: Listed[]): void {
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
    this.listed = next;
    this.expire();
  }

  /** Forgets hook data that has waited longer than `unlistedMs` for its session to be listed. */
  expire(): void {
    const now = Date.now();
    for (const [sid, at] of this.heard) if (now - at > this.unlistedMs) this.forget(sid);
  }

  /** The listed lead with this session id, or undefined. */
  lead(sessionId: string): Lead | undefined {
    return this.listed.has(sessionId) ? this.leads.get(sessionId) : undefined;
  }

  /**
   * The listed sessions, one house per cwd in list order, with `cards` (open cards of listed
   * leads): while a card is open, the subagent it names, or else its lead, needs the user
   * for the card's kind whatever the list or hooks say.
   */
  snapshot(cards: Card[] = []): Town {
    const houses = new Map<string, House>();
    for (const [sid, cwd] of this.listed) {
      let house = houses.get(cwd);
      if (!house) {
        house = { project: basename(cwd) || cwd, cwd, leads: [] };
        houses.set(cwd, house);
      }
      house.leads.push(withCards(this.leads.get(sid)!, cards));
    }
    return { houses: [...houses.values()], cards, claude: this.claude };
  }

  private forget(sessionId: string): void {
    this.leads.delete(sessionId);
    this.heard.delete(sessionId);
    for (const map of [this.agentCounts, this.lastAt]) {
      for (const key of map.keys()) if (key.startsWith(`${sessionId}\0`)) map.delete(key);
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
