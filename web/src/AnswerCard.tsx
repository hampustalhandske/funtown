import { useState } from "react";
import type { Card } from "../../server/types.ts";
import { funtownToken } from "./Terminal.tsx";

type Question = { question: string; header?: string; multiSelect?: boolean; options?: { label: string; description?: string }[] };

/** The exact thing a permission asks to run or touch: a Bash command, a file path, else the raw input. */
function subject(card: Card): string {
  const { command, file_path: path } = card.input;
  if (typeof command === "string") return command;
  if (typeof path === "string") return path;
  return JSON.stringify(card.input, null, 2);
}

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

function QuestionForm({ questions, onSend, disabled }: { questions: Question[]; onSend: (answers: Record<string, string>) => void; disabled: boolean }) {
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const valueOf = (q: Question) => typed[q.question]?.trim() || (picked[q.question] ?? []).join(", ");
  const complete = questions.every((q) => valueOf(q) !== "");
  function toggle(q: Question, label: string) {
    const now = picked[q.question] ?? [];
    const next = q.multiSelect ? (now.includes(label) ? now.filter((l) => l !== label) : [...now, label]) : [label];
    setPicked({ ...picked, [q.question]: next });
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSend(Object.fromEntries(questions.map((q) => [q.question, valueOf(q)])));
      }}>
      {questions.map((q) => (
        <fieldset key={q.question}>
          <legend>{q.question}</legend>
          {(q.options ?? []).map((option) => (
            <label key={option.label} className="option">
              <input
                type={q.multiSelect ? "checkbox" : "radio"}
                name={q.question}
                checked={(picked[q.question] ?? []).includes(option.label)}
                onChange={() => toggle(q, option.label)}
              />
              {option.label}
              {option.description && <span className="hint"> {option.description}</span>}
            </label>
          ))}
          <label className="option">
            Other
            <input type="text" aria-label={`Other: ${q.question}`} value={typed[q.question] ?? ""} onChange={(e) => setTyped({ ...typed, [q.question]: e.target.value })} />
          </label>
        </fieldset>
      ))}
      <button type="submit" disabled={disabled || !complete}>Send</button>
    </form>
  );
}

/** One held request: what it asks, the folder, and the buttons that answer it. `who` names the asking subagent. */
export function AnswerCard({ card, who }: { card: Card; who?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function send(body: object) {
    setError(null);
    setPending(true);
    const failed = await answer(card, body);
    // Once answered, the buttons stay off until the next state removes the card.
    setError(failed);
    if (failed) setPending(false);
  }
  const plan = typeof card.input.plan === "string" ? card.input.plan : JSON.stringify(card.input, null, 2);
  const questions = Array.isArray(card.input.questions) ? (card.input.questions as Question[]) : [];
  return (
    <div className={`answer-card ${card.kind}`} role="group" aria-label={`${card.kind} request`}>
      <p className="who">{who ?? "Claude"} {card.kind === "permission" ? `asks to use ${card.tool}` : card.kind === "question" ? "asks a question" : "asks you to approve a plan"}</p>
      {card.kind === "permission" && <pre className="subject">{subject(card)}</pre>}
      <p className="folder">{card.cwd}</p>
      {card.kind === "permission" && (
        <div className="actions">
          <button type="button" disabled={pending} onClick={() => send({ decision: "allow" })}>Allow</button>
          <button type="button" disabled={pending} onClick={() => send({ decision: "deny" })}>Deny</button>
        </div>
      )}
      {card.kind === "question" && (
        <QuestionForm questions={questions} disabled={pending} onSend={(answers) => send({ decision: "allow", answers })} />
      )}
      {card.kind === "plan" && (
        <>
          <pre className="plan">{plan}</pre>
          <textarea aria-label="Feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          <div className="actions">
            <button type="button" disabled={pending} onClick={() => send({ decision: "allow" })}>Approve</button>
            <button type="button" disabled={pending} onClick={() => send({ decision: "deny", feedback: feedback.trim() || undefined })}>Keep planning</button>
          </div>
        </>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}
