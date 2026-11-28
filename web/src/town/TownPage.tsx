import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Character, House, Town } from "../../../server/types.ts";
import { AddProject, checkWords, houseState, Panel, post, PrPane, removeProject, stewardOf, usePageKeys, useSelection, useTown } from "../App.tsx";
import { fogLabel, glanceOf } from "../glance.ts";
import { KeySheet } from "../KeySheet.tsx";
import { useKey, useLayer } from "../keys.ts";
import { MorningButton } from "../Morning.tsx";
import { SwitchButton, type OpenSession } from "../Switch.tsx";
import { needOf, NotifyButton, Toasts, type Entry, type Lettered } from "../needs.tsx";
import { boardOf, interior, type Board, type InPlaced } from "./interior.ts";
import { AVATARS, avatarFor } from "./kit/avatars.ts";
import { keyOf, layout, type Placed } from "./layout.ts";
import { nextHouse, type Direction, type Door, type Move } from "./mark.ts";
import { Village } from "./Village.tsx";

const REVIEW_WORDS = { idle: "review not asked", queued: "review queued", reviewing: "reviewing", ready: "review ready" } as const;

/** What the Queen is doing, in words for the town list. */
const QUEEN_WORDS = { idle: "sitting still", asked: "writing your word", busy: "reading a parcel", ready: "her word is ready" } as const;

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

