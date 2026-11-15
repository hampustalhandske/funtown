import { appendFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import { basename, dirname } from "node:path";
import type { HookEvent, TownState } from "./town.ts";
import type { Card } from "./types.ts";

type By = "funtown" | "elsewhere" | "dropped";
type Hold = { card: Card; toolUseId: string | undefined; res: ServerResponse; shown: boolean; timer?: NodeJS.Timeout };

const DENIED = "The user denied this in Funtown.";

/** The card kind a held hook payload asks for, or null when Funtown doesn't hold it. */
function kindOf(event: HookEvent): Card["kind"] | null {
  const question = event.tool_name === "AskUserQuestion";
  const plan = event.tool_name === "ExitPlanMode";
  if (event.hook_event_name === "PreToolUse") return question ? "question" : plan ? "plan" : null;
  // A permission card's Allow can't carry answers; questions and plans are held at PreToolUse.
  if (event.hook_event_name === "PermissionRequest") return question || plan ? null : "permission";
  return null;
}

/** The hook output for `body` (a POST /answer) on `card`, or null when the body doesn't fit the card's kind. */
function hookOutput(card: Card, body: Record<string, unknown>): object | null {
  const { decision, answers, feedback } = body;
  if (decision !== "allow" && decision !== "deny") return null;
  const allow = decision === "allow";
  const preToolUse = (out: object) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", ...out } });
  if (card.kind === "permission") {
    const verdict = allow ? { behavior: "allow" } : { behavior: "deny", message: DENIED };
    return { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: verdict } };
  }
  if (card.kind === "question") {
    if (!allow) return null;
    const questions = Array.isArray(card.input.questions) ? (card.input.questions as { question?: unknown }[]) : [];
    const picked: Record<string, string> = {};
    for (const q of questions) {
      const text = q?.question;
      if (typeof text !== "string") return null;
      const given = (answers as Record<string, unknown> | undefined)?.[text];
      if (typeof given !== "string" || !given) return null;
      picked[text] = given;
    }
    return preToolUse({ permissionDecision: "allow", updatedInput: { ...card.input, answers: picked } });
  }
  if (allow) return preToolUse({ permissionDecision: "allow", updatedInput: card.input });
  if (feedback !== undefined && typeof feedback !== "string") return null;
  return preToolUse({ permissionDecision: "deny", permissionDecisionReason: feedback?.trim() || "Keep planning." });
}

/**
 * Held hook requests (`POST /hold`), each one a card once its session is listed. A hold is
 * replied to when its card closes: 200 with the hook output when answered in Funtown, 204
 * when released. Releases: a later event of the same agent (`event`), the lead leaving the
 * list (`refresh`), no listing within `unlistedMs`, or no page for `unlistedMs` (`pages`).
 * Every card that closes appends one line to `answerLog`, when given. `changed` runs
 * whenever the open cards change.
 */
