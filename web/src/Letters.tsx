import { memo, useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Letter } from "../../server/types.ts";
import { funtownToken } from "./token.ts";
import "./hljs.css";

/** Raw HTML is never rendered by react-markdown; an image becomes a link so nothing is fetched. */
const components = {
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noreferrer">{children}</a>
  ),
  img: ({ src, alt }: { src?: string; alt?: string }) => (
    <a href={src} target="_blank" rel="noreferrer">{alt || src}</a>
  ),
};

const PREVIEW_LINES = 12;

/** One letter as written, headed with `name`, else the name it was written with, else its writer's id (first 8 characters), and its time; long ones show 12 lines until "Show all". */
export const LetterView = memo(function LetterView({ letter, name }: { letter: Letter; name?: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = letter.text.split("\n");
  const long = lines.length > PREVIEW_LINES;
  const text = long && !expanded ? lines.slice(0, PREVIEW_LINES).join("\n") : letter.text;
  return (
    <article className="letter">
      <h3>
        ✉ {name || letter.name || letter.from.slice(0, 8)} <time dateTime={new Date(letter.at).toISOString()}>{new Date(letter.at).toLocaleString()}</time>
      </h3>
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
        {text}
      </Markdown>
      {long && (
        <button type="button" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show less" : "Show all"}
        </button>
      )}
    </article>
  );
});

/**
 * One letter of `lead` by its id, as written, with no heading, in a `className` box: the Queen's word on a card, or
 * her review of a PR. Line breaks stay, so her labelled parts stay on their own lines. A missing letter or a failed
 * fetch says so in a line.
 */
export function LetterById({ lead, id, className }: { lead: string; id: string; className: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setText(null);
    setError("");
    fetch(`/letters?lead=${encodeURIComponent(lead)}&id=${encodeURIComponent(id)}`, { headers: { "x-funtown-token": funtownToken() } })
      .then(async (reply) => {
        if (!current) return;
        if (reply.status === 404) setError("This letter is no longer kept.");
        else if (!reply.ok) setError(`This letter failed to load (${reply.status}).`);
        else setText(((await reply.json()) as Letter[])[0]?.text ?? "");
      })
      .catch(() => current && setError("This letter failed to load."));
    return () => {
      current = false;
    };
  }, [lead, id]);
  if (error) return <p role="alert" className="error">{error}</p>;
  if (text === null) return null;
  return (
    <div className={className}>
      <Markdown remarkPlugins={[remarkGfm]} components={components}>{text}</Markdown>
    </div>
  );
}

/**
 * The letters of `lead`, newest first, refetched whenever `stamp` changes (the newest letter times
 * of the lead and its subagents). With `only`, just that character's. A heading shows the writer's name
 * from `names` (character id to current name) when listed there. A 404 means no letters; any other
 * failure shows an error line and keeps the letters already shown. Renders nothing when empty.
 */
export function Letters({ lead, stamp, only, names }: { lead: string; stamp: string; only?: string; names: Record<string, string> }) {
  const [letters, setLetters] = useState<Letter[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    fetch(`/letters?lead=${encodeURIComponent(lead)}`, { headers: { "x-funtown-token": funtownToken() } })
      .then(async (reply) => {
        if (!current) return;
        if (reply.status === 404) {
          setLetters([]);
          setError("");
        } else if (!reply.ok) {
          setError(`Letters failed to load (${reply.status}).`);
        } else {
          setLetters((await reply.json()) as Letter[]);
          setError("");
        }
      })
      .catch(() => current && setError("Letters failed to load."));
    return () => {
      current = false;
    };
  }, [lead, stamp]);
  const shown = only ? letters.filter((l) => l.from === only) : letters;
  if (shown.length === 0 && !error) return null;
  return (
    <section className="letters" aria-label="Letters">
      {error && <p role="alert" className="error">{error}</p>}
      {shown.map((letter) => (
        <LetterView key={letter.id} letter={letter} name={names[letter.from]} />
      ))}
    </section>
  );
}
