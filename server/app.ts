import { createServer, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { TownState, type HookEvent } from "./town.ts";

const DEFAULT_DIST = fileURLToPath(new URL("../web/dist/", import.meta.url));
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

/**
 * Starts the Funtown server on 127.0.0.1. `/events` takes hook events, `/stream` pushes the
 * Town as Server-Sent Events, and everything else is served from web/dist/. Leads that ended
 * are removed after `goneAfterMs` (default 10 min) unless another event arrives first. Port 0
 * picks a free port. `distDir` is the built page (default web/dist/). `/events` rejects any
 * request with an `Origin` header, so web pages cannot post to it.
 */
export async function startServer(opts: {
  port: number;
  goneAfterMs?: number;
  distDir?: string;
}): Promise<{ url: string; close(): Promise<void> }> {
  const goneAfterMs = opts.goneAfterMs ?? 600_000;
  const dist = normalize(join(opts.distDir ?? DEFAULT_DIST, "/"));
  const town = new TownState();
  const clients = new Set<ServerResponse>();
  const timers = new Map<string, NodeJS.Timeout>();
  let port = 0;

  const stateFrame = () => `event: state\ndata: ${JSON.stringify(town.snapshot())}\n\n`;
  const broadcast = () => {
    const frame = stateFrame();
    for (const res of clients) res.write(frame);
  };

  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;

    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) {
      req.resume();
      res.writeHead(403).end();
      return;
    }

    if (req.method === "POST" && path === "/events") {
      if (req.headers.origin !== undefined) {
        req.resume();
        res.writeHead(403).end();
        return;
      }
      let body = "";
      try {
        for await (const chunk of req) body += chunk;
      } catch {
        res.writeHead(400).end();
        return;
      }
      let event: HookEvent;
      try {
        event = JSON.parse(body) as HookEvent;
      } catch {
        res.writeHead(400).end();
        return;
      }
      try {
        const gone = town.apply(event);
        const sid = event.session_id;
        if (sid && event.hook_event_name) {
          clearTimeout(timers.get(sid));
          timers.delete(sid);
        }
        if (gone) {
          timers.set(
            gone,
            setTimeout(() => {
              timers.delete(gone);
              town.remove(gone);
              broadcast();
            }, goneAfterMs),
          );
        }
        broadcast();
        res.writeHead(204).end();
      } catch (err) {
        console.error(`funtown: failed to handle ${String(event?.hook_event_name)} event`, err);
        res.writeHead(500).end();
      }
      return;
    }

    if (req.method === "GET" && path === "/stream") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      clients.add(res);
      res.on("close", () => clients.delete(res));
      res.write(stateFrame());
      return;
    }

    if (req.method === "GET") {
      const file = normalize(join(dist, path === "/" ? "index.html" : path));
      if (file.startsWith(dist)) {
        try {
          const data = await readFile(file);
          res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
          res.end(data);
          return;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
            console.error(`funtown: failed to read ${file}`, err);
            res.writeHead(500).end();
            return;
          }
        }
      }
      if (path === "/") {
        res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
        res.end("Funtown's page isn't built yet. Run: npm run build");
        return;
      }
    }
    res.writeHead(404).end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, "127.0.0.1", resolve);
  });
  port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        for (const timer of timers.values()) clearTimeout(timer);
        for (const res of clients) res.end();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
