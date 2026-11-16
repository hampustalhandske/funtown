import { createServer, STATUS_CODES, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { TownState, type HookEvent } from "./town.ts";
import type { Town } from "./types.ts";
import { checkVersion, execFileAsync, listAgents, startBackground } from "./agents.ts";
import { createTerminals, isSize } from "./terminal.ts";
import { createHolds } from "./holds.ts";
import { serverLogger } from "./errors.ts";
import { morning, openJournal } from "./journal.ts";

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

const defaultRun = async (file: string, args: string[]) => {
  // Long enough for the user to answer macOS's one-time "control Terminal?" prompt.
  await execFileAsync(file, args, { timeout: 60_000 });
};

const MAX_PAGE_BODY = 64 * 1024;
const MAX_REASON = 1_000;

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
 * Reads a JSON request body, decoding it only once it is whole; gives the parsed value, or
 * 413 when it is over `max` bytes and 400 when it can't be read or parsed.
 */
async function readJson(req: IncomingMessage, max = Infinity): Promise<{ value: unknown } | { status: 400 | 413 }> {
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of req as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size <= max) chunks.push(chunk);
    }
    if (size > max) return { status: 413 };
    return { value: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { status: 400 };
  }
}

/**
 * Starts the Funtown server on 127.0.0.1; port 0 picks a free port. The Town holds the sessions
 * `claude agents --json` lists, asked every `pollMs` (default 2 s) of the executable `claude`
 * (default "claude"), plus what hook events on `/events` add to them; `/stream` pushes it as
 * Server-Sent Events. `claude --version` is checked once before listening. Everything else is
 * served from `distDir` (default web/dist/); HTML gets the page's token and a CSP. `POST /jump`
 * runs `run` (default: execFile, 60 s timeout) to bring a lead's terminal to the front, `POST
 * /sessions` starts `claude --bg` in a house's folder, and the `/term` WebSocket attaches a
 * background lead; all three need the page's own Origin and token. `/events` refuses any
 * request with an `Origin` header, so web pages cannot post to it. `POST /hold` (no Origin
 * either) holds a permission, question or plan as a card until `POST /answer` (page Origin
 * and token) answers it or it is released; `answerLog` (a JSONL path) gets one line per
 * closed card. `journal` (a JSONL path) gets a line per kept letter and per character that
 * becomes stuck, and feeds `GET /morning?since=<ms>` (page token). `unlistedMs` (default 10 s)
 * is how long hook data and holds wait for their session to be listed, and holds for a page to
 * be open. `errorLog` (a path) gets one line per server error, besides stderr. `POST /switch` (page
 * Origin and token) appends `{ at, reason?, open? }` to `switchLog` (a JSONL path); without one it
 * answers 500.
 */
