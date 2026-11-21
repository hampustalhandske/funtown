import { lazy, Suspense, useCallback, useEffect, useState, useRef, type FormEvent } from "react";
import type { Card, Character, House, Lead, Parcel, Stage, Town } from "../../server/types.ts";
import { AnswerCard } from "./AnswerCard.tsx";
import { MorningButton } from "./Morning.tsx";
import { LazyBoundary } from "./LazyBoundary.tsx";
import { NeedsList, NotifyButton, Toasts, useAlerts, useMute, useNextKey, waitingList, type Waiting } from "./needs.tsx";
import { funtownToken } from "./token.ts";
import { SwitchButton } from "./Switch.tsx";
import { ReplyBox } from "./ReplyBox.tsx";
import { SessionTerminal } from "./Terminal.tsx";

// The terminal and the reply box load with the page, so Show terminal never waits on a download.
// Only the letters' Markdown renderer is lazy, which keeps it out of the first page load.
const Letters = lazy(() => import("./Letters.tsx").then((m) => ({ default: m.Letters })));

const STAGE_LABEL: Record<Stage, string> = {
  working: "working",
  needs_you: "needs you",
  done: "done",
};

/** A coloured dot (CSS) followed by the stage's word; the colour never carries the meaning alone. */
function StageLabel({ stage }: { stage: Stage }) {
  return (
    <>
      <span className="dot" data-stage={stage} aria-hidden="true" />
      {STAGE_LABEL[stage]}
    </>
  );
}

const OPENING_TIMEOUT_MS = 30_000;

/**
 * The switch for early attach: on, a background lead's panel open this long starts the session's `claude attach`
 * out of view, so Show terminal has its screen at once. Off (false), the terminal connects on Show terminal.
 */
const EARLY_ATTACH: number | false = 300;

/**
 * Subscribes to the server's Town stream; gives the latest Town (null before the first) and
 * whether the server has restarted since the page loaded, which leaves the page's token stale.
 */
export function useTown(): [Town | null, boolean] {
  const [town, setTown] = useState<Town | null>(null);
  const [restarted, setRestarted] = useState(false);
  useEffect(() => {
    let first: number | undefined;
    const source = new EventSource("/stream");
    source.addEventListener("state", (event) => {
      const next = JSON.parse(event.data) as Town;
      first ??= next.started;
      if (next.started !== first) setRestarted(true);
      setTown(next);
    });
    return () => source.close();
  }, []);
  return [town, restarted];
}

function CharacterRow({
  character,
  avatar,
  onSelect,
}: {
  character: Character;
  avatar: string;
  onSelect: (id: string) => void;
}) {
  const { name, stage, needs, letter, role, tags } = character;
  return (
    <button
      type="button"
      className={`character ${stage}`}
      data-stage={stage}
      aria-label={[name, "kind" in character ? character.kind : null, STAGE_LABEL[stage]].filter(Boolean).join(", ")}
      onClick={() => onSelect(character.id)}>
      <span className="avatar" aria-hidden="true">{avatar}</span>
      <span className="body">
        <span className="line">
          <span className="name">{name}</span>
          {"kind" in character && <span className="kind">{character.kind === "background" ? "background" : "terminal"}</span>}
          <span className="stage"><StageLabel stage={stage} /></span>
          {role && <span className="badge role">{role}</span>}
          {tags?.map((tag) => <span key={tag} className="badge tag">{tag}</span>)}
          {letter !== undefined && <span className="mail" role="img" aria-label="has a letter">✉</span>}
        </span>
        {stage === "needs_you" && needs && <span className="activity">waiting for you: {needs}</span>}
        <Overlaps overlaps={(character as Partial<Lead>).overlaps} />
      </span>
    </button>
  );
}

/** Warnings for files this lead's run and another listed run both touched. */
function Overlaps({ overlaps }: { overlaps: Lead["overlaps"] }) {
  return (overlaps ?? []).map((o) => (
    <span key={`${o.file}|${o.with}`} className="overlap">⚠ also editing {o.file} with {o.withName}</span>
  ));
}

