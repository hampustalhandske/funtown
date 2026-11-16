import { memo, useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Letter } from "../../server/types.ts";
import { funtownToken } from "./Terminal.tsx";
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

/** One letter as written, headed with `name` (default: the name it was written with) and its time; long ones show 12 lines until "Show all". */
export const LetterView = memo(function LetterView({ letter, name = letter.name }: { letter: Letter; name?: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = letter.text.split("\n");
  const long = lines.length > PREVIEW_LINES;
  const text = long && !expanded ? lines.slice(0, PREVIEW_LINES).join("\n") : letter.text;
  return (
    <article className="letter">
      <h3>
        ✉ {name} <time dateTime={new Date(letter.at).toISOString()}>{new Date(letter.at).toLocaleString()}</time>
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

/** Reply box of a background lead: Send (or ⌘Enter) hands the text to `send`, which types it as one prompt and returns whether it went out.
 * The box clears only when it did; otherwise the text stays and an error shows. */
export function ReplyBox({ send }: { send: (text: string) => boolean }) {
  const [text, setText] = useState("");
  const [failed, setFailed] = useState(false);
  const submit = () => {
    if (!text.trim()) return;
    const sent = send(text);
    setFailed(!sent);
    if (sent) setText("");
  };
  return (
    <form className="reply" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <textarea
        aria-label="Reply"
        value={text}
        rows={3}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) { e.preventDefault(); submit(); } }}
      />
      <button type="submit">Send</button>
      {failed && <p role="alert" className="error">Not sent: the terminal isn't connected.</p>}
    </form>
  );
}
