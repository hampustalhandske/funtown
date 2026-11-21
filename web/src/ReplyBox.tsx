import { useState } from "react";

/** Reply box of a background lead: Send (or ⌘Enter) hands the text to `send`, which types it as one prompt and gives null when it went out, else the reason.
 * The box clears only when it went out; otherwise the text stays and the reason shows. */
export function ReplyBox({ send }: { send: (text: string) => string | null }) {
  const [text, setText] = useState("");
  const [failed, setFailed] = useState<string | null>(null);
  const submit = () => {
    if (!text.trim()) return;
    const failure = send(text);
    setFailed(failure);
    if (!failure) setText("");
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
      {failed && <p role="alert" className="error">{failed}</p>}
    </form>
  );
}
