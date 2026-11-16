import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import type { Listed } from "./agents.ts";
import type { Journal } from "./journal.ts";
import type { Card, Character, House, Lead, Letter, Stage, Town } from "./types.ts";

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
  error?: string;
  last_assistant_message?: string;
  background_tasks?: { id: string; type: string; status: string }[];
  funtown?: { tty?: string | null; term_program?: string | null; at?: number };
};

/** Letters kept per lead, and the longest letter text. */
const MAX_LETTERS = 20;
const MAX_LETTER_TEXT = 65_536;

/** How many of a hook event's `background_tasks` are subagents still running or pending, leaving out `except`. */
function runningAgents(tasks: HookEvent["background_tasks"], except?: string): number {
  return (tasks ?? []).filter((t) => t.type === "subagent" && (t.status === "running" || t.status === "pending") && t.id !== except).length;
}

function waitingOn(n: number): string {
  return `waiting on ${n} ${n === 1 ? "agent" : "agents"}`;
}

/** Text shown for a tool call: "Bash: <command>" for Bash, the tool name otherwise. */
function describeTool(event: HookEvent): string | null {
  const tool = event.tool_name;
  if (!tool) return null;
  const command = event.tool_input?.command;
  return tool === "Bash" && typeof command === "string" ? `Bash: ${command}` : tool;
}

