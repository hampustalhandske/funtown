import { useEffect, useRef, useState } from "react";
import type { Card, Character, House, Parcel, Town } from "../../server/types.ts";
import { glanceOf } from "./glance.ts";
import { useKey } from "./keys.ts";

/** The urgency tier of an entry: 1 asks, 2 stuck, 3 burning houses, 4 quiet. Tiers 1 to 3 are loud; tier 4 never chimes, toasts or notifies. */
export type Tier = 1 | 2 | 3 | 4;

/** One character waiting for the user: where it is, what it needs, since when and how urgent it is. */
export type Waiting = { kind: "character"; key: string; lead: string; id: string; project: string; cwd: string; name: string; need: string; since: number; tier: Tier };

/**
 * One PR of a house on the urgency list: a burning house's oldest failed PR (tier 3, `since` the time it failed, or
 * Infinity when unknown), a fire under fog ("failed when last read", tier 4, the same time) or a PR waiting for the
 * user (tier 4, no time). `key` is `<cwd>#<number>`.
 */
export type PrEntry = { kind: "pr"; key: string; project: string; cwd: string; number: number; title: string; need: string; since: number; tier: 3 | 4 };

/** An entry of the urgency list: a character or a PR of a house. */
export type Entry = Waiting | PrEntry;

/** The character entries of `list`: what the castle queue, Morning and the letter key read. */
export const characterEntries = (list: Entry[]): Waiting[] => list.filter((e): e is Waiting => e.kind === "character");

const MUTE_KEY = "funtown-muted";
const TOAST_MS = 8000;
/** The needs that hold a card; every `Card["kind"]` must be listed. */
const CARD_KINDS: Record<Card["kind"], true> = { permission: true, question: true, plan: true };

/** What a needs_you character waits for, in words: "stuck: <reason>", the card kind, or "waiting". */
export const needOf = (c: Character): string => (c.needs === "stuck" ? `stuck: ${c.reason ?? "error"}` : c.needs) ?? "waiting";

/** Whether a stuck character is stuck on a rate limit, which stops every session at once. */
const rateLimited = (c: Character) => c.needs === "stuck" && c.reason === "rate limit";

/** The tier of a needs_you character: a turn ended or a rate limit is quiet (4), other stuck is 2, everything else asks (1). */
const tierOf = (c: Character): Tier => (c.needs === "turn ended" || rateLimited(c) ? 4 : c.needs === "stuck" ? 2 : 1);

/** The place of a fire under fog inside the quiet tier: before everything else, rate limits (0) included. */
const FOG_FIRE_RANK = -1;

/** The place of a PR waiting for the user inside the quiet tier: after the rate limits (0), before the resting leads (3). */
const WAITING_PR_RANK = 1;

/** The place inside a tier (lower first): asks put cards first; the quiet tier puts a rate limit, then waiting PRs, before a resting lead. */
const rankOf = (c: Character, tier: Tier): number =>
  tier === 1 ? (c.needs !== undefined && c.needs in CARD_KINDS ? 0 : 1) : tier === 4 ? (rateLimited(c) ? 0 : 3) : 0;

/** Every character (lead or subagent) of `town`, in the town's order, with its house and its lead's id. */
function* characters(town: Town | null): Generator<{ c: Character; house: House; lead: string }> {
  for (const house of town?.houses ?? []) for (const lead of house.leads) for (const c of [lead, ...lead.subagents]) yield { c, house, lead: lead.id };
}

/**
 * Everything of `town` that needs the user, as one list in strict tiers (ADR 0006): 1 asks (cards, then other
 * asks), 2 stuck, 3 burning houses not under fog (one entry each, for its oldest failed PR), 4 quiet (a fire under
 * fog, which may be out of date; stuck on a rate limit, then PRs waiting for the user, those with a ready review first, then resting leads, whose turn ended). Oldest first
 * within each tier (for a burning house, the time its check failed; unknown last). Handled fires and working
 * characters are not listed. `now` is the page's clock. The castle queue, the plain list, the next key and the
 * alerts all read it.
 */
