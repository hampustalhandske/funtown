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

const LetterView = memo(function LetterView({ letter }: { letter: Letter }) {
  return (
    <article className="letter">
      <h3>
        ✉ {letter.name} <time dateTime={new Date(letter.at).toISOString()}>{new Date(letter.at).toLocaleString()}</time>
      </h3>
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
        {letter.text}
      </Markdown>
    </article>
  );
});

/**
 * The letters of `lead`, newest first, refetched whenever `stamp` changes (the newest letter times
 * of the lead and its subagents). With `only`, just that character's. A 404 means no letters; any other
 * failure shows an error line and keeps the letters already shown. Renders nothing when empty.
 */
export function Letters({ lead, stamp, only }: { lead: string; stamp: string; only?: string }) {
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
        <LetterView key={letter.id} letter={letter} />
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