export function createHolds(town: TownState, opts: { unlistedMs: number; answerLog?: string; changed: () => void }) {
  const { unlistedMs, answerLog, changed } = opts;
  const holds = new Map<string, Hold>();
  // when the last page left (or the server started), or null while a page is open
  let noPageSince: number | null = Date.now();
  let noPageTimer: NodeJS.Timeout | undefined;

  const log = (card: Card, by: By) => {
    if (!answerLog) return;
    const line = { at: Date.now(), lead: card.lead, project: basename(card.cwd), kind: card.kind, by };
    try {
      mkdirSync(dirname(answerLog), { recursive: true });
      appendFileSync(answerLog, `${JSON.stringify(line)}\n`);
    } catch (err) {
      console.error(`funtown: couldn't write the answer log ${answerLog}`, err);
    }
  };

  /** Closes `hold`: replies 200 with `output` or 204 without, logs `by` when it was a card; resolves once the reply is sent. */
  const close = (hold: Hold, by: By, output?: object): Promise<void> => {
    holds.delete(hold.card.id);
    clearTimeout(hold.timer);
    if (hold.shown) log(hold.card, by);
    changed();
    return new Promise((resolve) => {
      hold.res.once("close", resolve);
      if (hold.res.destroyed) return resolve();
      if (output) hold.res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(output), resolve);
      else hold.res.writeHead(204).end(resolve);
    });
  };
  const releaseAll = () => {
    for (const hold of holds.values()) void close(hold, "elsewhere");
  };
  const noPage = () => noPageSince !== null && Date.now() - noPageSince >= unlistedMs;
  const startNoPageTimer = () => (noPageTimer = setTimeout(releaseAll, unlistedMs));
  startNoPageTimer();

  return {
    /** Holds `event` (a parsed `/hold` body) until its card closes, or replies 204 at once when it isn't held. */
    hold(event: HookEvent | null, res: ServerResponse): void {
      const kind = event ? kindOf(event) : null;
      const sid = event?.session_id;
      const lead = typeof sid === "string" ? town.lead(sid) : undefined;
      if (!event || !kind || typeof sid !== "string" || noPage() || (kind !== "permission" && lead?.kind === "terminal")) {
        res.writeHead(204).end();
        return;
      }
      const input = event.tool_input;
      const card: Card = {
        id: randomUUID(),
        lead: sid,
        agent: event.agent_id ?? null,
        kind,
        tool: event.tool_name ?? "",
        input: typeof input === "object" && input !== null ? input : {},
        cwd: typeof event.cwd === "string" ? event.cwd : "",
        at: typeof event.funtown?.at === "number" ? event.funtown.at : Date.now(),
      };
      const hold: Hold = { card, toolUseId: event.tool_use_id, res, shown: lead !== undefined };
      if (!lead) hold.timer = setTimeout(() => void close(hold, "elsewhere"), unlistedMs);
      holds.set(card.id, hold);
      res.on("close", () => {
        if (holds.get(card.id) === hold) void close(hold, "dropped");
      });
      changed();
    },

    /** Answers the card `body.card` from a POST /answer body; gives 204 once the hold has its reply, 404 or 400. */
    async answer(body: Record<string, unknown>): Promise<204 | 400 | 404> {
      const hold = typeof body.card === "string" ? holds.get(body.card) : undefined;
      if (!hold?.shown) return 404;
      const output = hookOutput(hold.card, body);
      if (!output) return 400;
      await close(hold, "funtown", output);
      return 204;
    },

    /** Releases the holds an applied hook event shows were answered elsewhere. */
    event(event: HookEvent): void {
      const at = event.funtown?.at;
      const name = event.hook_event_name;
      if (typeof at !== "number" || name === "PermissionRequest" || name === "Notification") return;
      for (const hold of holds.values()) {
        const { card, toolUseId } = hold;
        if (card.lead !== event.session_id || card.agent !== (event.agent_id ?? null) || at <= card.at) continue;
        // A PermissionRequest carries no tool_use_id, so its own PreToolUse is matched by tool and input.
        const own = toolUseId !== undefined
          ? event.tool_use_id === toolUseId
          : event.tool_name === card.tool && JSON.stringify(event.tool_input) === JSON.stringify(card.input);
        if (name === "PreToolUse" && own) continue;
        void close(hold, "elsewhere");
      }
    },

    /** Matches holds to the current list: a newly listed lead's hold becomes a card, a gone lead's card is released. */
    refresh(): void {
      for (const hold of holds.values()) {
        const lead = town.lead(hold.card.lead);
        if (hold.shown && !lead) void close(hold, "elsewhere");
        else if (!hold.shown && lead?.kind === "terminal" && hold.card.kind !== "permission") void close(hold, "elsewhere");
        else if (!hold.shown && lead) {
          hold.shown = true;
          clearTimeout(hold.timer);
          changed();
        }
      }
    },

    /** Tells the holds how many pages are open; with none for `unlistedMs`, every hold is released. */
    pages(open: number): void {
      if (open > 0) {
        clearTimeout(noPageTimer);
        noPageSince = null;
      } else if (noPageSince === null) {
        noPageSince = Date.now();
        startNoPageTimer();
      }
    },

    /** The open cards, oldest first. */
    cards(): Card[] {
      return [...holds.values()].filter((h) => h.shown).map((h) => h.card).sort((a, b) => a.at - b.at);
    },

    /** Releases every hold and stops the timers. */
    close(): void {
      clearTimeout(noPageTimer);
      releaseAll();
    },
  };
}
