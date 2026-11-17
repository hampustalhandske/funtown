import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Character, House, Parcel, Town } from "../../../server/types.ts";
import { AddProject, askReview, Panel, removeProject, useSelection, useTown } from "../App.tsx";
import { MorningButton } from "../Morning.tsx";
import { SwitchButton, type OpenSession } from "../Switch.tsx";
import { needOf, NotifyButton, Toasts } from "../needs.tsx";
import { keyOf, layout, type Placed } from "./layout.ts";
import { Village } from "./Village.tsx";

const REVIEW_WORDS = { idle: "review not asked", queued: "review queued", reviewing: "reviewing", ready: "review ready" } as const;

/** A character's stage in words: working, done, stuck with its reason, or what it needs from you. */
const stageWords = (c: Character) => (c.stage !== "needs_you" ? c.stage : c.needs === "stuck" ? needOf(c) : `needs you: ${needOf(c)}`);

/** The work view's link to the house in `cwd`. */
const workLink = (cwd: string) => `/work.html#${encodeURIComponent(cwd)}`;

export type TownIndex = ReturnType<typeof indexOf>;

/** Every house by cwd and every character by id, with its house. */
function indexOf(town: Town | null) {
  const houses = new Map<string, House>();
  const characters = new Map<string, { character: Character; house: House }>();
  for (const house of town?.houses ?? []) {
    houses.set(house.cwd, house);
    for (const lead of house.leads) for (const c of [lead, ...lead.subagents]) characters.set(c.id, { character: c, house });
  }
  return { houses, characters };
}

/** What a placed thing is called: `name` for its hover plate; `label` (name, project, role, stage) for the town list. */
function words(p: Placed, index: TownIndex): { name: string; label: string } {
  if (p.kind === "building" || p.kind === "parcel") {
    const house = index.houses.get(p.cwd);
    const project = house?.project ?? p.cwd;
    if (p.kind === "building") return { name: project, label: `${project}, house` };
    const parcel = house?.parcels?.find((x) => x.number === p.number);
    const name = `#${p.number} ${parcel?.title ?? ""}`.trim();
    const state = parcel?.review ? REVIEW_WORDS[parcel.review.state] : parcel?.draft ? "draft" : "open";
    return { name, label: `${name}, ${project}, pull request, ${state}` };
  }
  const found = index.characters.get(p.id);
  if (!found) return { name: p.id, label: p.id };
  const { character, house } = found;
  const role = p.kind === "steward" ? "steward" : p.kind === "lead" ? "lead" : (character.role ?? "subagent");
  return { name: character.name, label: `${character.name}, ${house.project}, ${role}, ${stageWords(character)}` };
}

/** A round icon drawn in ink: `children` are the SVG strokes on a 24-unit grid. */
const Icon = ({ children }: { children: ReactNode }) => (
  <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">{children}</svg>
);

const ICONS = {
  settings: <Icon><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Icon>,
  work: <Icon><rect x="4.5" y="4" width="15" height="16" rx="2.5" /><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" /></Icon>,
  morning: <Icon><path d="M3 18h18M7 18a5 5 0 0 1 10 0M12 7.5v2.5M5.5 10.5l1.6 1.6M18.5 10.5l-1.6 1.6" /></Icon>,
  reload: <Icon><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.5H15" /></Icon>,
  close: <Icon><path d="M7 7l10 10M17 7L7 17" /></Icon>,
};

type SettingsProps = { town: Town | null; muted: boolean; onMute: () => void; open: OpenSession | null; onClose: () => void };

