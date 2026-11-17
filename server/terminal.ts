import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { spawn, type IPty } from "node-pty";
import { WebSocketServer, type WebSocket } from "ws";
import { claudeEnv } from "./agents.ts";
import type { LogError } from "./errors.ts";

type Frame = { t?: unknown; d?: unknown; c?: unknown; r?: unknown } | null;

/** How much of a shell's latest output a new socket on it gets first, in UTF-16 units. */
const REPLAY = 256 * 1024;

/** True for a whole number of columns or rows a terminal can have. */
export const isSize = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 1000;

/**
 * Live terminals over WebSocket. Each socket on a session gets its own pty running `<claude>
 * attach <shortId>`; closing the socket kills the pty, and the pty exiting closes the socket.
 * Each project folder has at most one shell, `<shell> -l` in a pty, which every socket on that
 * folder shares: it starts with the first socket, outlives its sockets, and closes them all when
 * it exits. Frames are JSON text of at most 1 MB: `{"t":"in","d"}` and `{"t":"resize","c","r"}`
 * in, `{"t":"out","d"}` out, and `{"t":"shared","n"}` to every socket on a session or shell
 * whenever the number of sockets on it changes.
 */
export function createTerminals(claude: string, shell: string | undefined, logError: LogError) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  const bySession = new Map<string, Set<WebSocket>>();
  // cwd -> its shell, while it runs
  const shells = new Map<string, { pty: IPty; out: string; sockets: Set<WebSocket> }>();
  // every pty still running
  const ptys = new Set<IPty>();

  const announce = (sockets: Set<WebSocket>) => {
    const frame = JSON.stringify({ t: "shared", n: sockets.size });
    for (const ws of sockets) ws.send(frame);
  };

  /** Adds `ws` to the `sockets` on `pty`: its frames reach the pty while it runs, and every socket hears the new count; `left` runs when it closes. */
  const join = (ws: WebSocket, sockets: Set<WebSocket>, pty: IPty, about: string, left: () => void) => {
    ws.on("error", (err) => {
      logError("term", err, about);
      ws.close();
    });
    ws.on("message", (data) => {
      if (!ptys.has(pty)) return;
      let f: Frame = null;
      try {
        f = JSON.parse(data.toString()) as Frame;
      } catch {
        // not JSON: refused below like any other unknown frame
      }
      if (f?.t === "in" && typeof f.d === "string") pty.write(f.d);
      else if (f?.t === "resize" && isSize(f.c) && isSize(f.r)) pty.resize(f.c, f.r);
      else ws.close(1007, "unknown frame");
    });
    sockets.add(ws);
    announce(sockets);
    ws.on("close", () => {
      sockets.delete(ws);
      if (sockets.size > 0) announce(sockets);
      left();
    });
  };

  /** Starts `<shell> -l` in `cwd` at `cols` x `rows` as that folder's shell. */
  const startShell = (cwd: string, cols: number, rows: number) => {
    if (!shell) throw new Error("no shell is set");
    const pty = spawn(shell, ["-l"], { name: "xterm-256color", cols, rows, cwd, env: claudeEnv() });
    const sh = { pty, out: "", sockets: new Set<WebSocket>() };
    shells.set(cwd, sh);
    ptys.add(pty);
    pty.onData((d) => {
      sh.out = (sh.out + d).slice(-REPLAY);
      const frame = JSON.stringify({ t: "out", d });
      for (const ws of sh.sockets) if (ws.readyState === ws.OPEN) ws.send(frame);
    });
    pty.onExit(() => {
      ptys.delete(pty);
      if (shells.get(cwd) === sh) shells.delete(cwd);
      for (const ws of sh.sockets) ws.close();
    });
    return sh;
  };

  return {
    /** Upgrades `req` to a socket on session `sessionId`, attached through `shortId` at `cols` x `rows`. */
    attach(req: IncomingMessage, socket: Duplex, head: Buffer, sessionId: string, shortId: string, cols: number, rows: number) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        let pty: IPty;
        try {
          pty = spawn(claude, ["attach", shortId], { name: "xterm-256color", cols, rows, env: claudeEnv() });
        } catch (err) {
          logError("term", err, shortId);
          ws.close(1011, "couldn't start claude attach");
          return;
        }
        ptys.add(pty);
        pty.onData((d) => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: "out", d }));
        });
        pty.onExit(() => {
          ptys.delete(pty);
          ws.close();
        });
        const sockets = bySession.get(sessionId) ?? new Set<WebSocket>();
        bySession.set(sessionId, sockets);
        join(ws, sockets, pty, shortId, () => {
          if (ptys.delete(pty)) pty.kill();
          if (sockets.size === 0) bySession.delete(sessionId);
        });
      });
    },

    /**
     * Upgrades `req` to a socket on the shell in `cwd`, starting it at `cols` x `rows` when none
     * runs there and else resizing it; the socket first gets the shell's latest output.
     */
    shell(req: IncomingMessage, socket: Duplex, head: Buffer, cwd: string, cols: number, rows: number) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        let sh = shells.get(cwd);
        if (sh) {
          sh.pty.resize(cols, rows);
        } else {
          try {
            sh = startShell(cwd, cols, rows);
          } catch (err) {
            logError("shell", err, cwd);
            ws.close(1011, "couldn't start the shell");
            return;
          }
        }
        if (sh.out) ws.send(JSON.stringify({ t: "out", d: sh.out }));
        join(ws, sh.sockets, sh.pty, cwd, () => {});
      });
    },

    /** Ends the shell in `cwd`; false when none runs there. */
    closeShell(cwd: string): boolean {
      const sh = shells.get(cwd);
      if (!sh) return false;
      shells.delete(cwd);
      sh.pty.kill();
      return true;
    },

    /** Closes every socket and kills every pty. */
    close() {
      for (const ws of wss.clients) ws.terminate();
      for (const pty of ptys) pty.kill();
      wss.close();
    },
  };
}
