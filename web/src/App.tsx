import { useCallback, useEffect, useState, useRef } from "react";
import type { Card, Character, House, Lead, Stage, Town } from "../../server/types.ts";
import { AnswerCard } from "./AnswerCard.tsx";
import { SessionTerminal, funtownToken } from "./Terminal.tsx";
import { NeedsList, NotifyButton, Toasts, useAlerts, useMute, useNextKey, waitingList, type Waiting } from "./needs.tsx";

const STAGE_LABEL: Record<Stage, string> = {
  working: "🟢 working",
  needs_you: "🔴 needs you",
  done: "⚪ done",
};

const OPENING_TIMEOUT_MS = 30_000;

/**
 * Subscribes to the server's Town stream; gives the latest Town (null before the first) and
 * whether the server has restarted since the page loaded, which leaves the page's token stale.
 */
function useTown(): [Town | null, boolean] {
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
  const { name, stage, activity, needs } = character;
  return (
    <button
      type="button"
      className={`character ${stage}`}
      data-stage={stage}
      aria-label={[name, "kind" in character ? character.kind : null, STAGE_LABEL[stage].replace(/^\S+ /, "")].filter(Boolean).join(", ")}
      onClick={() => onSelect(character.id)}>
      <span className="avatar" aria-hidden="true">{avatar}</span>
      <span className="body">
        <span className="line">
          <span className="name">{name}</span>
          {"kind" in character && <span className="kind">{character.kind === "background" ? "background" : "terminal"}</span>}
          <span className="stage">{STAGE_LABEL[stage]}</span>
        </span>
        {stage === "needs_you" && needs && <span className="activity">waiting for you: {needs}</span>}
        {stage === "working" && <span className="activity">{activity ?? "thinking"}</span>}
      </span>
    </button>
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
  onNew: (cwd: string) => Promise<string | null>;
  notice?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function start() {
    setError(null);
    setPending(true);
    setError(await onNew(house.cwd));
    setPending(false);
  }
  const needsYou = house.leads.some((lead) => lead.stage === "needs_you");
  return (
    <section className={`house${needsYou ? " needs_you" : ""}`} aria-label={house.project} title={house.cwd}>
      <h2>🏠 {house.project}</h2>
      <ul>
        {house.leads.map((lead) => (
          <LeadItem key={lead.id} lead={lead} cards={cards} onSelect={onSelect} />
        ))}
      </ul>
      <button type="button" onClick={start} disabled={pending}>
        New session
      </button>
      {(error ?? notice) && <p role="alert" className="error">{error ?? notice}</p>}
    </section>
  );
}

/** Details of one character: stage, step, need, its subagents (for a lead) and a button that focuses its terminal. */
function Panel({ character, lead, cards, onClose }: { character: Character; lead: Lead; cards: Card[]; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const inTerminal = event.target instanceof Element && event.target.closest(".terminal");
      if (event.key === "Escape" && !inTerminal) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  return (
    <aside className={`panel${character.id === lead.id && lead.kind === "background" ? " wide" : ""}`} role="dialog" aria-label={`${character.name} details`}>
      <button type="button" className="close" aria-label="Close" onClick={onClose}>
        ✕
      </button>
      <h2>{character.name}</h2>
      <p>{STAGE_LABEL[character.stage]}</p>
      <p className="activity">Step: {character.step ?? "nothing yet"}</p>
      {character.stage === "needs_you" && character.needs && <p>waiting for you: {character.needs}</p>}
      <Cards lead={lead} cards={cards} only={character.id} />
      {character.id === lead.id && lead.subagents.length > 0 && (
        <ul aria-label="Subagents">
          {lead.subagents.map((sub) => (
            <li key={sub.id}>
              {sub.name} {STAGE_LABEL[sub.stage]}
            </li>
          ))}
        </ul>
      )}
      {character.id === lead.id && lead.kind === "background" && <SessionTerminal lead={lead.id} />}
      {character.id === lead.id && lead.kind === "terminal" && (
        <p className="hint">press ← or type /bg in its terminal to open it here</p>
      )}
      {lead.kind === "terminal" && (
        <button type="button" onClick={jump} disabled={pending}>
          Go to terminal
        </button>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </aside>
  );
}

/** The town page: one house per project, its leads and their subagents, with a list of everyone waiting for you. */
export function App() {
  const [town, restarted] = useTown();
  const [selection, setSelection] = useState<{ lead: string; id: string } | null>(null);
  const onClose = useCallback(() => setSelection(null), []);
  const lead = selection
    ? town?.houses.flatMap((house) => house.leads).find((l) => l.id === selection.lead)
    : undefined;
  const selected = lead && [lead, ...lead.subagents].find((c) => c.id === selection?.id);
  useEffect(() => {
    if (town && selection && !selected) setSelection(null);
  }, [town, selection, selected]);
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
  /** Starts a background session in `cwd`; gives an error text, or null once started (its terminal opens when listed). */
  const startSession = useCallback(async (cwd: string): Promise<string | null> => {
    try {
      const reply = await fetch("/sessions", {
        method: "POST",
        headers: { "content-type": "application/json", "x-funtown-token": funtownToken() },
        body: JSON.stringify({ cwd }),
      });
      if (reply.status !== 201) return (await reply.text()) || `Start failed (${reply.status}).`;
      const { id } = (await reply.json()) as { id: string };
      setMissing((all) => all.filter((c) => c !== cwd));
      setOpening((all) => [...all, { id, cwd, at: Date.now(), from: selectionNow.current }]);
      return null;
    } catch {
      return "Couldn't reach Funtown.";
    }
  }, []);
  const waiting = waitingList(town);
  const [muted, toggleMute] = useMute();
  const openWaiting = useCallback((w: Waiting) => setSelection({ lead: w.lead, id: w.id }), []);
  const { toasts, drop } = useAlerts(waiting, town !== null, muted, openWaiting);
  useNextKey(waiting, selection && `${selection.lead}/${selection.id}`, openWaiting);
  return (
    <>
      <header>
        <h1>Funtown</h1>
        <button type="button" aria-pressed={muted} onClick={toggleMute}>
          {muted ? "Unmute" : "Mute"}
        </button>
        <NotifyButton />
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
