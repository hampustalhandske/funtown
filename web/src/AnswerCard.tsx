import { lazy, Suspense, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";
import type { Card, Character, House, Lead } from "../../server/types.ts";
import { askOf, goalOf, isHeavy, planTop, SEVERITY, shownLabel, stakesOf, topicOf } from "./brief.ts";
import { useArmed, useKey, useUndo } from "./keys.ts";
import { waited } from "./needs.tsx";
import { LazyBoundary } from "./LazyBoundary.tsx";
import { funtownToken } from "./token.ts";
import "./card.css";

// The Queen's text is Markdown, so its renderer stays out of the first page load, as it does for the letters.
const Word = lazy(() => import("./Letters.tsx").then((m) => ({ default: m.Word })));

type Option = { label: string; description?: string };
type Question = { question: string; header?: string; multiSelect?: boolean; options?: Option[] };

/** Under the act of a card Enter never answers: a heavy card or a permission. */
const CLICK_ONLY = "Click to answer";
/** A plan's two answers, the first being the agent's pick (it proposed the plan). */
const PLAN_OPTIONS: Option[] = [
  { label: "Approve", description: "The agent leaves plan mode and starts editing." },
  { label: "Keep planning", description: "Your note goes back; nothing is edited." },
];

/** 1 to 4 choose an option on a one-question card. */
const NUMBER_KEYS = 4;

/** The facts Funtown adds to a card: who asks (the lead, or its subagent and the lead it works under), the project and its phase file. */
export type Facts = { asker: Character; under?: string; project: string; phase?: House["phase"] };

/** Sends one answer for `card`; gives an error text, or null once the server took it. */
async function answer(card: Card, body: object): Promise<string | null> {
  try {
    const reply = await fetch("/answer", {
      method: "POST",
      headers: { "content-type": "application/json", "x-funtown-token": funtownToken() },
      body: JSON.stringify({ card: card.id, ...body }),
    });
    if (reply.status === 204) return null;
    return reply.status === 404 ? "This request is already closed." : `Answer failed (${reply.status}).`;
  } catch {
    return "Couldn't reach Funtown.";
  }
}

/** Asks the steward for her word on `card`; gives the reason it was refused, or null once the server took it. */
async function askWord(card: Card): Promise<string | null> {
  try {
    const reply = await fetch("/word", {
      method: "POST",
      headers: { "content-type": "application/json", "x-funtown-token": funtownToken() },
      body: JSON.stringify({ card: card.id }),
    });
    if (reply.status === 204) return null;
    if (reply.status === 404) return "This request is already closed.";
    return reply.status === 409 ? "The Queen's word is off, or this is her own card." : `Couldn't ask the Queen (${reply.status}).`;
  } catch {
    return "Couldn't reach Funtown.";
  }
}

/** Where her word is while it is on its way, in the user's words: the title and the line under it. */
const QUEEN_WAITING = {
  asking: { title: "Asking the Queen...", line: undefined },
  starting: { title: "The Queen is coming", line: "Starting her session. Your card is first." },
  busy: { title: "The Queen is busy", line: "Your card is next." },
  writing: { title: "The Queen is writing", line: "Usually under a minute." },
} as const;

/**
 * The Queen's slot on a card: the button to ask her, or where her word is, or the word itself (fetched by its letter
 * id, as written). `asking` is the undo window of an ask; `steward` is her listed session, which tells "starting" (none
 * yet) from "busy" (a queued word waits behind her work). Her pick is never marked on the options.
 */
function QueenSlot({ word, asking, steward, error, posting, cap, onAsk }: {
  word: NonNullable<Card["word"]>; asking: boolean; steward?: Lead; error: string | null; posting: boolean; cap: boolean; onAsk: () => void;
}) {
  const state = asking ? "asking" : word.state === "queued" ? (steward ? "busy" : "starting") : word.state;
  const waiting = state in QUEEN_WAITING ? QUEEN_WAITING[state as keyof typeof QUEEN_WAITING] : undefined;
  const ask = (text: string) => (
    <button type="button" className="q-btn" disabled={posting} onClick={onAsk}>
      {text}
      {cap && <kbd aria-hidden="true">Q</kbd>}
    </button>
  );
  return (
    <section className={`queen ${state}`} aria-label="The Queen">
      {waiting && (
        <>
          <p className="q-title" role="status">
            <span className="q-spin" aria-hidden="true" />
            {waiting.title}
            {asking && <small> <kbd>Esc</kbd> to undo</small>}
          </p>
          {waiting.line && <p className="q-line">{waiting.line}</p>}
        </>
      )}
      {state === "idle" && (
        <>
          {ask("Ask the Queen")}
          <p className="q-line">Her second opinion, when you ask.</p>
        </>
      )}
      {state === "ready" && (
        <>
          <p className="q-title">The Queen's word</p>
          {steward && word.letter ? (
            <LazyBoundary>
              <Suspense fallback={null}>
                <Word lead={steward.id} id={word.letter} />
              </Suspense>
            </LazyBoundary>
          ) : (
            <p className="q-line">Her session has gone, so her word can't be shown.</p>
          )}
        </>
      )}
      {state === "failed" && (
        <>
          <p className="q-title">No word from the Queen</p>
          {word.reason && <p className="q-line">{word.reason}</p>}
          {ask("Ask again")}
        </>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  );
}

/** Date.now(), refreshed every 15 s, so a waiting time stays about right. */
function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** `children` in an `as` element cut at `lines` lines, with a "more" after it that opens the rest in place; uncut without `lines`. */
function Clamp({ as: El, className, lines, id, children }: { as: ElementType; className: string; lines?: number; id?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !lines) return;
    const measure = () => setOver(el.scrollHeight > el.clientHeight + 1);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [lines]);
  if (!lines) return <El className={className} id={id}>{children}</El>;
  return (
    <>
      <El ref={ref} id={id} className={`${className} clamp${open ? " open" : ""}`} style={{ "--lines": lines } as CSSProperties}>
        {children}
      </El>
      {(over || open) && (
        // Inside a tile's label, so the press must not also choose the option.
        <button type="button" className="more" aria-expanded={open} onClick={(e) => { e.preventDefault(); setOpen(!open); }}>
          {open ? "less" : "more"}
        </button>
      )}
    </>
  );
}

/**
 * One question's options as tiles: label, then where it leads (cut at `cut` lines when given); the agent's pick wears a
 * ribbon. With `numbered`, the first four carry their number key's keycap.
 */
function Tiles({ options, pick, chosen, multi, cut, numbered = false, onToggle }: {
  options: Option[]; pick: number | null; chosen: string[]; multi: boolean; cut?: number; numbered?: boolean; onToggle: (label: string) => void;
}) {
  const id = useId();
  return (
    <div className="tiles" style={{ "--n": options.length } as CSSProperties}>
      {options.map((option, i) => (
        <label key={option.label} className={`tile${chosen.includes(option.label) ? " on" : ""}`}>
          <input
            type={multi ? "checkbox" : "radio"}
            name={id}
            aria-label={shownLabel(option.label)}
            aria-describedby={option.description ? `${id}-${i}` : undefined}
            checked={chosen.includes(option.label)}
            onChange={() => onToggle(option.label)}
          />
          {pick === i && <span className="ribbon">Agent's pick</span>}
          <span className="lab">
            {numbered && i < NUMBER_KEYS && <kbd aria-hidden="true">{i + 1}</kbd>}
            {shownLabel(option.label)}
          </span>
          {option.description && <Clamp as="span" className="desc" id={`${id}-${i}`} lines={cut}>{option.description}</Clamp>}
        </label>
      ))}
    </div>
  );
}

/**
 * One held ask as its decision brief (take C, "Weighed"): who asks and where, the weight meter, the ask in one line, the
 * goal it serves, a heavy card's stakes, the options as tiles with the agent's pick chosen, the act row, and the raw
 * input one button away. `onLetter` opens the asker's newest letter. No form: nothing sends but the act's own buttons,
 * and, with `keys` (the only card in an open pane), Enter while armed, 1 to 4, D and Q. `steward` is the Queen's listed
 * session, when there is one.
 */
export function AnswerCard({ card, facts, keys = false, steward, onLetter }: { card: Card; facts: Facts; keys?: boolean; steward?: Lead; onLetter?: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [raw, setRaw] = useState(false);
  const [approve, setApprove] = useState(true);
  const [note, setNote] = useState("");
  const questions = Array.isArray(card.input.questions) ? (card.input.questions as Question[]) : [];
  const [chosen, setChosen] = useState<string[][]>(() =>
    questions.map((q, i) => {
      const pick = card.questions?.[i]?.pick;
      const option = pick == null ? undefined : q.options?.[pick];
      return option ? [option.label] : [];
    }),
  );
  const [typed, setTyped] = useState<string[]>(() => questions.map(() => ""));
  const now = useNow();
  async function send(body: object) {
    setError(null);
    setPending(true);
    const failed = await answer(card, body);
    // Once answered, the card says so and offers no button until the next state removes it.
    setError(failed);
    setPending(false);
    setSent(!failed);
  }
  const { level, reason } = card.severity;
  const sev = SEVERITY[level];
  const heavy = isHeavy(level);
  // A heavy card shows everything uncut; a light one cuts long text at 3 lines.
  const cut = heavy ? undefined : 3;
  const goal = goalOf(facts.phase);
  const { asker, under, project } = facts;
  const plan = typeof card.input.plan === "string" ? card.input.plan : "";
  const top = planTop(plan);
  const command = card.kind === "permission" && typeof card.input.command === "string" ? card.input.command : undefined;

  const valueOf = (i: number) => typed[i].trim() || chosen[i].join(", ");
  const complete = questions.every((_, i) => valueOf(i) !== "");
  function toggle(i: number, label: string) {
    const was = chosen[i];
    const next = questions[i].multiSelect ? (was.includes(label) ? was.filter((l) => l !== label) : [...was, label]) : [label];
    setChosen(chosen.map((c, j) => (j === i ? next : c)));
  }
  const chosenWords = questions.map((_, i) => typed[i].trim() || chosen[i].map(shownLabel).join(", ")).join("; ");
  // What the act button sends, and its words; a permission has no one act, so no key answers it.
  const act =
    card.kind === "question" ? { body: { decision: "allow", answers: Object.fromEntries(questions.map((q, i) => [q.question, valueOf(i)])) }, words: chosenWords }
    : card.kind === "plan" ? { body: approve ? { decision: "allow" } : { decision: "deny", feedback: note.trim() || undefined }, words: approve ? "Approve" : "Keep planning" }
    : null;
  const [waiting, startUndo] = useUndo((what: NonNullable<typeof act>) => void send(what.body));
  const [wordError, setWordError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  async function ask() {
    setWordError(null);
    setPosting(true);
    setWordError(await askWord(card));
    setPosting(false);
  }
  const [asking, startAsk] = useUndo<"ask">(() => void ask());
  const open = !pending && !sent && waiting === null && asking === null;
  // Armed (ADR 0004): a low or medium question with a choice in every question, or a medium plan, alone in its pane.
  const armed = useArmed(keys && open && act !== null && !heavy && complete);
  useKey("Enter", () => act && startUndo(act), armed);
  // Q takes the same second and undo window. It only asks her, so it needs no choice made and works on a heavy card too.
  const askable = (card.word?.state === "idle" || card.word?.state === "failed") && !posting;
  const askArmed = useArmed(keys && open && askable);
  useKey("q", () => startAsk("ask"), askArmed);
  const numbered = keys && open && card.kind === "question" && questions.length === 1;
  const options = questions[0]?.options ?? [];
  const numberKey = (i: number) => () => toggle(0, options[i].label);
  useKey("1", numberKey(0), numbered && options.length > 0);
  useKey("2", numberKey(1), numbered && options.length > 1);
  useKey("3", numberKey(2), numbered && options.length > 2);
  useKey("4", numberKey(3), numbered && options.length > 3);
  useKey("d", () => setRaw((shown) => !shown), keys);
  const enterCap = armed && <kbd aria-hidden="true">Enter</kbd>;
  /** The act row, or in its place the undo window while a send waits, or the word that it went. */
  const slot = card.word && (
    <QueenSlot word={card.word} asking={asking !== null} steward={steward} error={wordError} posting={posting} cap={askArmed} onAsk={() => void ask()} />
  );
  // The Queen's slot goes above the act row on a heavy card (offered before the act) and under it on a light one.
  const actOr = (row: ReactNode) => (
    <>
      {heavy && slot}
      {actContent(row)}
      {!heavy && slot}
    </>
  );
  const actContent = (row: ReactNode) =>
    waiting ? (
      <div className="sending" role="status">
        Sending {waiting.words}... <small><kbd>Esc</kbd> to undo</small>
      </div>
    ) : sent ? (
      <p className="sent" role="status">Sent. The agent goes on.</p>
    ) : (
      row
    );

  return (
    <div className={`answer-card ${card.kind}${waiting || sent ? " dim" : ""}`} data-sev={level} style={{ "--sev": sev.colour } as CSSProperties} role="group" aria-label={`${card.kind} request`}>
      <p className="who">
        <b>{asker.name}</b>
        {asker.role && ` (${asker.role})`} · {project}
        {under && ` · under ${under}`} · waiting {waited(card.at, now)}
      </p>
      <div className="weigh">
        <span className="marks" aria-hidden="true">
          {[1, 2, 3].map((n) => <i key={n} className={n <= sev.marks ? "on" : undefined} />)}
        </span>
        <b>{sev.word}</b> <span>{reason}</span>
      </div>
      {/* A header with a level word is already in the reason above; one without is shown as the topic. */}
      {questions.length === 1 && topicOf(questions[0].header) === questions[0].header && <p className="topic">{questions[0].header}</p>}
      <Clamp as="h3" className="ask" lines={cut}>{askOf(card, questions)}</Clamp>
      {goal && (
        <Clamp as="p" className="goal" lines={2}>
          {goal.goal && <>For <b>{goal.goal}</b> · </>}
          {goal.where}
        </Clamp>
      )}
      {goal?.spec && <p className="goal">Spec: {goal.spec}</p>}
      {heavy ? (
        <div className="stakes">
          <p className="why">{stakesOf(card.severity)}</p>
          {command !== undefined && <pre className="cmd">{command}</pre>}
          {asker.step && <p>Last step: {asker.step}</p>}
        </div>
      ) : (
        command !== undefined && <pre className="cmd">{command}</pre>
      )}
      {card.kind === "question" && (
        <>
          {questions.map((q, i) => (
            <fieldset key={q.question}>
              {questions.length > 1 && (
                <legend>
                  {q.question} <small>· {[topicOf(q.header), SEVERITY[card.questions?.[i]?.level ?? "unstated"].word].filter(Boolean).join(" · ")}</small>
                </legend>
              )}
              <Tiles options={q.options ?? []} pick={card.questions?.[i]?.pick ?? null} chosen={chosen[i]} multi={!!q.multiSelect} cut={cut} numbered={numbered} onToggle={(label) => toggle(i, label)} />
              <label className="tile other">
                Other
                <input type="text" aria-label={`Other: ${q.question}`} placeholder="your own answer" value={typed[i]} onChange={(e) => setTyped(typed.map((t, j) => (j === i ? e.target.value : t)))} />
              </label>
            </fieldset>
          ))}
          {actOr(
            <div className="act">
              <button type="button" className="go" disabled={pending || !complete} onClick={() => send(act!.body)}>
                {complete ? `${heavy ? "Answer" : "Send"}: ${chosenWords}` : "Send"}
                {enterCap}
              </button>
              {!complete ? <p className="hint">Choose an option to send</p> : heavy && <p className="hint">{CLICK_ONLY}</p>}
            </div>,
          )}
        </>
      )}
      {card.kind === "plan" && (
        <>
          {top.length > 0 ? (
            <div className="plantop">{top.map((line, i) => <p key={i}>{line}</p>)}</div>
          ) : (
            <Clamp as="p" className="plantop" lines={cut}>{plan}</Clamp>
          )}
          <Tiles options={PLAN_OPTIONS} pick={0} chosen={[approve ? "Approve" : "Keep planning"]} multi={false} onToggle={(label) => setApprove(label === "Approve")} />
          {!approve && <textarea className="note" aria-label="Note to the agent" placeholder="Your note to the agent (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
          {actOr(
            <div className="act">
              <button type="button" className="go" disabled={pending} onClick={() => send(act!.body)}>
                {act!.words}
                {enterCap}
              </button>
              {heavy && <p className="hint">{CLICK_ONLY}</p>}
            </div>,
          )}
        </>
      )}
      {card.kind === "permission" &&
        actOr(
          <div className="act">
            <button type="button" className="go ghost" disabled={pending} onClick={() => send({ decision: "allow" })}>{heavy ? "Allow once" : "Allow"}</button>
            <button type="button" className="go ghost" disabled={pending} onClick={() => send({ decision: "deny" })}>Deny</button>
            <p className="hint">{CLICK_ONLY}</p>
            <p className="note">Allow runs it once; Deny tells the agent no.</p>
          </div>,
        )}
      {error && <p role="alert" className="error">{error}</p>}
      <div className="tail">
        <button type="button" aria-expanded={raw} onClick={() => setRaw(!raw)}>
          {raw ? "Hide raw detail" : "Raw detail"}
          {keys && <kbd aria-hidden="true">D</kbd>}
        </button>
        {!heavy && asker.step && <span>Last step: {asker.step}</span>}
        {asker.letter !== undefined && onLetter && <button type="button" onClick={onLetter}>Newest letter</button>}
      </div>
      {raw && <pre className="raw">{JSON.stringify(card.input, null, 2)}</pre>}
    </div>
  );
}