export function urgencyList(town: Town | null, now: number): Entry[] {
  const list: { w: Entry; rank: number }[] = [];
  for (const { c, house, lead } of characters(town)) {
    if (c.stage !== "needs_you") continue;
    const tier = tierOf(c);
    const w: Waiting = { kind: "character", key: `${lead}/${c.id}`, lead, id: c.id, project: house.project, cwd: house.cwd, name: c.name, need: needOf(c), since: c.since ?? Infinity, tier };
    list.push({ w, rank: rankOf(c, tier) });
  }
  for (const house of town?.houses ?? []) {
    const glance = glanceOf(house, now);
    const entry = (p: Parcel, tier: 3 | 4, need: string, since: number): PrEntry =>
      ({ kind: "pr", key: `${house.cwd}#${p.number}`, project: house.project, cwd: house.cwd, number: p.number, title: p.title, need, since, tier });
    // A fire under fog may be out of date: it is quiet, and the first of the quiet.
    if (glance.fire === "burning") {
      const oldest = glance.red[0];
      list.push(
        glance.fog
          ? { w: entry(oldest, 4, "failed when last read", oldest.redAt ?? Infinity), rank: FOG_FIRE_RANK }
          : { w: entry(oldest, 3, "burning: checks failed", oldest.redAt ?? Infinity), rank: 0 },
      );
    }
    // Among the waiting PRs a ready review goes first; the rest keep house order and the house's PR order.
    for (const p of glance.waiting) list.push({ w: entry(p, 4, "waits for you", Infinity), rank: WAITING_PR_RANK + (p.review?.state === "ready" ? 0 : 1) });
  }
  // `since` is Infinity when unknown: two unknowns tie (Infinity - Infinity is NaN) and keep the town's order.
  const older = (a: number, b: number) => (a === b ? 0 : a - b);
  return list.sort((a, b) => a.w.tier - b.w.tier || a.rank - b.rank || older(a.w.since, b.w.since)).map((x) => x.w);
}

/** A character with a letter, and where to find it: what M walks. */
export type Lettered = Pick<Waiting, "key" | "lead" | "id" | "cwd">;

/**
 * Makes M open the pane of the character with the newest letter, then the next newest, wrapping (letters of one time
 * keep the town's order); `current` is the open pane's `lead/id` (when it has no letter, M opens the newest). Keeps no
 * "read" memory, and sends and marks nothing.
 */
export function useLetterKey(town: Town | null, current: string | null, open: (entry: Lettered) => void): void {
  useKey("m", () => {
    const list = [...characters(town)]
      .filter(({ c }) => c.letter !== undefined)
      .sort((a, b) => b.c.letter! - a.c.letter!)
      .map(({ c, house, lead }): Lettered => ({ key: `${lead}/${c.id}`, lead, id: c.id, cwd: house.cwd }));
    if (list.length === 0) return;
    open(list[(list.findIndex((l) => l.key === current) + 1) % list.length]);
  });
}

