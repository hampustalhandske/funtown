import { createServer, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { TownState, type HookEvent } from "./town.ts";
import { rebuild } from "./rebuild.ts";

const DEFAULT_DIST = fileURLToPath(new URL("../web/dist/", import.meta.url));
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

const OPEN_APPS: Record<string, string> = {
  "iTerm.app": "iTerm",
  vscode: "Visual Studio Code",
  WarpTerminal: "Warp",
  ghostty: "Ghostty",
};

// Reads the tty from argv so it is never part of the script text. Restores a minimized
// window; skips windows that have no tabs to read. When no tab matches, it still brings
// Terminal to the front.
const TERMINAL_TAB_SCRIPT = `on run argv
  set target to "/dev/" & item 1 of argv
  tell application "Terminal"
    repeat with w in windows
      try
        repeat with t in tabs of w
          if tty of t is target then
            set miniaturized of w to false
            set selected of t to true
            set index of w to 1
            activate
            return
          end if
        end repeat
      end try
    end repeat
    activate
  end tell
end run`;

// Long enough for the user to answer macOS's one-time "control Terminal?" prompt.
const execFileAsync = promisify(execFile);
const defaultRun = async (file: string, args: string[]) => {
  await execFileAsync(file, args, { timeout: 60_000 });
};

const defaultExec = async (file: string, args: string[]) =>
  (await execFileAsync(file, args, { timeout: 5_000 })).stdout;

const MAX_JUMP_BODY = 64 * 1024;

/** The command that brings a lead's terminal to the front, or null for an unknown terminal. */
function jumpCommand(termProgram: string | null, tty: string | null): [string, string[]] | null {
  if (termProgram === "Apple_Terminal") {
    return tty && /^ttys\d+$/.test(tty)
      ? ["osascript", ["-e", TERMINAL_TAB_SCRIPT, tty]]
      : ["open", ["-a", "Terminal"]];
  }
  const app = termProgram ? OPEN_APPS[termProgram] : undefined;
  return app ? ["open", ["-a", app]] : null;
}

/**
 * Starts the Funtown server on 127.0.0.1. `/events` takes hook events, `/stream` pushes the
 * Town as Server-Sent Events, and everything else is served from web/dist/. Leads that ended
 * are removed after `goneAfterMs` (default 10 min) unless another event arrives first. Port 0
 * picks a free port. `distDir` is the built page (default web/dist/). `/events` rejects any
 * request with an `Origin` header, so web pages cannot post to it. `POST /jump` takes
 * `{ lead }` from the page's own origin only and runs `run` (default: execFile, 60 s timeout) to
 * bring that lead's terminal to the front. With `claudeDir`, sessions already running there
 * are rebuilt into the Town before listening, reading their tty with `exec` (default:
 * execFile, 5 s timeout; returns stdout).
 */
export async function startServer(opts: {
  port: number;
  goneAfterMs?: number;
  distDir?: string;
  run?: (file: string, args: string[]) => Promise<void>;
  claudeDir?: string;
  exec?: (file: string, args: string[]) => Promise<string>;
}): Promise<{ url: string; close(): Promise<void> }> {
  const run = opts.run ?? defaultRun;
  const goneAfterMs = opts.goneAfterMs ?? 600_000;
  const dist = normalize(join(opts.distDir ?? DEFAULT_DIST, "/"));
  const town = new TownState();
  if (opts.claudeDir) await rebuild(town, opts.claudeDir, opts.exec ?? defaultExec);
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

    if (req.method === "POST" && path === "/jump") {
      const origin = req.headers.origin;
      if (origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) {
        req.resume();
        res.writeHead(403).end();
        return;
      }
      let leadId: unknown;
      let size = 0;
      let body = "";
      try {
        for await (const chunk of req) {
          size += (chunk as Buffer).length;
          if (size > MAX_JUMP_BODY) {
            req.resume();
            res.writeHead(413).end();
            return;
          }
          body += chunk;
        }
        leadId = (JSON.parse(body) as { lead?: unknown } | null)?.lead;
      } catch {
        // an unreadable or malformed body leaves leadId unset and gets the 400 below
      }
      if (typeof leadId !== "string") {
        res.writeHead(400).end();
        return;
      }
      const lead = town.lead(leadId);
      if (!lead) {
        res.writeHead(404).end();
        return;
      }
      const command = jumpCommand(lead.termProgram, lead.tty);
      const text = { "content-type": "text/plain; charset=utf-8" };
      if (!command) {
        res.writeHead(409, text).end("Funtown doesn't know how to open this session's terminal.");
        return;
      }
      try {
        await run(...command);
        res.writeHead(204).end();
      } catch (err) {
        console.error(`funtown: failed to jump to ${command[0]}`, err);
        res.writeHead(500, text).end("Couldn't open the terminal.");
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
