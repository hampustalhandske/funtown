import { useEffect, useRef, useState } from "react";
import { useLayer } from "./keys.ts";
import { funtownToken } from "./token.ts";

export type OpenSession = { id: string; name: string; cwd: string };

/** The "I had to switch" button: a small box asks why (optional) and posts the note with the session open in the panel. */
export function SwitchButton({ open }: { open: OpenSession | null }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [noted, setNoted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLFormElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!noted) return;
    const timer = setTimeout(() => setNoted(false), 3000);
    return () => clearTimeout(timer);
  }, [noted]);
  const close = () => {
    setAsking(false);
    setReason("");
    setError(null);
    if (box.current?.contains(document.activeElement)) button.current?.focus();
  };
  useLayer("pane", asking, close);
  const save = async () => {
    try {
      const reply = await fetch("/switch", {
        method: "POST",
        headers: { "content-type": "application/json", "x-funtown-token": funtownToken() },
        body: JSON.stringify({ reason: reason.trim() || undefined, open: open ?? undefined }),
      });
      if (reply.status !== 204) {
        setError(`Couldn't note it (${reply.status}).`);
        return;
      }
      close();
      setNoted(true);
    } catch {
      setError("Couldn't reach Funtown.");
    }
  };
  return (
    <>
      <button ref={button} type="button" onClick={() => setAsking(true)}>I had to switch</button>
      {asking && (
        <form
          ref={box}
          className="switch-box"
          aria-label="I had to switch"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label>
            Why?{" "}
            <input autoFocus type="text" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button type="submit">Note it</button>
          {error && <span role="alert">{error}</span>}
        </form>
      )}
      {noted && <span role="status">Switch noted</span>}
    </>
  );
}
