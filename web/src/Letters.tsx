import { useEffect, useState } from "react";
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

/**
 * The letters of `lead`, newest first, refetched whenever `stamp` changes (the newest letter times
 * of the lead and its subagents). With `only`, just that character's. Renders nothing when empty.
 */
export function Letters({ lead, stamp, only }: { lead: string; stamp: string; only?: string }) {
  const [letters, setLetters] = useState<Letter[]>([]);
  useEffect(() => {
    let current = true;
    fetch(`/letters?lead=${encodeURIComponent(lead)}`, { headers: { "x-funtown-token": funtownToken() } })
      .then((reply) => (reply.ok ? (reply.json() as Promise<Letter[]>) : []))
      .then((list) => current && setLetters(list))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [lead, stamp]);
  const shown = only ? letters.filter((l) => l.from === only) : letters;
  if (shown.length === 0) return null;
  return (
    <section className="letters" aria-label="Letters">
      {shown.map((letter) => (
        <article key={letter.id} className="letter">
          <h3>
            ✉ {letter.name} <time dateTime={new Date(letter.at).toISOString()}>{new Date(letter.at).toLocaleString()}</time>
          </h3>
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
            {letter.text}
          </Markdown>
        </article>
      ))}
    </section>
  );
}

/** Reply box of a background lead: Send (or ⌘Enter) hands the text to `send`, which types it as one prompt, and clears the box. */
export function ReplyBox({ send }: { send: (text: string) => void }) {
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    send(text);
    setText("");
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
    </form>
  );
}
