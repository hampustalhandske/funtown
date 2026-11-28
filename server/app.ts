import { createServer, STATUS_CODES, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { TownState, type HookEvent } from "./town.ts";
import type { Letter, Town } from "./types.ts";
import { checkVersion, execFileAsync, listAgents, startBackground, stopBackground, type Listed } from "./agents.ts";
import { createTerminals, isSize } from "./terminal.ts";
import { createHolds } from "./holds.ts";
import { describe, serverLogger } from "./errors.ts";
import { morning, openJournal } from "./journal.ts";
import { createSteward } from "./steward.ts";
import { listPrs, parsePhase, type PhaseFile, type Pr } from "./workflow.ts";
import { AVATAR_ID, readAvatar, writeAvatar } from "./avatar.ts";
import { houseOf, projectFolder, readProjects, writeProjects } from "./projects.ts";

const DEFAULT_DIST = fileURLToPath(new URL("../web/dist/", import.meta.url));
const DEFAULT_STEWARD_PROMPT = fileURLToPath(new URL("./steward.md", import.meta.url));
const DEFAULT_CARD_PROMPT = fileURLToPath(new URL("./steward-card.md", import.meta.url));
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
const MAX_PROMPT = 16 * 1024;

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
 * /sessions` starts `claude --bg` in a house's folder, `POST /sessions/stop` runs `claude stop` on
 * a background lead, and the `/term` WebSocket attaches a background lead; each needs the page's
 * own Origin and token. `/events` refuses any request with an `Origin` header, so web pages
 * cannot post to it. `POST /hold` (no Origin either) holds a permission, question or plan as a
 * card until `POST /answer` (page Origin and token) answers it or it is released; `answerLog` (a
 * JSONL path) gets one line per ask of a listed lead (see `createHolds`). `journal` (a JSONL path) gets a line per kept letter and per character that
 * becomes stuck, and feeds `GET /morning?since=<ms>` (page token). `unlistedMs` (default 10 s)
 * is how long hook data and holds wait for their session to be listed, and holds for a page to
 * be open. `errorLog` (a path) gets one line per server error, besides stderr. `POST /switch` (page
 * Origin and token) appends `{ at, reason?, open? }` to `switchLog` (a JSONL path); without one it
 * answers 500. Each poll reads every house's `.claude/phase.json`; every `prMs` (default 60 s)
 * `gh` (default "gh") lists each house's open PRs. With a `stewardDir`, a steward session there
 * pre-reviews each ready PR asked for with `POST /review { cwd, number }` (page Origin and
 * token; 409 for a draft or with reviews off) using the text of `stewardPrompt` (a path, default
 * server/steward.md; an empty file turns reviews off); an attach that isn't ready within
 * `stewardReadyMs` (default 15 s) is given up, and a request with no answer after
 * `stewardAnswerMs` (default 30 min) no longer holds back the next. The same steward gives her
 * word on a card asked for with `POST /word { card }` (page Origin and token; 404 for an unknown
 * or closed card, 409 for her own card or with words off) using `stewardCardPrompt` (a path,
 * default server/steward-card.md; an empty file turns words off); she is started when either
 * prompt is on. `GET /letters?lead=&id=` (page token) serves one of her letters from the journal. `projects` (a path) holds the folders added with `POST /projects`,
 * each a house even with no session; without one, adding answers 500. `POST /runs` starts
 * `claude --bg <prompt>` in a house's folder. `/term?shell=<cwd>` connects to that house's one
 * login shell, `shell` (an executable) started there on first connect; `POST /shells/close`
 * or removing the project ends it. `avatar` (a path) holds the id chosen with `POST /avatar { id }`
 * (page Origin and token; 400 for an id not matching /^[a-z0-9-]{1,32}$/, 500 without a path or
 * when the file can't be written), which the State carries as `avatar`.
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
  gh?: string;
  prMs?: number;
  stewardPrompt?: string;
  stewardCardPrompt?: string;
  stewardDir?: string;
  stewardReadyMs?: number;
  stewardAnswerMs?: number;
  projects?: string;
  avatar?: string;
  shell?: string;
}): Promise<{ url: string; claude: Town["claude"]; close(): Promise<void> }> {
  const run = opts.run ?? defaultRun;
  const claude = opts.claude ?? "claude";
  const pollMs = opts.pollMs ?? 2_000;
  const dist = normalize(join(opts.distDir ?? DEFAULT_DIST, "/"));
  const version = await checkVersion(claude);
  const unlistedMs = opts.unlistedMs ?? 10_000;
  const logError = serverLogger(opts.errorLog);
  const journal = opts.journal ? openJournal(opts.journal, logError) : undefined;
  const town = new TownState(version, unlistedMs, journal);
  const holds = createHolds(town, {
    unlistedMs,
    answerLog: opts.answerLog,
    asked: (card) => {
      const state = steward?.word(card)?.state;
      return state !== undefined && state !== "idle";
    },
    logError,
    changed: () => broadcast(),
  });
  const terminals = createTerminals(claude, opts.shell, logError, () => {
    if (closed) return;
    town.setShells(terminals.shells());
    broadcast();
  }, (lead) => holds.typed(lead));
  let projects: string[] = [];
  try {
    if (opts.projects) projects = readProjects(opts.projects);
  } catch (err) {
    logError("projects", err, opts.projects);
  }
  town.setProjects(projects);
  let avatar: string | undefined;
  try {
    if (opts.avatar) avatar = readAvatar(opts.avatar);
  } catch (err) {
    logError("avatar", err, opts.avatar);
  }
  const gh = opts.gh ?? "gh";
  const prMs = opts.prMs ?? 60_000;
  // cwd -> its open PRs, from the last gh list that worked
  const prLists = new Map<string, Pr[]>();
  // cwd -> when its last gh list started
  const prAsked = new Map<string, number>();
  // cwd -> its gh list still running
  const prRunning = new Map<string, Promise<void>>();
  const prAbort = new AbortController();
  const prFailing = new Set<string>();
  // cwd -> what its last unreadable phase file held (or the read error), logged once until it changes
  const phaseFailed = new Map<string, string>();
  /** The text of the prompt file at `path`, or undefined when it is empty (its requests are off) or there is no steward folder. */
  const stewardText = (path: string) => {
    const read = opts.stewardDir ? readFileSync(path, "utf8") : "";
    return read.trim() === "" ? undefined : read;
  };
  const prompt = stewardText(opts.stewardPrompt ?? DEFAULT_STEWARD_PROMPT);
  const cardPrompt = stewardText(opts.stewardCardPrompt ?? DEFAULT_CARD_PROMPT);
  const steward =
    opts.stewardDir && (prompt || cardPrompt)
      ? createSteward({
          claude,
          dir: opts.stewardDir,
          prompt,
          cardPrompt,
          town,
          lists: prLists,
          cards: () => holds.cards(),
          journal,
          logError,
          retryMs: prMs,
          readyMs: opts.stewardReadyMs ?? 15_000,
          answerMs: opts.stewardAnswerMs ?? 30 * 60_000,
          changed: () => broadcast(),
        })
      : undefined;
  const clients = new Set<ServerResponse>();
  const tokenBytes = Buffer.from(randomBytes(16).toString("hex"));
  const token = tokenBytes.toString();
  let port = 0;

  const snapshot = () => {
    const state = town.snapshot(holds.cards().map((card) => {
      const word = steward?.word(card);
      return word ? { ...card, word } : card;
    }));
    const stewardId = steward?.lead()?.id;
    if (avatar !== undefined) state.avatar = avatar;
    for (const house of state.houses) {
      for (const lead of house.leads) if (lead.id === stewardId) lead.steward = true;
      const prs = prLists.get(house.cwd);
      if (prs) house.parcels = prs.map((pr) => ({ number: pr.number, title: pr.title, url: pr.url, draft: pr.draft, checks: pr.checks, ...(pr.redAt === undefined ? {} : { redAt: pr.redAt }), review: steward?.review(pr) }));
    }
    return state;
  };
  const stateFrame = () => `event: state\ndata: ${JSON.stringify(snapshot())}\n\n`;
  let lastFrame = "";
  const broadcast = () => {
    const frame = stateFrame();
    if (frame === lastFrame) return;
    lastFrame = frame;
    for (const res of clients) res.write(frame);
  };

  let closed = false;

  /** The phase file of the project in `cwd`; undefined when there is none or it can't be used, which is logged once until it changes. */
  const readPhase = (cwd: string): PhaseFile | undefined => {
    let text: string | undefined;
    try {
      text = readFileSync(join(cwd, ".claude", "phase.json"), "utf8");
      const phase = parsePhase(text);
      phaseFailed.delete(cwd);
      return phase;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        phaseFailed.delete(cwd);
        return undefined;
      }
      const seen = text ?? describe(err);
      if (phaseFailed.get(cwd) !== seen) logError("phase", err, cwd);
      phaseFailed.set(cwd, seen);
      return undefined;
    }
  };

  /** Starts `gh pr list` for each of `cwds` whose last list is `prMs` old or that has none; forgets the PRs of other folders. */
  const pollPrs = (cwds: string[]) => {
    for (const map of [prLists, prAsked, prFailing]) for (const cwd of map.keys()) if (!cwds.includes(cwd)) map.delete(cwd);
    for (const cwd of cwds) {
      if (prRunning.has(cwd) || Date.now() - (prAsked.get(cwd) ?? -Infinity) < prMs) continue;
      prAsked.set(cwd, Date.now());
      const run = listPrs(gh, cwd, prAbort.signal)
        .then(
          (prs) => {
            if (closed || !prAsked.has(cwd)) return;
            prLists.set(cwd, prs);
            prFailing.delete(cwd);
            steward?.pump();
            broadcast();
          },
          (err) => {
            if (!closed && !prFailing.has(cwd)) logError("prs", (err as Error).message, cwd);
            prFailing.add(cwd);
          },
        )
        .catch((err) => logError("steward", err))
        .finally(() => prRunning.delete(cwd));
      prRunning.set(cwd, run);
    }
  };

  let pollTimer: NodeJS.Timeout | undefined;
  // the poll running now, which close() waits for so no `claude` child outlives the server
  let polling: Promise<void> = Promise.resolve();
  let lastReason = "";
  let applyReason = "";
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
        town.sync(list.filter(seen), askedAt);
        holds.refresh();
      } else {
        town.expire();
      }
      const listed = town.cwds();
      const cwds = houseCwds();
      const phases = new Map<string, PhaseFile>();
      for (const cwd of cwds) {
        const phase = readPhase(cwd);
        if (phase) phases.set(cwd, phase);
      }
      town.setPhases(phases);
      const stewardId = steward?.lead()?.id;
      const stewardCwd = stewardId === undefined ? undefined : listed.get(stewardId);
      pollPrs(cwds.filter((cwd) => cwd !== stewardCwd));
      steward?.pump();
      broadcast();
      applyReason = "";
    } catch (err) {
      if (describe(err) !== applyReason) logError("poll", err);
      applyReason = describe(err);
    } finally {
      // The next poll is always scheduled, so one bad list never stops the updates.
      pollTimer = setTimeout(() => (polling = poll()), pollMs);
    }
  };

  /**
   * True when Funtown shows the listed session `s`: with a projects file, only a session in an
   * added project or a folder inside one (such as a run's worktree), and the steward; without
   * one, every session.
   */
  const seen = (s: Listed) => (s.id !== undefined && s.id === steward?.shortId()) || inProject(s.cwd);
  /** True when `cwd` is an added project or a folder inside one, or when there is no projects file. */
  const inProject = (cwd: string) => !opts.projects || projects.some((p) => cwd === p || cwd.startsWith(`${p}/`));

  /** The folders where a session, a run or a shell may start: the added projects, the listed sessions' own cwds and the folders where a shell runs. */
  const startCwds = () => [...new Set([...projects, ...town.cwds().values(), ...terminals.shells()])];
  /** The folder of every house, which is where its phase file and PR list are read: each start folder's house, once. */
  const houseCwds = () => [...new Set(startCwds().map((cwd) => houseOf(cwd, projects)))];
  /**
   * The added projects as the projects file holds them now, or null once it has answered 500
   * because the file can't be read or there is none.
   */
  const currentProjects = (res: ServerResponse): string[] | null => {
    if (!opts.projects) {
      res.writeHead(500, text).end("Funtown has no projects file set.");
      return null;
    }
    try {
      return readProjects(opts.projects);
    } catch (err) {
      res.writeHead(500, text).end(`Funtown can't read ${opts.projects}: ${(err as Error).message}. Fix or delete it, then try again.`);
      return null;
    }
  };
  /** Makes `list` the added projects, in the projects file and on the Town. */
  const saveProjects = (list: string[]) => {
    if (!opts.projects) throw new Error("no projects file is set");
    writeProjects(opts.projects, list);
    projects = list;
    town.setProjects(list);
    broadcast();
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
        if (town.apply(event)) {
          holds.event(event);
          steward?.event(event);
          steward?.pump();
        }
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
        logError("jump", err, `${lead.termProgram} ${lead.tty}`);
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

    if (req.method === "POST" && path === "/review") {
      const body = await pageBody(req, res);
      if (body === null) return;
      const { cwd, number } = body;
      if (typeof cwd !== "string" || typeof number !== "number") {
        res.writeHead(400).end();
        return;
      }
      if (!steward) {
        res.writeHead(409, text).end("Funtown's reviews are off.");
        return;
      }
      const status = steward.ask(cwd, number);
      if (status === 204) {
        steward.pump();
        broadcast();
      }
      res.writeHead(status).end();
      return;
    }

    if (req.method === "POST" && path === "/word") {
      const card = await pageField(req, res, "card");
      if (card === null) return;
      const status = steward?.askWord(card) ?? 409;
      if (status === 204) {
        steward!.pump();
        broadcast();
      }
      res.writeHead(status).end();
      return;
    }

    if (req.method === "POST" && path === "/sessions") {
      const cwd = await pageField(req, res, "cwd");
      if (cwd === null) return;
      if (!startCwds().includes(cwd)) {
        res.writeHead(404).end();
        return;
      }
      try {
        const id = await startBackground(claude, cwd);
        res.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ id }));
      } catch (err) {
        logError("start session", err, cwd);
        res.writeHead(500, text).end(`Couldn't start a session: ${(err as Error).message}`);
      }
      return;
    }

    if (req.method === "POST" && path === "/sessions/stop") {
      const leadId = await pageField(req, res, "lead");
      if (leadId === null) return;
      const lead = town.lead(leadId);
      if (!lead) {
        res.writeHead(404).end();
        return;
      }
      if (lead.shortId === null) {
        res.writeHead(409, text).end("Funtown can only close a background session.");
        return;
      }
      try {
        await stopBackground(claude, lead.shortId);
        res.writeHead(204).end();
      } catch (err) {
        logError("stop session", err, town.cwds().get(lead.id));
        res.writeHead(500, text).end(`Couldn't close the session: ${(err as Error).message}`);
      }
      return;
    }

    if (req.method === "POST" && path === "/runs") {
      const body = await pageBody(req, res);
      if (body === null) return;
      const { cwd, prompt } = body;
      if (typeof cwd !== "string" || typeof prompt !== "string") {
        res.writeHead(400).end();
        return;
      }
      let problem: string | undefined;
      if (prompt.trim() === "") problem = "The prompt is empty.";
      else if (Buffer.byteLength(prompt) > MAX_PROMPT) problem = "The prompt is over 16 KB.";
      else if (prompt.startsWith("-")) problem = "The prompt can't start with -.";
      if (problem) {
        res.writeHead(400, text).end(problem);
        return;
      }
      if (!startCwds().includes(cwd)) {
        res.writeHead(404).end();
        return;
      }
      try {
        const id = await startBackground(claude, cwd, prompt);
        res.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ id }));
      } catch (err) {
        logError("start run", err, cwd);
        res.writeHead(500, text).end(`Couldn't start a run: ${(err as Error).message}`);
      }
      return;
    }

    if (req.method === "POST" && path === "/projects") {
      const given = await pageField(req, res, "cwd");
      if (given === null) return;
      const current = currentProjects(res);
      if (current === null) return;
      const folder = projectFolder(given);
      if ("reason" in folder) {
        res.writeHead(400, text).end(folder.reason);
        return;
      }
      if (current.includes(folder.cwd)) {
        res.writeHead(200).end();
        return;
      }
      try {
        saveProjects([...current, folder.cwd]);
        res.writeHead(201).end();
      } catch (err) {
        logError("projects", err, folder.cwd);
        res.writeHead(500, text).end(`Couldn't save the project list: ${(err as Error).message}`);
      }
      return;
    }

    if (req.method === "POST" && path === "/projects/remove") {
      const cwd = await pageField(req, res, "cwd");
      if (cwd === null) return;
      const current = currentProjects(res);
      if (current === null) return;
      if (!current.includes(cwd)) {
        res.writeHead(404).end();
        return;
      }
      try {
        saveProjects(current.filter((p) => p !== cwd));
        terminals.closeShell(cwd);
        res.writeHead(204).end();
      } catch (err) {
        logError("projects", err, cwd);
        res.writeHead(500, text).end(`Couldn't save the project list: ${(err as Error).message}`);
      }
      return;
    }

    if (req.method === "POST" && path === "/avatar") {
      const id = await pageField(req, res, "id");
      if (id === null) return;
      if (!AVATAR_ID.test(id)) {
        res.writeHead(400, text).end("An avatar id is 1 to 32 lowercase letters, digits or hyphens.");
        return;
      }
      try {
        if (!opts.avatar) throw new Error("no avatar file is set");
        writeAvatar(opts.avatar, id);
        avatar = id;
      } catch (err) {
        logError("avatar", err, id);
        res.writeHead(500, text).end(`Couldn't save the avatar: ${(err as Error).message}`);
        return;
      }
      broadcast();
      res.writeHead(204).end();
      return;
    }

    if (req.method === "POST" && path === "/shells/close") {
      const cwd = await pageField(req, res, "cwd");
      if (cwd === null) return;
      res.writeHead(terminals.closeShell(cwd) ? 204 : 404).end();
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
      const query = new URL(req.url ?? "/", "http://127.0.0.1").searchParams;
      const lead = query.get("lead") ?? "";
      const id = query.get("id");
      let letters: Letter[] | undefined;
      if (id === null) {
        letters = town.letters(lead);
      } else {
        // One of the steward's letters by id, from the journal, so a word and a review never push each other out.
        try {
          const found = journal?.read().find((e) => e.kind === "letter" && e.cwd === opts.stewardDir && e.lead === lead && e.letter.id === id);
          letters = found?.kind === "letter" ? [found.letter] : undefined;
        } catch (err) {
          logError("journal", err);
          res.writeHead(500).end();
          return;
        }
      }
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
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(morning(entries.filter((e) => !("cwd" in e) || inProject(e.cwd)), since, projects)));
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
    const cols = Number(url.searchParams.get("cols"));
    const rows = Number(url.searchParams.get("rows"));
    const shellCwd = url.searchParams.get("shell");
    if (shellCwd !== null) {
      if (!startCwds().includes(shellCwd)) return refuse(404);
      if (!isSize(cols) || !isSize(rows)) return refuse(400);
      socket.removeListener("error", onError);
      return terminals.shell(req, socket, head, shellCwd, cols, rows);
    }
    const lead = town.lead(url.searchParams.get("lead") ?? "");
    if (!lead) return refuse(404);
    if (lead.kind !== "background" || !lead.shortId) return refuse(409);
    if (!isSize(cols) || !isSize(rows)) return refuse(400);
    socket.removeListener("error", onError);
    terminals.attach(req, socket, head, lead.id, lead.shortId, cols, rows);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, "127.0.0.1", resolve);
  });
  port = (server.address() as AddressInfo).port;
  polling = poll();

  return {
    url: `http://127.0.0.1:${port}`,
    claude: version,
    close: async () => {
      closed = true;
      clearTimeout(pollTimer);
      prAbort.abort();
      const children = Promise.all([polling, ...prRunning.values(), steward?.close()]);
      terminals.close();
      holds.close();
      for (const res of clients) res.end();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
      await children;
    },
  };
}