/** The house whose classroom the page hash `#in=<encoded cwd>` names, or null when the hash names none. */
function hashedClassroom(): string | null {
  const match = /^#in=(.*)$/.exec(location.hash);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** A house's state in words for the town list: its fire and fog words and its waiting PRs ("2 PRs waiting"); none for a calm house. */
function houseLabel(house: House, now: number): string[] {
  const glance = glanceOf(house, now);
  const { waiting } = glance;
  return [...houseState(house, glance), ...(waiting.length === 0 ? [] : [`${waiting.length} ${waiting.length === 1 ? "PR" : "PRs"} waiting`])];
}

/** What a placed thing is called, for its hover plate. */
function nameOf(p: Placed | InPlaced, index: TownIndex): string {
  if (p.kind === "observer" || p.kind === "you") return "You";
  if (p.kind === "building") return index.houses.get(p.cwd)?.project ?? p.cwd;
  if (p.kind === "parcel") return `#${p.number} ${index.houses.get(p.cwd)?.parcels?.find((x) => x.number === p.number)?.title ?? ""}`.trim();
  if (p.id === null) return "Queen";
  return index.characters.get(p.id)?.character.name ?? p.id;
}

/** A placed thing's label for the town list: name, project, role, stage (a PR: review and checks). `now` is the page's clock, which a house's state words are judged by. */
function labelOf(p: Placed | InPlaced, index: TownIndex, now: number): string {
  if (p.kind === "observer") return "you, observer";
  if (p.kind === "you") return "you, on your throne";
  if (p.kind === "building" || p.kind === "parcel") {
    const house = index.houses.get(p.cwd);
    const project = house?.project ?? p.cwd;
    if (p.kind === "building") return [project, "house", ...(house ? houseLabel(house, now) : [])].join(", ");
    const parcel = house?.parcels?.find((x) => x.number === p.number);
    const state = parcel?.review ? REVIEW_WORDS[parcel.review.state] : parcel?.draft ? "draft" : "open";
    return [nameOf(p, index), project, "pull request", state, ...(parcel ? [checkWords(parcel, now)] : [])].join(", ");
  }
  if (p.kind === "queen" && p.id === null) return `Queen, no steward session, ${QUEEN_WORDS[p.state]}`;
  if (p.id === null) return "Queen";
  const found = index.characters.get(p.id);
  if (!found) return p.id;
  const { character, house } = found;
  const role = p.kind === "queen" ? "steward" : p.kind === "lead" ? "lead" : (character.role ?? "subagent");
  const [queen, doing] = p.kind === "queen" ? ["Queen, ", `, ${QUEEN_WORDS[p.state]}`] : ["", ""];
  return `${queen}${character.name}, ${house.project}, ${role}, ${stageWords(character)}${doing}`;
}

/** The whiteboard's lines as the hidden list shows them: project, phase, note, then each step with its state. */
const boardLines = (board: Board) => [
  board.project,
  ...(board.phase === null ? [] : [`phase: ${board.phase}`]),
  ...(board.note === null ? [] : [board.note]),
  ...board.steps.map((step) => `${step.label}, ${step.state}`),
];

/** A round icon drawn in ink: `children` are the SVG strokes on a 24-unit grid. */
const Icon = ({ children }: { children: ReactNode }) => (
  <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">{children}</svg>
);

const ICONS = {
  settings: <Icon><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Icon>,
  work: <Icon><rect x="4.5" y="4" width="15" height="16" rx="2.5" /><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" /></Icon>,
  morning: <Icon><path d="M3 18h18M7 18a5 5 0 0 1 10 0M12 7.5v2.5M5.5 10.5l1.6 1.6M18.5 10.5l-1.6 1.6" /></Icon>,
  keys: <Icon><rect x="3" y="6.5" width="18" height="11" rx="2.5" /><path d="M7 10.5h.01M10.5 10.5h.01M14 10.5h.01M17.5 10.5h.01M8 14h8" /></Icon>,
  reload: <Icon><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.5H15" /></Icon>,
  close: <Icon><path d="M7 7l10 10M17 7L7 17" /></Icon>,
  back: <Icon><path d="M10 6l-6 6 6 6M4 12h16" /></Icon>,
  blind: <Icon><path d="M3 12c2.5-4 5.5-6 9-6s6.5 2 9 6c-2.5 4-5.5 6-9 6s-6.5-2-9-6zM4.5 4.5l15 15" /><circle cx="12" cy="12" r="2.5" /></Icon>,
};

type SettingsProps = { town: Town | null; muted: boolean; onMute: () => void; open: OpenSession | null; onClose: () => void };

/** The settings pane: add or remove projects, your avatar, sounds and pop-ups, "I had to switch", and Claude version problems. */
function Settings({ town, muted, onMute, open, onClose }: SettingsProps) {
  const [error, setError] = useState<string | null>(null);
  useLayer("pane", true, onClose);
  async function remove(house: House) {
    setError((await removeProject(house))?.message ?? null);
  }
  async function choose(id: string) {
    setError((await post("/avatar", { id }, [204]))?.message ?? null);
  }
  const added = town?.houses.filter((h) => h.added) ?? [];
  const chosen = avatarFor(town?.avatar).id;
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
      <div className="avatars" role="group" aria-label="Avatar">
        {AVATARS.map((avatar) => (
          <button
            key={avatar.id}
            type="button"
            className="swatch"
            style={{ background: avatar.coat }}
            aria-label={avatar.label}
            title={avatar.label}
            aria-pressed={avatar.id === chosen}
            onClick={() => void choose(avatar.id)}
          />
        ))}
      </div>
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

/** The town page: the village in one canvas, a row of icon buttons, panels on demand, and a hidden list for screen readers. */
export function TownPage() {
  const [town, restarted, lostAt] = useTown();
  const { selection, setSelection, onClose, lead, house, selected, openSession, waiting, fog, now, muted, toggleMute, openWaiting, openPr, pr, closePr, current, toasts, drop } = useSelection(town, lostAt);
  const [settings, setSettings] = useState(false);
  const closeSettings = useCallback(() => setSettings(false), []);
  const lost = fog?.why === "lost";
  // `waiting` follows from the town and the clock, so these two are all it changes with.
  const placed = useMemo(() => (town ? layout(town, waiting, now, lost) : []), [town, now, lost]);
  const index = useMemo(() => indexOf(town), [town]);
  // The house the keys last reached: it shows its name plate, as a hover does. Gone with its house.
  const [marked, setMarked] = useState<string | null>(null);
  // Where the mark last landed, kept after Esc clears it: the first arrow returns there, and the way back follows it.
  const [last, setLast] = useState<Move | null>(null);
  const doors = useRef<(() => Door[]) | null>(null);
  const openAndMark = useCallback((w: Lettered | Entry) => {
    openWaiting(w);
    setMarked(w.cwd);
    setLast({ to: w.cwd });
  }, [openWaiting]);
  const name = useCallback((p: Placed | InPlaced) => nameOf(p, index), [index]);

  // The classroom being shown: the cwd in the page hash, kept in step with Back, reload and pasted links.
  const [inCwd, setInCwd] = useState(hashedClassroom);
  useEffect(() => {
    const onHash = () => setInCwd(hashedClassroom());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  /** Shows the classroom of `cwd`, or the town for null; `replace` swaps the history entry instead of adding one. */
  const go = useCallback((cwd: string | null, replace = false) => {
    const url = cwd === null ? location.pathname + location.search : `#in=${encodeURIComponent(cwd)}`;
    if (replace) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
    setInCwd(cwd);
  }, []);
  const classroom = inCwd === null ? undefined : index.houses.get(inCwd);
  useEffect(() => {
    if (town && inCwd !== null && !classroom) go(null, true);
  }, [town, inCwd, classroom, go]);
  const showing = classroom !== undefined;
  const hasMark = marked !== null && index.houses.has(marked);
  useLayer("mark", hasMark, () => setMarked(null));
  // The plain list opens at the house you are at: the classroom's, else the marked one.
  const at = classroom?.cwd ?? (hasMark ? marked : null);
  const workHref = at === null ? "/work.html" : workLink(at);
  const [sheet, showSheet, hideSheet] = usePageKeys(town, waiting, current, openAndMark, workHref);
  const shown = lead && house && selected;
  useLayer("classroom", showing, () => go(null));

  // The arrows and Enter are the town's alone: not in a classroom, with a pane open (a panel, Settings, a pull request's, the key sheet).
  const keysOn = !showing && !shown && !settings && !pr && !sheet;
  /** Moves the mark one house `direction` on the screen as the camera is now, or puts it on the first house. */
  const move = (direction: Direction) => {
    const points = doors.current?.() ?? [];
    const to = nextHouse(points, marked, direction, last);
    if (to === null) return;
    const walked = marked !== null && marked !== to && points.some((p) => p.cwd === marked);
    setMarked(to);
    if (walked) setLast({ to, from: marked, direction });
    else if (to !== marked) setLast({ to });
  };
  useKey("ArrowLeft", () => move("left"), keysOn);
  useKey("ArrowRight", () => move("right"), keysOn);
  useKey("ArrowUp", () => move("up"), keysOn);
  useKey("ArrowDown", () => move("down"), keysOn);
  useKey("Enter", () => marked !== null && go(marked), keysOn && hasMark);

  /** Opens parcel `number` of `cwd`: the Queen's review when it is ready, else the PR pane (never GitHub). */
  const openParcel = useCallback(
    (cwd: string, number: number) => {
      const parcel = index.houses.get(cwd)?.parcels?.find((x) => x.number === number);
      const ready = parcel?.review?.state === "ready" ? parcel.review : undefined;
      const steward = ready?.steward;
      if (steward && index.characters.has(steward)) {
        setSelection({ lead: steward, id: steward, review: ready?.letter === undefined ? undefined : { pr: number, letter: ready.letter } });
      } else if (parcel) {
        setSettings(false);
        openPr(cwd, number);
      }
    },
    [index, setSelection, openPr],
  );

  /** Opens what `p` stands for: a character's panel, a parcel's review panel, letter or PR, a building's classroom. */
  const pick = useCallback(
    (p: Placed | InPlaced) => {
      if (p.kind === "building") go(p.cwd);
      else if (p.kind === "parcel") openParcel(p.cwd, p.number);
      else if (p.kind === "lead" || p.kind === "hat") setSelection({ lead: p.kind === "hat" ? p.lead : p.id, id: p.id });
      else if (p.kind === "queen" && p.id !== null) setSelection({ lead: p.id, id: p.id });
    },
    [go, openParcel, setSelection],
  );

  const inside = useMemo(
    () => (classroom ? { house: classroom, placed: interior(classroom), board: boardOf(classroom), name, onPick: pick } : undefined),
    [classroom, name, pick],
  );

  return (
    <>
      <div className="village" aria-hidden="true">
        <Village index={index} avatar={town?.avatar} marked={marked} placed={placed} name={name} onPick={pick} inside={inside} doors={doors} />
      </div>
      <ul className="town-list" aria-label="Town">
        {inside
          ? [
              ...inside.placed.map((p) => (
                <li key={keyOf(p)}>
                  {p.kind === "observer" ? <span>{labelOf(p, index, now)}</span> : <button type="button" onClick={() => pick(p)}>{labelOf(p, index, now)}</button>}
                </li>
              )),
              ...boardLines(inside.board).map((line, i) => <li key={`board:${i}`}><span>{line}</span></li>),
            ]
          : placed.map((p) => (
              <li key={keyOf(p)}>
                {p.kind === "you" || (p.kind === "queen" && p.id === null) ? <span>{labelOf(p, index, now)}</span> : <button type="button" onClick={() => pick(p)}>{labelOf(p, index, now)}</button>}
              </li>
            ))}
      </ul>
      <nav className="hud" aria-label="Controls">
        {restarted && (
          <button type="button" className="icon alert" aria-label="Funtown restarted: reload" title="Funtown restarted: reload" onClick={() => location.reload()}>
            {ICONS.reload}
          </button>
        )}
        {fog && <span className="icon fog" role="img" aria-label={fogLabel(fog)} title={fogLabel(fog)}>{ICONS.blind}</span>}
        <span className="slot" title="Morning">{ICONS.morning}<MorningButton aria-label="Morning" waiting={waiting} town={town} onOpen={openWaiting} /></span>
        {classroom && <button type="button" className="icon" aria-label="Back to town" title="Back to town" onClick={() => go(null)}>{ICONS.back}</button>}
        <a className="icon" href={workHref} aria-label="Work view" title="Work view (L)">{ICONS.work}</a>
        <button type="button" className="icon" aria-label="Key sheet" title="Key sheet (?)" onClick={showSheet}>{ICONS.keys}</button>
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
      {sheet && <KeySheet onClose={hideSheet} />}
      {settings && <Settings town={town} muted={muted} onMute={toggleMute} open={openSession} onClose={closeSettings} />}
      {pr && <PrPane key={`${pr.house.cwd}#${pr.parcel.number}`} house={pr.house} parcel={pr.parcel} now={now} onReview={(id, review) => setSelection({ lead: id, id, review })} onClose={closePr} />}
      {shown && <Panel key={`${lead.id}/${selected.id}`} character={selected} lead={lead} house={house} cards={town?.cards ?? []} steward={stewardOf(town)} review={selection?.review} onClose={onClose} />}
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