/** Identical tool calls in a row that make a character stuck. */
const LOOP_CALLS = 5;

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
  const oldest = new Map<Character, number>();
  for (const card of own) {
    // A subagent the hooks haven't named yet shows its card's need on its lead.
    const who: Character = shown.subagents.find((a) => a.id === card.agent) ?? shown;
    // Already waiting for this need: its `since` counts as well as the card's `at`.
    const kept = who.stage === "needs_you" && who.needs === card.kind ? who.since : undefined;
    who.stage = "needs_you";
    who.needs = card.kind;
    delete who.reason;
    oldest.set(who, Math.min(card.at, kept ?? Infinity, oldest.get(who) ?? Infinity));
  }
  for (const [who, at] of oldest) who.since = at;
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
  // session id -> when the server last applied an event of its lead (Date.now())
  private leadHeardAt = new Map<string, number>();
  // session id + agent id ("" for the lead) -> its last tool call and how many times in a row
  private calls = new Map<string, { sig: string; count: number }>();
  // session ids whose lead's own last turn event was Stop: a "busy" list (background
  // commands still running) doesn't make them working again
  private turnEnded = new Set<string>();
  // session id -> its letters (its own and its subagents'), newest first
  private letterLists = new Map<string, Letter[]>();
  private letterCount = 0;
  // unique per start, so letter ids never repeat across restarts
  private readonly idPrefix = randomUUID();
  // session id + agent id of the subagents whose handback report is already their letter
  private handedBack = new Map<string, true>();
  private readonly journal: Journal | undefined;
  private readonly claude: Town["claude"];
  private readonly unlistedMs: number;
  private readonly started = Date.now();

  /**
   * `claude` is the version check's result, carried on every snapshot; `unlistedMs` how long
   * unlisted hook data is kept. With a `journal`, each kept letter and each time a character
   * becomes stuck is appended to it, and the letters it holds are the starting letters.
   */
  constructor(claude: Town["claude"], unlistedMs: number, journal?: Journal) {
    this.claude = claude;
    this.unlistedMs = unlistedMs;
    this.journal = journal;
    const entries = journal?.read() ?? [];
    for (const e of entries.sort((a, b) => b.at - a.at)) {
      if (e.kind !== "letter") continue;
      const list = this.letterLists.get(e.lead) ?? [];
      if (list.length < MAX_LETTERS) this.letterLists.set(e.lead, [...list, e.letter]);
    }
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
    const key = `${sid}\0${event.agent_id ?? ""}`;
    if (typeof at === "number") {
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
    const name = event.hook_event_name;
    if (!inSubagent) {
      this.leadHeardAt.set(sid, Date.now());
      if (name === "Stop") this.turnEnded.add(sid);
      else if (name !== "Notification" && name !== "SubagentStart" && name !== "SubagentStop") this.turnEnded.delete(sid);
    }
    const when = typeof at === "number" ? at : Date.now();
    const stuckBefore = this.stuckIds(lead);
    // These events end a stuck state; any other leaves a stuck character as it is.
    const unsticks = name === "SessionStart" || name === "UserPromptSubmit" || name === "PreToolUse";
    const set = (c: Character, stage: Stage, activity: string | null, needs?: string, reason?: string): void => {
      if (c.needs === "stuck" && !unsticks) return;
      this.mark(c, stage, activity, when, needs, reason);
    };
    if (name === "SessionStart" || name === "UserPromptSubmit") {
      this.dropSession(sid, [this.calls]);
      for (const a of lead.subagents) if (a.needs === "stuck") this.mark(a, "done", null, when);
    }
    switch (name) {
      case "SessionStart":
      case "UserPromptSubmit":
        set(lead, "working", null);
        break;
      case "PreToolUse":
      case "PostToolUse": {
        const activity = name === "PreToolUse" ? describeTool(event) : null;
        const target = inSubagent ? this.agent(lead, event) : lead;
        let loop = false;
        if (name === "PreToolUse") {
          const sig = JSON.stringify([event.tool_name, event.tool_input]);
          const last = this.calls.get(key);
          const count = last?.sig === sig ? last.count + 1 : 1;
          this.calls.set(key, { sig, count });
          loop = count >= LOOP_CALLS;
        }
        if (loop) set(target, "needs_you", activity, "stuck", `loop: ${activity ?? event.tool_name}`);
        else set(target, "working", activity);
        if (activity) target.step = activity;
        const handback = event.tool_input?.message;
        if (name === "PostToolUse" && event.tool_name === "SubagentHandback" && inSubagent && typeof handback === "string") {
          this.handedBack.set(key, true);
          this.addLetter(lead, target, handback, when, event.cwd);
        }
        break;
      }
      case "PermissionRequest":
        set(lead, "needs_you", null, "permission");
        break;
      case "Notification": {
        const need = notificationNeed(event.notification_type);
        if (need) set(lead, "needs_you", null, need);
        break;
      }
      case "Stop": {
        // Running subagents keep the lead working until a Stop finds none.
        const busy = runningAgents(event.background_tasks);
        if (busy > 0) set(lead, "working", waitingOn(busy));
        else set(lead, "needs_you", null, "turn ended");
        this.addLetter(lead, lead, event.last_assistant_message, when, event.cwd);
        break;
      }
      case "StopFailure":
        this.mark(inSubagent ? this.agent(lead, event) : lead, "needs_you", null, when, "stuck", (event.error ?? "").replace(/_/g, " ").trim() || "error");
        break;
      case "SubagentStart":
        this.agent(lead, event).stage = "working";
        break;
      case "SubagentStop": {
        const sub = this.agent(lead, event);
        set(sub, "done", null);
        if (lead.stage === "working" && lead.activity?.startsWith("waiting on ") && this.turnEnded.has(sid)) {
          const left = runningAgents(event.background_tasks, event.agent_id);
          set(lead, "working", left > 0 ? waitingOn(left) : null);
        }
        if (!this.handedBack.has(key)) this.addLetter(lead, sub, event.last_assistant_message, when, event.cwd);
        break;
      }
    }
    this.noteStuck(lead, stuckBefore, when, event.cwd);
    return true;
  }

  /**
   * Makes `list` (one good `claude agents --json` result) the sessions on the Town: sets each
   * one's name, kind, short id and stage, and forgets sessions that left the list and hook data
   * unlisted for longer than `unlistedMs`. `askedAt` is when the list was asked for: a lead
   * whose hook events arrived after that keeps the stage they set, since the list is older.
   */
  sync(list: Listed[], askedAt: number): void {
    const next = new Map<string, string>();
    for (const s of list) {
      const lead = this.leads.get(s.sessionId) ?? this.newLead(s.sessionId);
      this.heard.delete(s.sessionId);
      lead.name = s.name || lead.name || `lead-${this.nextNumber(`${s.cwd}\0lead`)}`;
      lead.kind = s.kind === "interactive" ? "terminal" : "background";
      lead.shortId = lead.kind === "background" ? (s.id ?? null) : null;
      const stuckBefore = this.stuckIds(lead);
      const hookIsNewer = (this.leadHeardAt.get(s.sessionId) ?? -Infinity) > askedAt;
      if (lead.needs === "stuck") {
        // stays stuck until the lead's SessionStart, UserPromptSubmit or PreToolUse
      } else if (s.state === "failed") {
        // the list's own record of a failed turn, which also outlives a Funtown restart
        this.mark(lead, "needs_you", null, Date.now(), "stuck", "error");
      } else if (hookIsNewer) {
        // keep the stage the newer hook event set
      } else if (s.status === "busy" && this.turnEnded.has(s.sessionId)) {
        // its turn ended; the list says busy only for background commands still running
      } else if (s.status === "busy") {
        lead.stage = "working";
        delete lead.needs;
        delete lead.since;
      } else if (s.status === "waiting") {
        // A hook may already have named this wait; the list's wording differs, so keep it.
        if (lead.stage !== "needs_you") this.mark(lead, "needs_you", null, Date.now(), s.waitingFor ?? "input needed");
      } else if (s.status === "idle") {
        this.mark(lead, "needs_you", null, Date.now(), "turn ended");
      }
      this.noteStuck(lead, stuckBefore, Date.now(), s.cwd);
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

  /** The listed lead's letters, newest first (at most 20), or undefined when it is not listed. */
  letters(sessionId: string): Letter[] | undefined {
    return this.listed.has(sessionId) ? [...(this.letterLists.get(sessionId) ?? [])] : undefined;
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
    return { houses: [...houses.values()], cards, started: this.started, claude: this.claude };
  }

  private forget(sessionId: string): void {
    this.leads.delete(sessionId);
    this.heard.delete(sessionId);
    this.leadHeardAt.delete(sessionId);
    this.turnEnded.delete(sessionId);
    this.letterLists.delete(sessionId);
    this.dropSession(sessionId, [this.agentCounts, this.lastAt, this.calls, this.handedBack]);
  }

  /** Removes the entries of `maps` whose key starts with this session's id. */
  private dropSession(sessionId: string, maps: Map<string, unknown>[]): void {
    for (const map of maps) {
      for (const key of map.keys()) if (key.startsWith(`${sessionId}\0`)) map.delete(key);
    }
  }

  /**
   * Sets a character's stage, activity and need. `since` (given as `at`) is kept while it stays
   * needs_you for the same need; a new need or another stage resets it. `reason` goes with a
   * "stuck" need.
   */
  private mark(c: Character, stage: Stage, activity: string | null, at: number, needs?: string, reason?: string): void {
    const sameNeed = stage === "needs_you" && c.stage === "needs_you" && needs !== undefined && c.needs === needs;
    c.stage = stage;
    c.activity = activity;
    if (stage === "needs_you") c.since = sameNeed && c.since !== undefined ? c.since : at;
    else delete c.since;
    if (needs) c.needs = needs;
    else delete c.needs;
    if (reason !== undefined && needs === "stuck") c.reason = reason;
    else delete c.reason;
  }

  /** The ids of the characters of `lead` (itself and its subagents) that are stuck. */
  private stuckIds(lead: Lead): Set<string> {
    return new Set([lead, ...lead.subagents].filter((c) => c.needs === "stuck").map((c) => c.id));
  }

  /** Journals each character of `lead` that is stuck now and was not in `before`. */
  private noteStuck(lead: Lead, before: Set<string>, at: number, eventCwd?: string): void {
    const cwd = this.listed.get(lead.id) ?? eventCwd;
    if (!this.journal || !cwd) return;
    for (const c of [lead, ...lead.subagents]) {
      if (c.needs !== "stuck" || before.has(c.id)) continue;
      this.journal.append({ kind: "stuck", at, cwd, lead: lead.id, who: c.id, name: c.name, reason: c.reason ?? "error" });
    }
  }

  /** Keeps a non-empty `message` as a letter from `writer` on `lead`, and journals it. */
  private addLetter(lead: Lead, writer: Character, message: string | undefined, at: number, eventCwd?: string): void {
    if (typeof message !== "string" || message.trim() === "") return;
    let text = message;
    if (message.length > MAX_LETTER_TEXT) {
      let cut = message.slice(0, MAX_LETTER_TEXT - 1);
      if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
      text = `${cut}…`;
    }
    const letter: Letter = { id: `letter-${this.idPrefix}-${++this.letterCount}`, from: writer.id, name: writer.name, text, at };
    this.letterLists.set(lead.id, [letter, ...(this.letterLists.get(lead.id) ?? [])].slice(0, MAX_LETTERS));
    writer.letter = at;
    const cwd = this.listed.get(lead.id) ?? eventCwd;
    if (cwd) this.journal?.append({ kind: "letter", at, cwd, lead: lead.id, letter });
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
    const own = this.letterLists.get(sid)?.find((l) => l.from === sid);
    if (own) lead.letter = own.at;
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