const REVIEW_LABEL = { idle: "Ask for review", queued: "queued", reviewing: "reviewing", ready: "review ready ✉" } as const;

/** Asks the steward to review PR `number` of the house in `cwd`; gives the failure, or null once it is queued. */
export function askReview(cwd: string, number: number): Promise<Failure | null> {
  return post("/review", { cwd, number }, [204]);
}

/** An open PR: number, title, draft mark, a link, and its review: a button to ask for one, or (when ready) the steward's panel. */
function ParcelItem({ parcel, cwd, onOpen }: { parcel: Parcel; cwd: string; onOpen: (steward: string) => void }) {
  const { review } = parcel;
  const [error, setError] = useState<string | null>(null);
  async function ask() {
    setError((await askReview(cwd, parcel.number))?.message ?? null);
  }
  return (
    <li className="parcel">
      <a href={parcel.url} target="_blank" rel="noreferrer">#{parcel.number} {parcel.title}</a>
      {parcel.draft && <span className="badge">draft</span>}
      {review &&
        (review.state === "idle" || review.steward ? (
          <button type="button" className="review" data-state={review.state} onClick={() => (review.state === "idle" ? void ask() : onOpen(review.steward as string))}>
            {REVIEW_LABEL[review.state]}
          </button>
        ) : (
          <span className="review" data-state={review.state}>{REVIEW_LABEL[review.state]}</span>
        ))}
      {error && <span role="alert" className="error">{error}</span>}
    </li>
  );
}

type Select = (lead: string, id: string) => void;

/**
 * Cards of `lead`, each naming its subagent when a subagent asks; with `only`, just the cards
 * of that character. A card from a subagent the lead doesn't list yet counts as the lead's.
 */
function Cards({ lead, cards, only }: { lead: Lead; cards: Card[]; only?: string }) {
  const owner = (card: Card) => (card.agent && lead.subagents.some((s) => s.id === card.agent) ? card.agent : lead.id);
  return cards
    .filter((card) => card.lead === lead.id && (only === undefined || owner(card) === only))
    .map((card) => (
      <AnswerCard key={card.id} card={card} who={card.agent ? (lead.subagents.find((s) => s.id === card.agent)?.name ?? "A subagent") : undefined} />
    ));
}

function LeadItem({ lead, cards, onSelect }: { lead: Lead; cards: Card[]; onSelect: Select }) {
  return (
    <li className="lead">
      <CharacterRow character={lead} avatar="🧑‍💻" onSelect={(id) => onSelect(lead.id, id)} />
      {lead.subagents.length > 0 && (
        <ul className="subagents" aria-label={`${lead.name} subagents`}>
          {lead.subagents.map((sub) => (
            <li key={sub.id}>
              <CharacterRow character={sub} avatar="🤖" onSelect={(id) => onSelect(lead.id, id)} />
            </li>
          ))}
        </ul>
      )}
      <Cards lead={lead} cards={cards} />
    </li>
  );
}

/** Why a request failed: the text to show, and the HTTP status (0 when the server was not reached). */
type Failure = { message: string; status: number };

/** POSTs JSON with the page token; gives null on one of `ok`, else the failure. */
export async function post(path: string, body: unknown, ok: number[]): Promise<Failure | null> {
  try {
    const reply = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-funtown-token": funtownToken() },
      body: JSON.stringify(body),
    });
    return ok.includes(reply.status)
      ? null
      : { message: (await reply.text()) || `Request failed (${reply.status}).`, status: reply.status };
  } catch {
    return { message: "Couldn't reach Funtown.", status: 0 };
  }
}

/** Asks the user, then removes `house` from Funtown; gives the failure, or null once removed or when the user says no. */
export async function removeProject(house: House): Promise<Failure | null> {
  if (!window.confirm(`Remove ${house.project} from Funtown? Its shell ends; sessions keep running.`)) return null;
  return post("/projects/remove", { cwd: house.cwd }, [204, 404]);
}

const SETUP_HINT = "First time here? Run `claude` once in its Shell tab and accept the trust prompt.";

