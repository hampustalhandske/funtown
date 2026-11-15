import { useCallback, useEffect, useState } from "react";
import type { Character, House, Lead, Stage, Town } from "../../server/types.ts";
import { SessionTerminal, funtownToken } from "./Terminal.tsx";

const STAGE_LABEL: Record<Stage, string> = {
  working: "🟢 working",
  needs_you: "🔴 needs you",
  done: "⚪ done",
  gone: "⚫ gone",
};

/** Subscribes to the server's Town stream; gives the latest Town, or null before the first. */
function useTown(): Town | null {
  const [town, setTown] = useState<Town | null>(null);
  useEffect(() => {
    const source = new EventSource("/stream");
    source.addEventListener("state", (event) => setTown(JSON.parse(event.data) as Town));
    return () => source.close();
  }, []);
  return town;
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
    <button type="button" className={`character ${stage}`} data-stage={stage} onClick={() => onSelect(character.id)}>
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

function LeadItem({ lead, onSelect }: { lead: Lead; onSelect: Select }) {
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
    </li>
  );
}

function HouseCard({
  house,
  onSelect,
  onNew,
}: {
  house: House;
  onSelect: Select;
  onNew: (cwd: string) => Promise<string | null>;
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
          <LeadItem key={lead.id} lead={lead} onSelect={onSelect} />
        ))}
      </ul>
      <button type="button" onClick={start} disabled={pending}>
        New session
      </button>
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  );
}

/** Details of one character: stage, step, need, its subagents (for a lead) and a button that focuses its terminal. */
function Panel({ character, lead, onClose }: { character: Character; lead: Lead; onClose: () => void }) {
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
      {(lead.kind === "terminal" || character.id !== lead.id) && (
        <button type="button" onClick={jump} disabled={pending}>
          Go to terminal
        </button>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </aside>
  );
}

/** The town page: one house per project, its leads and their subagents, with a banner when any lead needs you. */
export function App() {
  const town = useTown();
  const [selection, setSelection] = useState<{ lead: string; id: string } | null>(null);
  const onClose = useCallback(() => setSelection(null), []);
  const lead = selection
    ? town?.houses.flatMap((house) => house.leads).find((l) => l.id === selection.lead)
    : undefined;
  const selected = lead && [lead, ...lead.subagents].find((c) => c.id === selection?.id);
  useEffect(() => {
    if (town && selection && !selected) setSelection(null);
  }, [town, selection, selected]);
  const [opening, setOpening] = useState<string | null>(null);
  const openedLead = opening ? town?.houses.flatMap((house) => house.leads).find((l) => l.shortId === opening) : undefined;
  useEffect(() => {
    if (openedLead) {
      setSelection({ lead: openedLead.id, id: openedLead.id });
      setOpening(null);
    }
  }, [openedLead]);
  /** Starts a background session in `cwd`; gives an error text, or null once started (its terminal opens when listed). */
  const startSession = useCallback(async (cwd: string): Promise<string | null> => {
    try {
      const reply = await fetch("/sessions", {
        method: "POST",
        headers: { "content-type": "application/json", "x-funtown-token": funtownToken() },
        body: JSON.stringify({ cwd }),
      });
      if (reply.status !== 201) return (await reply.text()) || `Start failed (${reply.status}).`;
      setOpening(((await reply.json()) as { id: string }).id);
      return null;
    } catch {
      return "Couldn't reach Funtown.";
    }
  }, []);
  const waiting =
    town?.houses.flatMap((house) =>
      house.leads.filter((lead) => lead.stage === "needs_you").map((lead) => `${lead.name} (${house.project})`),
    ) ?? [];
  return (
    <>
      <header>
        <h1>Funtown</h1>
      </header>
      {town && town.claude.problems.length > 0 && (
        <div className="alert" role="alert" aria-label="Claude version problems">
          <ul>
            {town.claude.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}
      {waiting.length > 0 && (
        <div className="alert" role="alert">
          🔴 {waiting.length === 1 ? "1 session needs you" : `${waiting.length} sessions need you`}:{" "}
          {waiting.join(", ")}
        </div>
      )}
      {town && town.houses.length === 0 && <p className="empty">No Claude sessions running yet.</p>}
      <main className="town">
        {town?.houses.map((house) => (
          <HouseCard
            key={house.cwd}
            house={house}
            onSelect={(leadId, id) => setSelection({ lead: leadId, id })}
            onNew={startSession}
          />
        ))}
      </main>
      {lead && selected && <Panel key={`${lead.id}/${selected.id}`} character={selected} lead={lead} onClose={onClose} />}
    </>
  );
}
