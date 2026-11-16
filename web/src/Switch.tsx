import { useEffect, useRef, useState } from "react";
import { funtownToken } from "./token.ts";

export type OpenSession = { id: string; name: string; cwd: string };

/** The "I had to switch" button: a small box asks why (optional) and posts the note with the session open in the panel. */
export function SwitchButton({ open }: { open: OpenSession | null }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [noted, setNoted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (asking) field.current?.focus();
  }, [asking]);
  useEffect(() => {
    if (!noted) return;
    const timer = setTimeout(() => setNoted(false), 3000);
    return () => clearTimeout(timer);
  }, [noted]);
  const close = () => {
    setAsking(false);
    setReason("");
    setError(null);
    button.current?.focus();
  };
  const save = async () => {
    try {
      const body: { reason?: string; open?: OpenSession } = {};
      if (reason.trim()) body.reason = reason.trim();
      if (open) body.open = open;
      const reply = await fetch("/switch", {
        method: "POST",
        headers: { "content-type": "application/json", "x-funtown-token": funtownToken() },
        body: JSON.stringify(body),
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
          className="switch-box"
          aria-label="I had to switch"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
        >
          <label>
            Why?{" "}
            <input ref={field} type="text" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button type="submit">Note it</button>
          {error && <span role="alert">{error}</span>}
        </form>
      )}
      {noted && <span role="status">Switch noted</span>}
    </>
  );
}