/** Date.now(), refreshed every `everyMs`, so a waiting time shown with it stays about right. */
export function useNow(everyMs: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

/** "3m" style wait text for a character waiting since `since`. */
export function waited(since: number, now: number): string {
  if (!Number.isFinite(since)) return "";
  const s = Math.max(0, Math.round((now - since) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

/** Two soft notes picked from the project's name. */
function notesFor(project: string): [number, number] {
  let h = 0;
  for (const ch of project) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const scale = [523.25, 587.33, 659.25, 783.99, 880];
  return [scale[h % scale.length], scale[(h >>> 4) % scale.length] * 1.25];
}

let audio: AudioContext | null = null;

/** Plays the project's two-note chime, quietly. Does nothing when audio isn't available. */
function chime(project: string): void {
  if (typeof AudioContext === "undefined") return;
  audio ??= new AudioContext();
  const ctx = audio;
  void ctx.resume();
  notesFor(project).forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + i * 0.18;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.45);
  });
}

/** The mute flag, kept in localStorage when it can be. */
export function useMute(): [boolean, () => void] {
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () => {
    const next = !muted;
    setMuted(next);
    try {
      localStorage.setItem(MUTE_KEY, next ? "1" : "0");
    } catch {
      // not persisted
    }
  };
  return [muted, toggle];
}

/**
 * Calls the sound, toast and system notification for each loud entry (tier 1, 2 or 3) that joins the
 * urgency list (new, or with a changed `since`) after the first town arrives. `loaded` is false before it
 * and while the page has lost the server: then nothing alerts and what was seen stays. Quiet entries (tier 4)
 * never alert, and one that turns loud later joins then. Never moves focus.
 * Gives the toasts to show and a way to drop one.
 */
export function useAlerts(waiting: Entry[], loaded: boolean, muted: boolean, open: (w: Entry) => void) {
  const seen = useRef<Map<string, number> | null>(null);
  const [toasts, setToasts] = useState<Entry[]>([]);
  useEffect(() => {
    if (!loaded) return;
    const before = seen.current;
    const loud = waiting.filter((w) => w.tier < 4);
    seen.current = new Map(loud.map((w) => [w.key, w.since]));
    if (!before) return;
    for (const w of loud) {
      if (before.get(w.key) === w.since) continue;
      if (!muted) chime(w.project);
      setToasts((all) => [...all.filter((t) => t.key !== w.key), w]);
      setTimeout(() => setToasts((all) => all.filter((t) => t !== w)), TOAST_MS);
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          const say = wordsOf(w);
          const n = new Notification(say.title, { body: say.body });
          n.onclick = () => {
            window.focus();
            open(w);
            n.close();
          };
        }
      } catch (error) {
        // some browsers only allow notifications from a service worker and throw a TypeError
        if (!(error instanceof TypeError)) throw error;
      }
    }
  }, [waiting.map((w) => `${w.key}@${w.since}@${w.tier}`).join(), loaded]);
  return { toasts, drop: (w: Entry) => setToasts((all) => all.filter((t) => t !== w)) };
}

/** What a toast or notification says for `w`: "<name> needs you" over "<project>: <need>", or "<project> is burning: #<n> checks failed" over the PR's title. */
function wordsOf(w: Entry): { title: string; body: string } {
  return w.kind === "pr" ? { title: `${w.project} is burning: #${w.number} checks failed`, body: w.title } : { title: `${w.name} needs you`, body: `${w.project}: ${w.need}` };
}

/** The "Needs you" list: one row per entry, in urgency order; quiet rows (tier 4) are drawn quieter. A PR row has the project, "#<n>" and its words. */
export function NeedsList({ waiting, onOpen }: { waiting: Entry[]; onOpen: (w: Entry) => void }) {
  const now = useNow(5000);
  if (waiting.length === 0) return null;
  return (
    <section className="needs-list" aria-label="Needs you">
      <h2>Needs you <span className="hint">Space: next</span></h2>
      <ol>
        {waiting.map((w) => (
          <li key={w.key} className={w.tier === 4 ? "quiet" : undefined}>
            <button type="button" onClick={() => onOpen(w)}>
              <span className="project">{w.project}</span> <span className="name">{w.kind === "pr" ? `#${w.number}` : w.name}</span>{" "}
              <span className="need">{w.need}</span> <span className="waited">{waited(w.since, now)}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Toasts in the corner: buttons that open the panel on click and never take focus. */
export function Toasts({ toasts, onOpen }: { toasts: Entry[]; onOpen: (w: Entry) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((w) => (
        <button key={w.key} type="button" className="toast" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => onOpen(w)}>
          <strong>{wordsOf(w).title}</strong>
          <span>{wordsOf(w).body}</span>
        </button>
      ))}
    </div>
  );
}

/** Header button asking for system-notification permission; hidden once decided or unsupported. */
export function NotifyButton() {
  const [permission, setPermission] = useState(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));
  if (permission !== "default") return null;
  return (
    <button
      type="button"
      onClick={() => {
        void Notification.requestPermission().then(setPermission);
      }}>
      Allow pop-ups
    </button>
  );
}
