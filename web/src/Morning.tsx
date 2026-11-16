import { lazy, Suspense, useState } from "react";
import type { Morning, Town } from "../../server/types.ts";
import { funtownToken } from "./token.ts";

// The Markdown renderer loads only when a letter is shown, keeping it out of the first page load.
const LetterView = lazy(() => import("./Letters.tsx").then((m) => ({ default: m.LetterView })));
import { waited, type Waiting } from "./needs.tsx";

const CLOSED_KEY = "funtown-morning-closed";
const DAY_MS = 24 * 60 * 60 * 1000;

/** When the morning view was last closed (kept in localStorage when it can be); 24 hours ago the first time. */
function windowStart(): number {
  try {
    const saved = Number(localStorage.getItem(CLOSED_KEY));
    if (saved > 0) return saved;
  } catch {
    // storage unavailable: fall through
  }
  return Date.now() - DAY_MS;
}

function remember(at: number): void {
  try {
    localStorage.setItem(CLOSED_KEY, String(at));
  } catch {
    // storage unavailable: the window then always starts 24 hours ago
  }
}

type Section = { project: string; cwd: string; done: Morning["projects"][number]["done"]; stuck: Morning["projects"][number]["stuck"]; next: Waiting[] };

/** One section per project with entries in the window or someone waiting now, in the order the server gave them, then waiting-only projects. */
function sections(morning: Morning, waiting: Waiting[]): Section[] {
  const list: Section[] = morning.projects.map((p) => ({ ...p, next: waiting.filter((w) => w.cwd === p.cwd) }));
  for (const w of waiting) {
    if (!list.some((s) => s.cwd === w.cwd)) list.push({ project: w.project, cwd: w.cwd, done: [], stuck: [], next: waiting.filter((x) => x.cwd === w.cwd) });
  }
  return list;
}

/**
 * The "Morning" button and, once clicked, the view of what the journal holds since the window's start:
 * per project the newest letter of each lead (Done), who got stuck (Stuck) and who waits now (Next; a click opens its panel).
 * Closing moves the window's start to now. Nothing opens or takes focus on its own.
 */
export function MorningButton({ waiting, town, onOpen }: { waiting: Waiting[]; town: Town | null; onOpen: (w: Waiting) => void }) {
  const [view, setView] = useState<{ since: number; morning: Morning | null; error: string } | null>(null);
  async function open() {
    const since = windowStart();
    setView({ since, morning: null, error: "" });
    try {
      const reply = await fetch(`/morning?since=${since}`, { headers: { "x-funtown-token": funtownToken() } });
      if (!reply.ok) throw new Error(String(reply.status));
      const morning = (await reply.json()) as Morning;
      setView((v) => v && { ...v, morning });
    } catch {
      setView((v) => v && { ...v, error: "The morning view failed to load." });
    }
  }
  function close() {
    remember(Date.now());
    setView(null);
  }
  const names: Record<string, string> = {};
  for (const house of town?.houses ?? []) for (const lead of house.leads) for (const c of [lead, ...lead.subagents]) names[c.id] = c.name;
  const shown = view?.morning ? sections(view.morning, waiting) : [];
  return (
    <>
      <button type="button" onClick={open}>Morning</button>
      {view && (
        <aside className="morning" role="dialog" aria-label="Morning">
          <button type="button" className="close" aria-label="Close morning" onClick={close}>✕</button>
          <h2>Since {new Date(view.since).toLocaleString()}</h2>
          {view.error && <p role="alert" className="error">{view.error}</p>}
          {view.morning && shown.length === 0 && <p>Nothing happened since {new Date(view.since).toLocaleString()}.</p>}
          {shown.map((s) => (
            <section key={s.cwd} aria-label={s.project} title={s.cwd}>
              <h3>🏠 {s.project}</h3>
              {s.done.length > 0 && (
                <div aria-label="Done">
                  <h4>Done</h4>
                  <Suspense fallback={null}>{s.done.map((l) => <LetterView key={l.id} letter={l} name={names[l.from]} />)}</Suspense>
                </div>
              )}
              {s.stuck.length > 0 && (
                <div aria-label="Stuck">
                  <h4>Stuck</h4>
                  <ul>
                    {s.stuck.map((x) => (
                      <li key={`${x.at}/${x.who}`}>
                        {x.name}: {x.reason} <time dateTime={new Date(x.at).toISOString()}>{new Date(x.at).toLocaleString()}</time>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {s.next.length > 0 && (
                <div aria-label="Next">
                  <h4>Next</h4>
                  <ul>
                    {s.next.map((w) => (
                      <li key={w.key}>
                        <button type="button" onClick={() => onOpen(w)}>
                          {w.name}: {w.need}{Number.isFinite(w.since) ? ` (${waited(w.since, Date.now())})` : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ))}
        </aside>
      )}
    </>
  );
}
