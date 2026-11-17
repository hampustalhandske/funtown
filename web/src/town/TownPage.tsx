import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Character, House, Town } from "../../../server/types.ts";
import { AddProject, Panel, post, useTown } from "../App.tsx";
import { MorningButton } from "../Morning.tsx";
import { SwitchButton } from "../Switch.tsx";
import { NotifyButton, Toasts, useAlerts, useMute, useNextKey, waitingList, type Waiting } from "../needs.tsx";
import { keyOf, layout, type Placed } from "./layout.ts";
import { Village } from "./Village.tsx";

const REVIEW_WORDS = { queued: "review queued", reviewing: "reviewing", ready: "review ready" } as const;

/** A character's stage in words: working, done, stuck with its reason, or what it needs from you. */
const stageWords = (c: Character) =>
  c.stage !== "needs_you" ? c.stage : c.needs === "stuck" ? `stuck: ${c.reason ?? "error"}` : `needs you: ${c.needs ?? "waiting"}`;

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
function words(p: Placed, index: ReturnType<typeof indexOf>): { name: string; label: string } {
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
  switch: <Icon><path d="M4 8.5h14l-3.5-3.5M20 15.5H6l3.5 3.5" /></Icon>,
  reload: <Icon><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.5H15" /></Icon>,
  close: <Icon><path d="M7 7l10 10M17 7L7 17" /></Icon>,
};

/** The settings pane: add or remove projects, sounds and pop-ups, and Claude version problems. */
function Settings({ town, muted, onMute, onClose }: { town: Town | null; muted: boolean; onMute: () => void; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  async function remove(house: House) {
    if (!window.confirm(`Remove ${house.project} from Funtown? Its shell ends; sessions keep running.`)) return;
    setError((await post("/projects/remove", { cwd: house.cwd }, [204, 404]))?.message ?? null);
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
              <button type="button" onClick={() => void remove(house)}>Remove project</button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      <p className="row">
        <button type="button" aria-pressed={muted} onClick={onMute}>Mute</button>
        <NotifyButton />
      </p>
      {town && town.claude.problems.length > 0 && (
        <ul className="error" role="alert" aria-label="Claude version problems">
          {town.claude.problems.map((problem) => <li key={problem}>{problem}</li>)}
        </ul>
      )}
    </aside>
  );
}

/** The town page: the village in one canvas, a row of icon buttons, panels on demand, and a hidden list for screen readers. */
export function TownPage() {
  const [town, restarted] = useTown();
  const [selection, setSelection] = useState<{ lead: string; id: string } | null>(null);
  const [settings, setSettings] = useState(false);
  const onClose = useCallback(() => setSelection(null), []);
  const closeSettings = useCallback(() => setSettings(false), []);
  const waiting = waitingList(town);
  const placed = useMemo(() => (town ? layout(town, waiting) : []), [town]);
  const index = useMemo(() => indexOf(town), [town]);
  const name = useCallback((p: Placed) => words(p, index).name, [index]);

  const lead = selection ? town?.houses.flatMap((h) => h.leads).find((l) => l.id === selection.lead) : undefined;
  const selected = lead && [lead, ...lead.subagents].find((c) => c.id === selection?.id);
  useEffect(() => {
    if (town && selection && !selected) setSelection(null);
  }, [town, selection, selected]);
  const openCwd = selected && index.characters.get(selected.id)?.house.cwd;
  const openSession = selected && openCwd ? { id: selected.id, name: selected.name, cwd: openCwd } : null;

  const [muted, toggleMute] = useMute();
  const openWaiting = useCallback((w: Waiting) => setSelection({ lead: w.lead, id: w.id }), []);
  const { toasts, drop } = useAlerts(waiting, town !== null, muted, openWaiting);
  useNextKey(waiting, selection && `${selection.lead}/${selection.id}`, openWaiting);

  /** Opens what `p` stands for: a character's panel, a parcel's review or PR, a building's house in the work view. */
  const pick = useCallback(
    (p: Placed) => {
      if (p.kind === "building") location.assign(`/work.html#${p.cwd}`);
      else if (p.kind === "parcel") {
        const parcel = index.houses.get(p.cwd)?.parcels?.find((x) => x.number === p.number);
        const steward = parcel?.review?.state === "ready" ? parcel.review.steward : undefined;
        if (steward && index.characters.has(steward)) setSelection({ lead: steward, id: steward });
        else if (parcel) window.open(parcel.url, "_blank", "noopener,noreferrer");
      } else setSelection({ lead: p.kind === "hat" ? p.lead : p.id, id: p.id });
    },
    [index],
  );

  return (
    <>
      <div className="village" aria-hidden="true">
        <Village town={town} placed={placed} name={name} onPick={pick} />
      </div>
      <ul className="town-list" aria-label="Town">
        {placed.map((p) => (
          <li key={keyOf(p)}>
            {p.kind === "building" ? (
              <a href={`/work.html#${p.cwd}`}>{words(p, index).label}</a>
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
        <span className="slot" title="Morning">{ICONS.morning}<MorningButton waiting={waiting} town={town} onOpen={openWaiting} /></span>
        <span className="slot" title="I had to switch">{ICONS.switch}<SwitchButton open={openSession} /></span>
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
      {settings && <Settings town={town} muted={muted} onMute={toggleMute} onClose={closeSettings} />}
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
