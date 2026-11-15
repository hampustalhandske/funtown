import { createServer, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { TownState, type HookEvent } from "./town.ts";

const DIST = fileURLToPath(new URL("../web/dist/", import.meta.url));
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
 * are removed after `goneAfterMs` (default 10 min). Port 0 picks a free port.
 */
export async function startServer(opts: {
  port: number;
  goneAfterMs?: number;
}): Promise<{ url: string; close(): Promise<void> }> {
  const goneAfterMs = opts.goneAfterMs ?? 600_000;
  const town = new TownState();
  const clients = new Set<ServerResponse>();
  const timers = new Set<NodeJS.Timeout>();

  const broadcast = () => {
    const frame = `event: state\ndata: ${JSON.stringify(town.snapshot())}\n\n`;
    for (const res of clients) res.write(frame);
  };

  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;

    if (req.method === "POST" && path === "/events") {
      let body = "";
      for await (const chunk of req) body += chunk;
      try {
        const gone = town.apply(JSON.parse(body) as HookEvent);
        if (gone) {
          const timer = setTimeout(() => {
            timers.delete(timer);
            town.remove(gone);
            broadcast();
          }, goneAfterMs);
          timers.add(timer);
        }
        broadcast();
        res.writeHead(204).end();
      } catch {
        res.writeHead(400).end();
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
      res.write(`event: state\ndata: ${JSON.stringify(town.snapshot())}\n\n`);
      return;
    }

    if (req.method === "GET") {
      const file = normalize(join(DIST, path === "/" ? "index.html" : path));
      if (file.startsWith(DIST)) {
        try {
          const data = await readFile(file);
          res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
          res.end(data);
          return;
        } catch {
          // fall through to 404
        }
      }
    }
    res.writeHead(404).end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        for (const timer of timers) clearTimeout(timer);
        for (const res of clients) res.end();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