/** The "Add project" form: an absolute folder path; shows the server's reason when it refuses. */
export function AddProject() {
  const [cwd, setCwd] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function add(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const failed = await post("/projects", { cwd: cwd.trim() }, [200, 201]);
    setError(failed?.message ?? null);
    if (!failed) setCwd("");
  }
  return (
    <form className="add-project" onSubmit={add}>
      <input aria-label="Project folder" placeholder="/absolute/path/to/project" value={cwd} onChange={(e) => setCwd(e.target.value)} />
      <button type="submit" disabled={cwd.trim() === ""}>Add project</button>
      {error && <p role="alert" className="error">{error}</p>}
    </form>
  );
}

function HouseCard({
  house,
  cards,
  onSelect,
  onNew,
  notice,
}: {
  house: House;
  cards: Card[];
  onSelect: Select;
  onNew: (cwd: string) => Promise<Failure | null>;
  notice?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [shell, setShell] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [failed, setFailed] = useState(false);
  /** Clears the last error, runs `fn`, shows its failure, and flags a 500 so the setup hint can appear. */
  async function attempt(fn: () => Promise<Failure | null>) {
    setError(null);
    setFailed(false);
    const reason = await fn();
    setError(reason?.message ?? null);
    setFailed(reason?.status === 500);
    return reason;
  }
  async function start() {
    setPending(true);
    await attempt(() => onNew(house.cwd));
    setPending(false);
  }
  async function run(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    if (!(await attempt(() => post("/runs", { cwd: house.cwd, prompt }, [201])))) {
      setPrompt("");
      setRunOpen(false);
    }
    setPending(false);
  }
  async function closeShell() {
    setError(null);
    setFailed(false);
    setError((await post("/shells/close", { cwd: house.cwd }, [204, 404]))?.message ?? null);
    setShell(false);
  }
  async function remove() {
    setFailed(false);
    setError((await removeProject(house))?.message ?? null);
  }
  const needsYou = house.leads.some((lead) => lead.stage === "needs_you");
  return (
    <section className={`house${needsYou ? " needs_you" : ""}`} aria-label={house.project} title={house.cwd}>
      <h2>
        🏠 {house.project}
        {house.phase && <span className="badge phase">{house.phase.phase}</span>}
        {house.phase?.note && <span className="phase-note">{house.phase.note}</span>}
      </h2>
      <ul>
        {house.leads.map((lead) => (
          <LeadItem key={lead.id} lead={lead} cards={cards} onSelect={onSelect} />
        ))}
      </ul>
      {house.parcels && house.parcels.length > 0 && (
        <ul className="parcels" aria-label={`${house.project} pull requests`}>
          {house.parcels.map((parcel) => (
            <ParcelItem key={parcel.number} parcel={parcel} cwd={house.cwd} onOpen={(id) => onSelect(id, id)} />
          ))}
        </ul>
      )}
      {house.added && !house.seen && <p className="hint">{SETUP_HINT}</p>}
      <button type="button" onClick={start} disabled={pending}>
        New session
      </button>
      <button type="button" aria-expanded={runOpen} onClick={() => setRunOpen(!runOpen)}>
        Background run
      </button>
      <button type="button" role="tab" aria-selected={shell} onClick={() => setShell(!shell)}>
        Shell
      </button>
      {house.added && (
        <button type="button" onClick={remove}>
          Remove project
        </button>
      )}
      {runOpen && (
        <form className="run" onSubmit={run}>
          <textarea aria-label="Prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          <button type="submit" disabled={pending || prompt.trim() === ""}>Start run</button>
        </form>
      )}
      {shell && (
        <div role="tabpanel" aria-label="Shell">
          <button type="button" onClick={closeShell}>Close shell</button>
          <LazyBoundary>
            <SessionTerminal shell={house.cwd} />
          </LazyBoundary>
        </div>
      )}
      {failed && error && !(house.added && !house.seen) && <p className="hint">{SETUP_HINT}</p>}
      {(error ?? notice) && <p role="alert" className="error">{error ?? notice}</p>}
    </section>
  );
}

/**
 * What the narrow panel says when a session's terminal closes with `code`: a detach (4000), the client's own
 * non-zero exit (4001 to 4255: the last line it printed), or Funtown's own close, in words.
 */
function endOf(code: number, lastLine: string): { failed: string } | "detached" {
  if (code === 4000) return "detached";
  const unknown = "Couldn't attach to the session.";
  if (code > 4000 && code <= 4255) return { failed: lastLine || unknown };
  if (code === 1006) return { failed: "Lost the connection to Funtown." };
  if (code === 1011) return { failed: "Couldn't start the session's client." };
  return { failed: unknown };
}

/** Details of one character: stage, need, its subagents (for a lead) and a button that focuses its terminal. */
export function Panel({ character, lead, cards, onClose }: { character: Character; lead: Lead; cards: Card[]; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [terminal, setTerminal] = useState(false);
  // Once started (early attach, or the first Show), the terminal stays mounted while the panel lives, hidden out of view
  // whenever it isn't shown, so its socket stays open for the reply box. Closing the panel closes the socket.
  // When the client ends, the terminal goes and `end` says how: null, "detached" (close code 4000) or a line saying
  // why the attach failed. Only Show terminal starts a client again.
  const [started, setStarted] = useState(false);
  const [end, setEnd] = useState<{ failed: string } | "detached" | null>(null);
  const screen = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const onEnd = useCallback((code: number, lastLine: string) => {
    // the terminal that held the keyboard is about to go, so Show terminal takes it
    if (screen.current?.contains(document.activeElement)) toggle.current?.focus();
    setEnd(endOf(code, lastLine));
    setTerminal(false);
    setStarted(false);
  }, []);
  const background = character.id === lead.id && lead.kind === "background";
  useEffect(() => {
    // A client that ends before the timer does leaves it no say: only Show terminal attaches again.
    if (!background || EARLY_ATTACH === false || end) return;
    const timer = setTimeout(() => setStarted(true), EARLY_ATTACH);
    return () => clearTimeout(timer);
  }, [background, end]);
  const column = useRef<HTMLDivElement>(null);
  const leaveTerminal = useCallback(() => column.current?.focus(), []);
  const reply = useRef<((text: string) => string | null) | null>(null);
  const stamp = [lead, ...lead.subagents].map((c) => c.letter ?? 0).join(",");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const inTerminal = event.target instanceof Element && event.target.closest(".terminal");
      if (event.key === "Escape" && !inTerminal) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Showing a terminal that was hidden gives it the keyboard again (a new one focuses itself).
  useEffect(() => {
    if (terminal) screen.current?.querySelector("textarea")?.focus();
  }, [terminal]);

  async function jump() {
    setError(null);
    setPending(true);
    try {
      const reply = await fetch("/jump", {
        method: "POST",
        headers: { "content-type": "application/json", "x-funtown-token": funtownToken() },
        body: JSON.stringify({ lead: lead.id }),
      });
      if (reply.status !== 204) setError((await reply.text()) || `Jump failed (${reply.status}).`);
    } catch {
      setError("Couldn't reach Funtown.");
    } finally {
      setPending(false);
    }
  }

  /** Stops the background session; the panel closes once the server has stopped it. */
  async function stop() {
    setError(null);
    setPending(true);
    const failed = await post("/sessions/stop", { lead: lead.id }, [204]);
    setPending(false);
    if (failed) setError(failed.message);
    else onClose();
  }

  // A shown terminal opens the terminal sheet: the panel's lines in a column on the left, the terminal beside it.
  const sheet = background && terminal;
  return (
    <aside className={`panel${sheet ? " sheet" : ""}`} role="dialog" aria-label={`${character.name} details`}>
      <div className="column" ref={column} tabIndex={-1}>
        <button type="button" className="close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        {/* the lines scroll above the buttons, which stay at the column's bottom */}
        <div className="lines">
          <h2>{character.name}</h2>
          <p><StageLabel stage={character.stage} /></p>
          {character.stage === "needs_you" && character.needs && <p>waiting for you: {character.needs}</p>}
          {(character.role || character.tags?.length) && (
            <p>
              {character.role && <span className="badge role">{character.role}</span>}
              {character.tags?.map((tag) => <span key={tag} className="badge tag">{tag}</span>)}
            </p>
          )}
          {character.id === lead.id && <Overlaps overlaps={lead.overlaps} />}
          <Cards lead={lead} cards={cards} only={character.id} />
          {character.id === lead.id && lead.subagents.length > 0 && (
            <ul aria-label="Subagents">
              {lead.subagents.map((sub) => (
                <li key={sub.id}>
                  {sub.name} <StageLabel stage={sub.stage} />
                </li>
              ))}
            </ul>
          )}
          <LazyBoundary>
            <Suspense fallback={null}>
              <Letters lead={lead.id} stamp={stamp} names={Object.fromEntries([lead, ...lead.subagents].map((c) => [c.id, c.name]))} only={character.id === lead.id ? undefined : character.id} />
            </Suspense>
          </LazyBoundary>
          {background && !terminal && (
            <ReplyBox send={(text) => (reply.current ? reply.current(text) : "Not sent: the terminal isn't connected.")} />
          )}
          {character.id === lead.id && lead.kind === "terminal" && (
            <p className="hint">press ← or type /bg in its terminal to open it here</p>
          )}
          {lead.kind === "terminal" && (
            <button type="button" onClick={jump} disabled={pending}>
              Go to terminal
            </button>
          )}
        </div>
        {/* Close session stops the session, so the client's exit after it says nothing */}
        {background && !pending && end === "detached" && <p className="activity">Detached; the session keeps running.</p>}
        {background && !pending && end && end !== "detached" && <p role="alert" className="error">{end.failed}</p>}
        {error && <p role="alert" className="error">{error}</p>}
        {background && (
          <div className="actions">
            <button type="button" ref={toggle} aria-expanded={terminal} onClick={() => {
              setTerminal(!terminal);
              setStarted(true);
              setEnd(null);
            }}>
              {terminal ? "Hide terminal" : "Show terminal"}
            </button>
            <button type="button" onClick={stop} disabled={pending}>
              Close session
            </button>
          </div>
        )}
      </div>
      {background && started && (
        // Hidden, it is inert: out of the tab order and unfocusable, and the page's CSS keeps it out of view at the sheet's size.
        <div className="screen" ref={screen} inert={!terminal}>
          <LazyBoundary>
            <SessionTerminal lead={lead.id} shown={terminal} reply={reply} onLeave={leaveTerminal} onEnd={onEnd} />
          </LazyBoundary>
        </div>
      )}
    </aside>
  );
}

/**
 * The character whose panel is open, and the Needs you wiring both pages share: the waiting list,
 * mute, sound and toasts, and ⌥N. A selection whose character leaves the town closes.
 */
export function useSelection(town: Town | null) {
  const [selection, setSelection] = useState<{ lead: string; id: string } | null>(null);
  const onClose = useCallback(() => setSelection(null), []);
  const lead = selection ? town?.houses.flatMap((house) => house.leads).find((l) => l.id === selection.lead) : undefined;
  const selected = lead && [lead, ...lead.subagents].find((c) => c.id === selection?.id);
  useEffect(() => {
    if (town && selection && !selected) setSelection(null);
  }, [town, selection, selected]);
  const openCwd = lead && town?.houses.find((house) => house.leads.includes(lead))?.cwd;
  const openSession = selected && openCwd ? { id: selected.id, name: selected.name, cwd: openCwd } : null;
  const waiting = waitingList(town);
  const [muted, toggleMute] = useMute();
  const openWaiting = useCallback((w: Waiting) => setSelection({ lead: w.lead, id: w.id }), []);
  const { toasts, drop } = useAlerts(waiting, town !== null, muted, openWaiting);
  useNextKey(waiting, selection && `${selection.lead}/${selection.id}`, openWaiting);
  return { selection, setSelection, onClose, lead, selected, openSession, waiting, muted, toggleMute, openWaiting, toasts, drop };
}

/** The house `/work.html#<cwd>` names, or "" when the hash isn't a valid encoded folder. */
function hashedHouse(): string {
  try {
    return decodeURIComponent(location.hash.slice(1));
  } catch {
    return "";
  }
}

/** The town page: one house per project, its leads and their subagents, with a list of everyone waiting for you. */
export function App() {
  const [town, restarted] = useTown();
  const { selection, setSelection, onClose, lead, selected, openSession, waiting, muted, toggleMute, openWaiting, toasts, drop } = useSelection(town);
  // The selection when each New session was clicked; a session opens itself only if that is still it (or nothing is open).
  const selectionNow = useRef(selection);
  selectionNow.current = selection;
  const [opening, setOpening] = useState<{ id: string; cwd: string; at: number; from: typeof selection }[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const leads = town?.houses.flatMap((house) => house.leads) ?? [];
  const listed = opening.flatMap((p) => {
    const found = leads.find((l) => l.shortId === p.id);
    return found ? [{ p, found }] : [];
  });
  useEffect(() => {
    if (listed.length === 0) return;
    const { p, found } = listed[listed.length - 1];
    const current = selectionNow.current;
    if (current === null || current === p.from) setSelection({ lead: found.id, id: found.id });
    setOpening((all) => all.filter((p) => !listed.some((l) => l.p === p)));
  }, [listed.map((l) => l.p.id).join()]);
  useEffect(() => {
    const timers = opening.map((p) =>
      setTimeout(() => {
        setOpening((all) => all.filter((x) => x !== p));
        setMissing((all) => [...all, p.cwd]);
      }, Math.max(0, p.at + OPENING_TIMEOUT_MS - Date.now())),
    );
    return () => timers.forEach(clearTimeout);
  }, [opening]);
  /** Starts a background session in `cwd`; gives the failure, or null once started (its terminal opens when listed). */
  const startSession = useCallback(async (cwd: string): Promise<Failure | null> => {
    try {
      const reply = await fetch("/sessions", {
        method: "POST",
        headers: { "content-type": "application/json", "x-funtown-token": funtownToken() },
        body: JSON.stringify({ cwd }),
      });
      if (reply.status !== 201) return { message: (await reply.text()) || `Start failed (${reply.status}).`, status: reply.status };
      const { id } = (await reply.json()) as { id: string };
      setMissing((all) => all.filter((c) => c !== cwd));
      setOpening((all) => [...all, { id, cwd, at: Date.now(), from: selectionNow.current }]);
      return null;
    } catch {
      return { message: "Couldn't reach Funtown.", status: 0 };
    }
  }, []);
  // `/work.html#<cwd>` scrolls to that house once the town has listed it.
  const hash = hashedHouse();
  const hasHouse = town?.houses.some((house) => house.cwd === hash) ?? false;
  useEffect(() => {
    if (!hasHouse) return;
    [...document.querySelectorAll<HTMLElement>("section.house")].find((el) => el.title === hash)?.scrollIntoView();
  }, [hasHouse, hash]);
  return (
    <>
      <header>
        <h1>Funtown</h1>
        <a href="/" aria-label="Town" title="Town">🏘️</a>
        <button type="button" aria-pressed={muted} onClick={toggleMute}>
          {muted ? "Unmute" : "Mute"}
        </button>
        <NotifyButton />
        <SwitchButton open={openSession} />
        <MorningButton waiting={waiting} town={town} onOpen={openWaiting} />
      </header>
      {restarted && (
        <div className="alert" role="alert">
          Funtown restarted; terminals and answers work again after a reload.{" "}
          <button type="button" onClick={() => location.reload()}>Reload</button>
        </div>
      )}
      {town && town.claude.problems.length > 0 && (
        <div className="alert" role="alert" aria-label="Claude version problems">
          <ul>
            {town.claude.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}
      <NeedsList waiting={waiting} onOpen={openWaiting} />
      <AddProject />
      {town && town.houses.length === 0 && <p className="empty">No Claude sessions running yet.</p>}
      <main className="town">
        {town?.houses.map((house) => (
          <HouseCard
            key={house.cwd}
            house={house}
            cards={town.cards}
            onSelect={(leadId, id) => setSelection({ lead: leadId, id })}
            onNew={startSession}
            notice={missing.includes(house.cwd) ? "The new session didn't appear." : undefined}
          />
        ))}
      </main>
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