export async function startServer(opts: {
  port: number;
  distDir?: string;
  run?: (file: string, args: string[]) => Promise<void>;
  claude?: string;
  pollMs?: number;
  answerLog?: string;
  journal?: string;
  unlistedMs?: number;
  errorLog?: string;
  switchLog?: string;
}): Promise<{ url: string; claude: Town["claude"]; close(): Promise<void> }> {
  const run = opts.run ?? defaultRun;
  const claude = opts.claude ?? "claude";
  const pollMs = opts.pollMs ?? 2_000;
  const dist = normalize(join(opts.distDir ?? DEFAULT_DIST, "/"));
  const version = await checkVersion(claude);
  const unlistedMs = opts.unlistedMs ?? 10_000;
  const logError = serverLogger(opts.errorLog);
  const journal = opts.journal ? openJournal(opts.journal, logError) : undefined;
  const town = new TownState(version, unlistedMs, logError, journal);
  const holds = createHolds(town, { unlistedMs, answerLog: opts.answerLog, logError, changed: () => broadcast() });
  const terminals = createTerminals(claude, logError);
  const clients = new Set<ServerResponse>();
  const tokenBytes = Buffer.from(randomBytes(16).toString("hex"));
  const token = tokenBytes.toString();
  let port = 0;

  const stateFrame = () => `event: state\ndata: ${JSON.stringify(town.snapshot(holds.cards()))}\n\n`;
  let lastFrame = "";
  const broadcast = () => {
    const frame = stateFrame();
    if (frame === lastFrame) return;
    lastFrame = frame;
    for (const res of clients) res.write(frame);
  };

  let closed = false;
  let pollTimer: NodeJS.Timeout | undefined;
  let lastReason = "";
  const poll = async () => {
    let list: Awaited<ReturnType<typeof listAgents>> | undefined;
    const askedAt = Date.now();
    try {
      list = await listAgents(claude);
    } catch (err) {
      const reason = (err as Error).message.replace(/\s*\n\s*/g, " ").trim();
      if (reason !== lastReason) {
        logError("poll", `claude agents --json failed, keeping the last list: ${reason}`);
        lastReason = reason;
      }
    }
    if (closed) return;
    try {
      if (list) {
        lastReason = "";
        town.sync(list, askedAt);
        holds.refresh();
      } else {
        town.expire();
      }
      broadcast();
    } catch (err) {
      logError("poll", err);
    } finally {
      // The next poll is always scheduled, so one bad list never stops the updates.
      pollTimer = setTimeout(() => void poll(), pollMs);
    }
  };

  const hostOk = (host: string | undefined) => host === `127.0.0.1:${port}` || host === `localhost:${port}`;
  /** True when `given` is the page's token. */
  const tokenOk = (given: unknown) => {
    const bytes = typeof given === "string" ? Buffer.from(given) : null;
    return bytes !== null && bytes.length === tokenBytes.length && timingSafeEqual(bytes, tokenBytes);
  };
  /** True for a request from the served page: its own Origin and the page's token. */
  const fromPage = (origin: string | undefined, given: unknown) =>
    (origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`) && tokenOk(given);
  /** The JSON object body of a POST from the page, or null once it has answered 403, 400 or 413. */
  const pageBody = async (req: IncomingMessage, res: ServerResponse): Promise<Record<string, unknown> | null> => {
    if (!fromPage(req.headers.origin, req.headers["x-funtown-token"])) {
      req.resume();
      res.writeHead(403).end();
      return null;
    }
    const body = await readJson(req, MAX_PAGE_BODY);
    if ("status" in body || typeof body.value !== "object" || body.value === null) {
      res.writeHead("status" in body ? body.status : 400).end();
      return null;
    }
    return body.value as Record<string, unknown>;
  };
  /** The string `field` of a POST body from the page, or null once it has answered 403, 400 or 413. */
  const pageField = async (req: IncomingMessage, res: ServerResponse, field: string): Promise<string | null> => {
    const body = await pageBody(req, res);
    if (body === null) return null;
    const value = body[field];
    if (typeof value !== "string") {
      res.writeHead(400).end();
      return null;
    }
    return value;
  };
  const csp = () =>
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    `connect-src 'self' ws://127.0.0.1:${port} ws://localhost:${port}; ` +
    "object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
  const text = { "content-type": "text/plain; charset=utf-8" };

  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;

    if (!hostOk(req.headers.host)) {
      req.resume();
      res.writeHead(403).end();
      return;
    }

    if (req.method === "POST" && (path === "/events" || path === "/hold")) {
      if (req.headers.origin !== undefined) {
        req.resume();
        res.writeHead(403).end();
        return;
      }
      const body = await readJson(req);
      if ("status" in body) {
        res.writeHead(body.status).end();
        return;
      }
      const event = body.value as HookEvent;
      if (path === "/hold") {
        holds.hold(event, res);
        return;
      }
      try {
        if (town.apply(event)) holds.event(event);
        broadcast();
        res.writeHead(204).end();
      } catch (err) {
        logError(`event ${String(event?.hook_event_name)}`, err);
        res.writeHead(500).end();
      }
      return;
    }

    if (req.method === "POST" && path === "/jump") {
      const leadId = await pageField(req, res, "lead");
      if (leadId === null) return;
      const lead = town.lead(leadId);
      if (!lead) {
        res.writeHead(404).end();
        return;
      }
      const command = jumpCommand(lead.termProgram, lead.tty);
      if (!command) {
        res.writeHead(409, text).end("Funtown doesn't know how to open this session's terminal.");
        return;
      }
      try {
        await run(...command);
        res.writeHead(204).end();
      } catch (err) {
        logError("jump", err);
        res.writeHead(500, text).end("Couldn't open the terminal.");
      }
      return;
    }

    if (req.method === "POST" && path === "/answer") {
      const body = await pageBody(req, res);
      if (body === null) return;
      res.writeHead(await holds.answer(body)).end();
      return;
    }

    if (req.method === "POST" && path === "/sessions") {
      const cwd = await pageField(req, res, "cwd");
      if (cwd === null) return;
      if (!town.snapshot().houses.some((h) => h.cwd === cwd)) {
        res.writeHead(404).end();
        return;
      }
      try {
        const id = await startBackground(claude, cwd);
        res.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ id }));
      } catch (err) {
        logError("start session", err);
        res.writeHead(500, text).end(`Couldn't start a session: ${(err as Error).message}`);
      }
      return;
    }

    if (req.method === "POST" && path === "/switch") {
      const body = await pageBody(req, res);
      if (body === null) return;
      const { reason, open } = body;
      if (Array.isArray(body)) {
        res.writeHead(400).end();
        return;
      }
      const isOpen = (o: unknown): o is { id: string; name: string; cwd: string } =>
        typeof o === "object" && o !== null && ["id", "name", "cwd"].every((k) => typeof (o as Record<string, unknown>)[k] === "string");
      if ((reason !== undefined && (typeof reason !== "string" || reason.length > MAX_REASON)) || (open !== undefined && !isOpen(open))) {
        res.writeHead(400).end();
        return;
      }
      try {
        if (!opts.switchLog) throw new Error("no switch log is set");
        const line = { at: Date.now(), ...(reason ? { reason } : {}), ...(open ? { open: { id: open.id, name: open.name, cwd: open.cwd } } : {}) };
        mkdirSync(dirname(opts.switchLog), { recursive: true });
        appendFileSync(opts.switchLog, `${JSON.stringify(line)}\n`);
        res.writeHead(204).end();
      } catch (err) {
        logError("switch", err);
        res.writeHead(500).end();
      }
      return;
    }

    if (req.method === "GET" && path === "/letters") {
      if (!tokenOk(req.headers["x-funtown-token"])) {
        res.writeHead(403).end();
        return;
      }
      const letters = town.letters(new URL(req.url ?? "/", "http://127.0.0.1").searchParams.get("lead") ?? "");
      if (!letters) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(letters));
      return;
    }

    if (req.method === "GET" && path === "/morning") {
      if (!tokenOk(req.headers["x-funtown-token"])) {
        res.writeHead(403).end();
        return;
      }
      const raw = new URL(req.url ?? "/", "http://127.0.0.1").searchParams.get("since");
      const since = raw === null || raw.trim() === "" ? NaN : Number(raw);
      if (!Number.isFinite(since)) {
        res.writeHead(400).end();
        return;
      }
      let entries;
      try {
        entries = journal?.read() ?? [];
      } catch (err) {
        logError("journal", err);
        res.writeHead(500).end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(morning(entries, since)));
      return;
    }

    if (req.method === "GET" && path === "/stream") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      clients.add(res);
      holds.pages(clients.size);
      res.on("close", () => {
        clients.delete(res);
        holds.pages(clients.size);
      });
      res.write(stateFrame());
      return;
    }

    if (req.method === "GET") {
      const file = normalize(join(dist, path === "/" ? "index.html" : path));
      if (file.startsWith(dist)) {
        try {
          const data = await readFile(file);
          const type = TYPES[extname(file)] ?? "application/octet-stream";
          if (extname(file) !== ".html") {
            res.writeHead(200, { "content-type": type }).end(data);
            return;
          }
          const html = data.toString("utf8");
          const head = /<head[^>]*>/i.exec(html);
          if (!head) throw new Error(`${file} has no <head> to put the page's token in`);
          const at = head.index + head[0].length;
          res.writeHead(200, { "content-type": type, "content-security-policy": csp() });
          res.end(`${html.slice(0, at)}<meta name="funtown-token" content="${token}">${html.slice(at)}`);
          return;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
            logError("serve page", err);
            res.writeHead(500).end();
            return;
          }
        }
      }
      if (path === "/") {
        res.writeHead(503, text);
        res.end("Funtown's page isn't built yet. Run: npm run build");
        return;
      }
    }
    res.writeHead(404).end();
  });

  server.on("upgrade", (req, socket, head) => {
    const onError = (err: Error) => logError("term", err);
    socket.on("error", onError);
    const refuse = (status: number) =>
      void socket.end(`HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (!hostOk(req.headers.host)) return refuse(403);
    if (url.pathname !== "/term") return refuse(404);
    if (!fromPage(req.headers.origin, url.searchParams.get("token"))) return refuse(403);
    const lead = town.lead(url.searchParams.get("lead") ?? "");
    if (!lead) return refuse(404);
    if (lead.kind !== "background" || !lead.shortId) return refuse(409);
    const cols = Number(url.searchParams.get("cols"));
    const rows = Number(url.searchParams.get("rows"));
    if (!isSize(cols) || !isSize(rows)) return refuse(400);
    socket.removeListener("error", onError);
    terminals.attach(req, socket, head, lead.id, lead.shortId, cols, rows);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, "127.0.0.1", resolve);
  });
  port = (server.address() as AddressInfo).port;
  void poll();

  return {
    url: `http://127.0.0.1:${port}`,
    claude: version,
    close: () =>
      new Promise<void>((resolve) => {
        closed = true;
        clearTimeout(pollTimer);
        terminals.close();
        holds.close();
        for (const res of clients) res.end();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
