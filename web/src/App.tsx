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

function CharacterRow({ character, avatar }: { character: Character; avatar: string }) {
  const { name, stage, activity, needs } = character;
  return (
    <div className={`character ${stage}`} data-stage={stage}>
      <span className="avatar" aria-hidden="true">{avatar}</span>
      <div>
        <div>
          <span className="name">{name}</span>
          <span className="stage">{STAGE_LABEL[stage]}</span>
        </div>
        {stage === "needs_you" && needs && <div className="activity">waiting for you: {needs}</div>}
        {stage === "working" && <div className="activity">{activity ?? "thinking"}</div>}
      </div>
    </div>
  );
}

function LeadItem({ lead }: { lead: Lead }) {
  return (
    <li className="lead">
      <CharacterRow character={lead} avatar="🧑‍💻" />
      {lead.subagents.length > 0 && (
        <ul className="subagents" aria-label={`${lead.name} subagents`}>
          {lead.subagents.map((sub) => (
            <li key={sub.id}>
              <CharacterRow character={sub} avatar="🤖" />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function HouseCard({ house }: { house: House }) {
  const needsYou = house.leads.some((lead) => lead.stage === "needs_you");
  return (
    <section className={`house${needsYou ? " needs_you" : ""}`} aria-label={house.project} title={house.cwd}>
      <h2>🏠 {house.project}</h2>
      <ul>
        {house.leads.map((lead) => (
          <LeadItem key={lead.id} lead={lead} />
        ))}
      </ul>
    </section>
  );
}

/** The town page: one house per project, its leads and their subagents, with a banner when any lead needs you. */
export function App() {
  const town = useTown();
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
          <HouseCard key={house.cwd} house={house} />
        ))}
      </main>
    </>
  );
}
