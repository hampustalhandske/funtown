import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Terminal as XTerm, type ILink } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { funtownToken } from "./token.ts";

/** Opens `url` in a new tab (in the app, the window's rule sends it to the default browser), only for Cmd+click and only for http and https. */
function openLink(event: MouseEvent, url: string) {
  if (event.metaKey && /^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener");
}

/** Finds the plain http and https URLs in one buffer line (1-based), leaving off the punctuation a sentence puts after one. */
function plainLinks(term: XTerm, line: number): ILink[] {
  const text = term.buffer.active.getLine(line - 1)?.translateToString(true) ?? "";
  return [...text.matchAll(/https?:\/\/[^\s<>"'`]+/g)].map((m) => {
    const url = m[0].replace(/[.,;:!?)\]}]+$/, "");
    const x = m.index + 1;
    return { text: url, range: { start: { x, y: line }, end: { x: x + url.length - 1, y: line } }, activate: openLink };
  });
}

/** The last line of `term` with any text, trimmed; empty when it has none. */
function lastPrintedLine(term: XTerm): string {
  const buffer = term.buffer.active;
  for (let y = buffer.length - 1; y >= 0; y--) {
    const text = buffer.getLine(y)?.translateToString(true).trim();
    if (text) return text;
  }
  return "";
}

/** How long a shown session terminal may stay empty before "Waking the session..." appears (ms). */
const WAKING_AFTER = 300;

/**
 * Live terminal over the `/term` WebSocket, for a background session (`lead`) or, with `shell` (a house's folder), that
 * project's lasting shell (closing the view leaves the shell running). Closing the view closes the socket.
 * `reply` is set to a function that types a text into the session as one prompt and gives null when it was sent, else the reason it wasn't.
 * `shown` says whether the page is showing it (a hidden one stays connected and takes no focus); a session terminal still empty
 * `WAKING_AFTER` ms after it is shown gets "Waking the session..." drawn over it. Cmd+Esc calls `onLeave` and sends the session nothing.
 * When a session's socket closes on its own, `onEnd` gets the close code and the last line the client printed.
 */
export function SessionTerminal({
  lead,
  shell,
  shown = true,
  reply,
  onLeave,
  onEnd,
}: {
  lead?: string;
  shell?: string;
  shown?: boolean;
  reply?: MutableRefObject<((text: string) => string | null) | null>;
  onLeave?: () => void;
  onEnd?: (code: number, lastLine: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [shared, setShared] = useState(1);
  const [closed, setClosed] = useState(false);
  // the latest callbacks, so a new function from the page doesn't reconnect the terminal
  const ended = useRef(onEnd);
  ended.current = onEnd;
  const left = useRef(onLeave);
  left.current = onLeave;
  const isShown = useRef(shown);
  isShown.current = shown;
  const [output, setOutput] = useState(false);
  const [waking, setWaking] = useState(false);

  // The wait is counted from when the terminal is shown, not from when it connected.
  useEffect(() => {
    if (!shown || output || shell !== undefined) return;
    const timer = setTimeout(() => setWaking(true), WAKING_AFTER);
    return () => {
      clearTimeout(timer);
      setWaking(false);
    };
  }, [shown, output, shell]);

  useEffect(() => {
    // Menlo so Claude's box lines draw in one font. A session draws on the alternate screen and never
    // uses scrollback, so it keeps none (which also gives back the scrollbar's columns); the Shell tab keeps xterm's default.
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "Menlo, monospace",
      // Option stays a typing key (macOptionIsMeta is off by default), and Option+drag selects in xterm even while the session has the mouse.
      macOptionClickForcesSelection: true,
      ...(shell === undefined && { scrollback: 0 }),
      // OSC 8 hyperlinks come to openLink instead of xterm.js's default confirm() prompt.
      linkHandler: { activate: openLink },
    });
    term.registerLinkProvider({ provideLinks: (line, done) => done(plainLinks(term, line)) });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current!);
    fit.fit();

    const query = new URLSearchParams({
      ...(shell === undefined ? { lead: lead ?? "" } : { shell }),
      token: funtownToken(),
      cols: String(term.cols),
      rows: String(term.rows),
    });
    const socket = new WebSocket(`ws://${location.host}/term?${query}`);
    const send = (frame: object) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(frame));

    if (reply) reply.current = (text) => {
      if (socket.readyState !== WebSocket.OPEN) return "Not sent: the terminal isn't connected.";
      let clean = text;
      for (let before = ""; before !== clean; ) {
        before = clean;
        clean = clean.replaceAll("\x1b[200~", "").replaceAll("\x1b[201~", "");
      }
      const paste = JSON.stringify({ t: "in", d: "\x1b[200~" + clean + "\x1b[201~" });
      if (new TextEncoder().encode(paste).length > 1_048_576) return "Not sent: the reply is too long.";
      socket.send(paste);
      send({ t: "in", d: "\r" });
      return null;
    };

    socket.onmessage = (event) => {
      const frame = JSON.parse(String(event.data)) as { t: string; d?: string; n?: number };
      if (frame.t === "out") {
        term.write(frame.d ?? "");
        setOutput(true);
      }
      else if (frame.t === "shared") setShared(frame.n ?? 1);
    };
    let disposed = false;
    socket.onclose = (event) => {
      if (shell !== undefined) return setClosed(true);
      // the last line is read once the terminal has drawn everything the client sent
      term.write("", () => !disposed && ended.current?.(event.code, lastPrintedLine(term)));
    };
    // A resize while the socket was connecting was dropped, so send the size it has now.
    socket.onopen = () => send({ t: "resize", c: term.cols, r: term.rows });

    term.attachCustomKeyEventHandler((event) => {
      if (event.key === "Escape" && event.metaKey) {
        if (event.type === "keydown") left.current?.();
        return false;
      }
      if (event.key !== "Enter" || !event.shiftKey) return true;
      if (event.type === "keydown") send({ t: "in", d: "\x1b\r" });
      return false;
    });
    term.onData((d) => send({ t: "in", d }));
    term.onResize(({ cols, rows }) => send({ t: "resize", c: cols, r: rows }));
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(host.current!);
    // a hidden terminal takes no focus; the page gives it the keyboard when it is shown
    if (isShown.current) term.focus();

    return () => {
      disposed = true;
      if (reply) reply.current = null;
      observer.disconnect();
      socket.close();
      term.dispose();
    };
  }, [lead, shell, reply]);

  return (
    <>
      {shared >= 2 && (
        <p role="alert" className="error">
          This session is open in {shared} places; typing shows up in all of them.
        </p>
      )}
      {closed && <p className="activity">Terminal closed.</p>}
      {waking && <p role="status" className="waking">Waking the session...</p>}
      <div className="terminal" ref={host} aria-label={shell === undefined ? "Session terminal" : "Shell terminal"} />
    </>
  );
}
