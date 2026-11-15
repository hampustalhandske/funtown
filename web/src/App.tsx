import { useEffect, useState } from "react";
import type { Character, House, Lead, Stage, Town } from "../../server/types.ts";

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
          <span className="stage">{STAGE_LABEL[stage]}</span>
        </span>
        {stage === "needs_you" && needs && <span className="activity">waiting for you: {needs}</span>}
        {stage === "working" && <span className="activity">{activity ?? "thinking"}</span>}
      </span>
    </button>
  );
}

function LeadItem({ lead, onSelect }: { lead: Lead; onSelect: (id: string) => void }) {
  return (
    <li className="lead">
      <CharacterRow character={lead} avatar="🧑‍💻" onSelect={onSelect} />
      {lead.subagents.length > 0 && (
        <ul className="subagents" aria-label={`${lead.name} subagents`}>
          {lead.subagents.map((sub) => (
            <li key={sub.id}>
              <CharacterRow character={sub} avatar="🤖" onSelect={onSelect} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function HouseCard({ house, onSelect }: { house: House; onSelect: (id: string) => void }) {
  const needsYou = house.leads.some((lead) => lead.stage === "needs_you");
  return (
    <section className={`house${needsYou ? " needs_you" : ""}`} aria-label={house.project} title={house.cwd}>
      <h2>🏠 {house.project}</h2>
      <ul>
        {house.leads.map((lead) => (
          <LeadItem key={lead.id} lead={lead} onSelect={onSelect} />
        ))}
      </ul>
    </section>
  );
}

/** Details of one character: stage, step, need, its subagents (for a lead) and a button that focuses its terminal. */
function Panel({ character, lead, onClose }: { character: Character; lead: Lead; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function jump() {
    setError(null);
    try {
      const reply = await fetch("/jump", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lead: lead.id }),
      });
      if (reply.status !== 204) setError((await reply.text()) || `Jump failed (${reply.status}).`);
    } catch {
      setError("Couldn't reach Funtown.");
    }
  }

  return (
    <aside className="panel" role="dialog" aria-label={`${character.name} details`}>
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
      <button type="button" onClick={jump}>
        Go to terminal
      </button>
      {error && <p role="alert" className="error">{error}</p>}
    </aside>
  );
}

/** The town page: one house per project, its leads and their subagents, with a banner when any lead needs you. */
export function App() {
  const town = useTown();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const lead = town?.houses
    .flatMap((house) => house.leads)
    .find((l) => l.id === selectedId || l.subagents.some((sub) => sub.id === selectedId));
  const selected = lead && [lead, ...lead.subagents].find((c) => c.id === selectedId);
  useEffect(() => {
    if (town && selectedId && !selected) setSelectedId(null);
  }, [town, selectedId, selected]);
  const waiting =
    town?.houses.flatMap((house) =>
      house.leads.filter((lead) => lead.stage === "needs_you").map((lead) => `${lead.name} (${house.project})`),
    ) ?? [];
  return (
    <>
      <header>
        <h1>Funtown</h1>
      </header>
      {waiting.length > 0 && (
        <div className="alert" role="alert">
          🔴 {waiting.length === 1 ? "1 session needs you" : `${waiting.length} sessions need you`}:{" "}
          {waiting.join(", ")}
        </div>
      )}
      {town && town.houses.length === 0 && <p className="empty">No Claude sessions running yet.</p>}
      <main className="town">
        {town?.houses.map((house) => (
          <HouseCard key={house.cwd} house={house} onSelect={setSelectedId} />
        ))}
      </main>
      {lead && selected && <Panel key={selected.id} character={selected} lead={lead} onClose={() => setSelectedId(null)} />}
    </>
  );
}
