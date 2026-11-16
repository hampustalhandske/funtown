import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { spawn, type IPty } from "node-pty";
import { WebSocketServer, type WebSocket } from "ws";
import { claudeEnv } from "./agents.ts";
import type { LogError } from "./errors.ts";

type Frame = { t?: unknown; d?: unknown; c?: unknown; r?: unknown } | null;

/** True for a whole number of columns or rows a terminal can have. */
export const isSize = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 1000;

/**
 * Live terminals over WebSocket. Each socket gets its own pty running `<claude> attach
 * <shortId>`; closing the socket kills the pty, and the pty exiting closes the socket. Frames
 * are JSON text of at most 1 MB: `{"t":"in","d"}` and `{"t":"resize","c","r"}` in,
 * `{"t":"out","d"}` out, and `{"t":"shared","n"}` to every socket on a session whenever the
 * number of sockets on it changes.
 */
export function createTerminals(claude: string, logError: LogError) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  const bySession = new Map<string, Set<WebSocket>>();
  const ptys = new Set<IPty>();

  const announce = (sockets: Set<WebSocket>) => {
    const frame = JSON.stringify({ t: "shared", n: sockets.size });
    for (const ws of sockets) ws.send(frame);
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
        let exited = false;
        pty.onData((d) => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: "out", d }));
        });
        pty.onExit(() => {
          exited = true;
          ptys.delete(pty);
          ws.close();
        });
        ws.on("error", (err) => {
          logError("term", err, shortId);
          ws.close();
        });
        ws.on("message", (data) => {
          if (exited) return;
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

        let sockets = bySession.get(sessionId);
        if (!sockets) bySession.set(sessionId, (sockets = new Set()));
        sockets.add(ws);
        announce(sockets);
        ws.on("close", () => {
          if (!exited) pty.kill();
          ptys.delete(pty);
          sockets.delete(ws);
          if (sockets.size === 0) bySession.delete(sessionId);
          else announce(sockets);
        });
      });
    },

    /** Closes every socket and kills every pty. */
    close() {
      for (const ws of wss.clients) ws.terminate();
      for (const pty of ptys) pty.kill();
      wss.close();
    },
  };
}
