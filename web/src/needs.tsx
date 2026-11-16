import { useEffect, useRef, useState } from "react";
import type { Town } from "../../server/types.ts";

/** One character waiting for the user: where it is, what it needs and since when. */
export type Waiting = { key: string; lead: string; id: string; project: string; name: string; need: string; since: number };

const MUTE_KEY = "funtown-muted";
const TOAST_MS = 8000;

/** Every needs_you character (lead or subagent) of `town`, oldest first. */
export function waitingList(town: Town | null): Waiting[] {
  const list: Waiting[] = [];
  for (const house of town?.houses ?? []) {
    for (const lead of house.leads) {
      for (const c of [lead, ...lead.subagents]) {
        if (c.stage !== "needs_you") continue;
        const need = (c.needs === "stuck" ? `stuck: ${c.reason ?? "error"}` : c.needs) ?? "waiting";
        list.push({ key: `${lead.id}/${c.id}`, lead: lead.id, id: c.id, project: house.project, name: c.name, need, since: c.since ?? Infinity });
      }
    }
  }
  return list.sort((a, b) => a.since - b.since);
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
 * Calls the sound, toast and system notification for each character that joins the waiting list
 * (new, or with a changed `since`) after the first town arrives. Never moves focus.
 * Gives the toasts to show and a way to drop one.
 */
export function useAlerts(waiting: Waiting[], loaded: boolean, muted: boolean, open: (w: Waiting) => void) {
  const seen = useRef<Map<string, number> | null>(null);
  const [toasts, setToasts] = useState<Waiting[]>([]);
  useEffect(() => {
    if (!loaded) return;
    const before = seen.current;
    seen.current = new Map(waiting.map((w) => [w.key, w.since]));
    if (!before) return;
    for (const w of waiting) {
      if (before.get(w.key) === w.since) continue;
      if (!muted) chime(w.project);
      setToasts((all) => [...all.filter((t) => t.key !== w.key), w]);
      setTimeout(() => setToasts((all) => all.filter((t) => t !== w)), TOAST_MS);
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          const n = new Notification(`${w.name} needs you`, { body: `${w.project}: ${w.need}` });
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
  }, [waiting.map((w) => `${w.key}@${w.since}`).join(), loaded]);
  return { toasts, drop: (w: Waiting) => setToasts((all) => all.filter((t) => t !== w)) };
}

/** `n` opens the oldest waiting character, then the next, wrapping; ignored while typing. */
export function useNextKey(waiting: Waiting[], current: string | null, open: (w: Waiting) => void) {
  const latest = useRef({ waiting, current, open });
  latest.current = { waiting, current, open };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "n" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable], .terminal")) return;
      const { waiting: list, current: cur, open: go } = latest.current;
      if (list.length === 0) return;
      const at = list.findIndex((w) => w.key === cur);
      go(list[(at + 1) % list.length]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** The "Needs you" list: one row per waiting character, oldest first. */
export function NeedsList({ waiting, onOpen }: { waiting: Waiting[]; onOpen: (w: Waiting) => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  if (waiting.length === 0) return null;
  return (
    <section className="needs-list" aria-label="Needs you">
      <h2>🔴 Needs you</h2>
      <ol>
        {waiting.map((w) => (
          <li key={w.key}>
            <button type="button" onClick={() => onOpen(w)}>
              <span className="project">{w.project}</span> <span className="name">{w.name}</span>{" "}
              <span className="need">{w.need}</span> <span className="waited">{waited(w.since, now)}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Toasts in the corner: buttons that open the panel on click and never take focus. */
export function Toasts({ toasts, onOpen }: { toasts: Waiting[]; onOpen: (w: Waiting) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((w) => (
        <button key={w.key} type="button" className="toast" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => onOpen(w)}>
          <strong>{w.name} needs you</strong>
          <span>{w.project}: {w.need}</span>
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
