import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

/** The page's token, injected by the server as `<meta name="funtown-token">`. */
export function funtownToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="funtown-token"]')?.content ?? "";
}

/**
 * Live terminal of one background session: an xterm.js view over the `/term` WebSocket; closing it
 * closes the socket. `reply`, when given, is set to a function that types a text into the session
 * as one prompt (bracketed paste, then Enter).
 */
export function SessionTerminal({ lead, reply }: { lead: string; reply?: MutableRefObject<((text: string) => void) | null> }) {
  const host = useRef<HTMLDivElement>(null);
  const [shared, setShared] = useState(1);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const term = new XTerm({ cursorBlink: true, fontSize: 13 });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current!);
    fit.fit();

    const query = new URLSearchParams({
      lead,
      token: funtownToken(),
      cols: String(term.cols),
      rows: String(term.rows),
    });
    const socket = new WebSocket(`ws://${location.host}/term?${query}`);
    const send = (frame: object) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(frame));

    if (reply) {
      reply.current = (text) => {
        send({ t: "in", d: "\x1b[200~" + text + "\x1b[201~" });
        send({ t: "in", d: "\r" });
      };
    }

    socket.onmessage = (event) => {
      const frame = JSON.parse(String(event.data)) as { t: string; d?: string; n?: number };
      if (frame.t === "out") term.write(frame.d ?? "");
      else if (frame.t === "shared") setShared(frame.n ?? 1);
    };
    socket.onclose = () => setClosed(true);
    // A resize while the socket was connecting was dropped, so send the size it has now.
    socket.onopen = () => send({ t: "resize", c: term.cols, r: term.rows });

    term.attachCustomKeyEventHandler((event) => {
      if (event.key !== "Enter" || !event.shiftKey) return true;
      if (event.type === "keydown") send({ t: "in", d: "\x1b\r" });
      return false;
    });
    term.onData((d) => send({ t: "in", d }));
    term.onResize(({ cols, rows }) => send({ t: "resize", c: cols, r: rows }));
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(host.current!);
    term.focus();

    return () => {
      if (reply) reply.current = null;
      observer.disconnect();
      socket.close();
      term.dispose();
    };
  }, [lead, reply]);

  return (
    <>
      {shared >= 2 && (
        <p role="alert" className="error">
          This session is open in {shared} places; typing shows up in all of them.
        </p>
      )}
      {closed && <p className="activity">Terminal closed.</p>}
      <div className="terminal" ref={host} aria-label="Session terminal" />
    </>
  );
}