/** The settings pane: add or remove projects, sounds and pop-ups, "I had to switch", and Claude version problems. */
function Settings({ town, muted, onMute, open, onClose }: SettingsProps) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // On the document, which an event reaches before the window, so Escape closes this pane and not the panel under it too.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || (event.target instanceof Element && event.target.closest(".terminal"))) return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  async function remove(house: House) {
    setError((await removeProject(house))?.message ?? null);
  }
  const added = town?.houses.filter((h) => h.added) ?? [];
  return (
    <aside className="pane settings" role="dialog" aria-label="Settings">
      <button type="button" className="icon close" aria-label="Close settings" title="Close" onClick={onClose}>{ICONS.close}</button>
      <h2>Settings</h2>
      <AddProject />
      {added.length > 0 && (
        <ul className="projects" aria-label="Projects">
          {added.map((house) => (
            <li key={house.cwd} title={house.cwd}>
              <span>{house.project}</span>
              <button type="button" aria-label={`Remove ${house.project}`} onClick={() => void remove(house)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      <div className="row">
        <button type="button" aria-pressed={muted} onClick={onMute}>Mute</button>
        <NotifyButton />
        <SwitchButton open={open} />
      </div>
      {town && town.claude.problems.length > 0 && (
        <ul className="error" role="alert" aria-label="Claude version problems">
          {town.claude.problems.map((problem) => <li key={problem}>{problem}</li>)}
        </ul>
      )}
    </aside>
  );
}

type AskTarget = { cwd: string; parcel: Parcel };

/** A small panel for a pull request with no review: ask the steward for one, or open the PR. Asking is only on the button. */
function AskPanel({ target, onClose }: { target: AskTarget; onClose: () => void }) {
  const { cwd, parcel } = target;
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  async function ask() {
    const failed = await askReview(cwd, parcel.number);
    if (failed) setError(failed.message);
    else onClose();
  }
  return (
    <aside className="pane" role="dialog" aria-label={`Pull request ${parcel.number}`}>
      <button type="button" className="icon close" aria-label="Close" title="Close" onClick={onClose}>{ICONS.close}</button>
      <h2>#{parcel.number} {parcel.title}</h2>
      <p>No review asked yet.</p>
      <div className="row">
        <button type="button" onClick={() => void ask()}>Ask steward to review</button>
        <a href={parcel.url} target="_blank" rel="noopener noreferrer">Open PR</a>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
    </aside>
  );
}

/** The town page: the village in one canvas, a row of icon buttons, panels on demand, and a hidden list for screen readers. */
export function TownPage() {
  const [town, restarted] = useTown();
  const { setSelection, onClose, lead, selected, openSession, waiting, muted, toggleMute, openWaiting, toasts, drop } = useSelection(town);
  const [settings, setSettings] = useState(false);
  const [asking, setAsking] = useState<AskTarget | null>(null);
  const closeAsking = useCallback(() => setAsking(null), []);
  const closeSettings = useCallback(() => setSettings(false), []);
  const placed = useMemo(() => (town ? layout(town, waiting) : []), [town]);
  const index = useMemo(() => indexOf(town), [town]);
  const name = useCallback((p: Placed) => words(p, index).name, [index]);

  /** Opens what `p` stands for: a character's panel, a parcel's review panel, letter or PR, a building's house in the work view. */
  const pick = useCallback(
    (p: Placed) => {
      if (p.kind === "building") location.assign(workLink(p.cwd));
      else if (p.kind === "parcel") {
        const parcel = index.houses.get(p.cwd)?.parcels?.find((x) => x.number === p.number);
        const steward = parcel?.review?.state === "ready" ? parcel.review.steward : undefined;
        if (steward && index.characters.has(steward)) setSelection({ lead: steward, id: steward });
        else if (parcel?.review?.state === "idle") setAsking({ cwd: p.cwd, parcel });
        else if (parcel) window.open(parcel.url, "_blank", "noopener,noreferrer");
      } else setSelection({ lead: p.kind === "hat" ? p.lead : p.id, id: p.id });
    },
    [index, setSelection],
  );

  return (
    <>
      <div className="village" aria-hidden="true">
        <Village index={index} placed={placed} name={name} onPick={pick} />
      </div>
      <ul className="town-list" aria-label="Town">
        {placed.map((p) => (
          <li key={keyOf(p)}>
            {p.kind === "building" ? (
              <a href={workLink(p.cwd)}>{words(p, index).label}</a>
            ) : (
              <button type="button" onClick={() => pick(p)}>{words(p, index).label}</button>
            )}
          </li>
        ))}
      </ul>
      <nav className="hud" aria-label="Controls">
        {restarted && (
          <button type="button" className="icon alert" aria-label="Funtown restarted: reload" title="Funtown restarted: reload" onClick={() => location.reload()}>
            {ICONS.reload}
          </button>
        )}
        <span className="slot" title="Morning">{ICONS.morning}<MorningButton aria-label="Morning" waiting={waiting} town={town} onOpen={openWaiting} /></span>
        <a className="icon" href="/work.html" aria-label="Work view" title="Work view">{ICONS.work}</a>
        <button
          type="button"
          className={`icon${town && town.claude.problems.length > 0 ? " flagged" : ""}`}
          aria-label="Settings"
          title="Settings"
          aria-expanded={settings}
          onClick={() => setSettings(!settings)}>
          {ICONS.settings}
        </button>
      </nav>
      {settings && <Settings town={town} muted={muted} onMute={toggleMute} open={openSession} onClose={closeSettings} />}
      {asking && <AskPanel key={`${asking.cwd}/${asking.parcel.number}`} target={asking} onClose={closeAsking} />}
      {lead && selected && <Panel key={`${lead.id}/${selected.id}`} character={selected} lead={lead} cards={town?.cards ?? []} onClose={onClose} />}
      <Toasts
        toasts={toasts}
        onOpen={(w) => {
          drop(w);
          openWaiting(w);
        }}
      />
    </>
  );
}
