import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import type { LogError } from "./errors.ts";
import type { JournalEntry, Morning } from "./types.ts";

const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const PRUNE_EVERY_MS = 24 * 60 * 60 * 1000;

export type Journal = {
  /** Adds one line; a failed write is logged and changes nothing else. */
  append(entry: JournalEntry): void;
  /** Every entry in the file, in file order; lines that don't parse are skipped. An absent file gives none; any other read error throws. */
  read(): JournalEntry[];
  /** The entries that survived the prune at open, in file order; none when the file couldn't be read. */
  readonly kept: JournalEntry[];
};

function parse(line: string): JournalEntry | null {
  try {
    const e = JSON.parse(line) as JournalEntry;
    if (e.kind === "steward") return typeof e.at === "number" && typeof e.shortId === "string" ? e : null;
    if (e.kind === "review") return typeof e.at === "number" && typeof e.cwd === "string" && typeof e.pr === "number" && typeof e.head === "string" ? e : null;
    if (e.kind === "reviewed") return typeof e.at === "number" && typeof e.pr === "number" && typeof e.head === "string" && typeof e.letter === "string" ? e : null;
    const ok = (e.kind === "letter" || e.kind === "stuck") && typeof e.at === "number" && typeof e.cwd === "string" && typeof e.lead === "string";
    const letterOk = e.kind === "letter" && typeof e.letter?.text === "string" && typeof e.letter.id === "string" && typeof e.letter.from === "string" && typeof e.letter.at === "number";
    return ok && (e.kind === "stuck" || letterOk) ? e : null;
  } catch {
    return null;
  }
}

/**
 * The journal file at `path`: JSON lines. Opening it, and then once a day while the process
 * runs, drops the lines older than 7 days and the lines that don't parse. Failures go to `logError`.
 */
export function openJournal(path: string, logError: LogError): Journal {
  const read = (): JournalEntry[] => {
    try {
      return readFileSync(path, "utf8").split("\n").filter(Boolean).map(parse).filter((e) => e !== null);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  };
  /**
   * Rewrites the file without its stale and unparseable lines and gives the entries kept; null
   * when it couldn't be read. The newest steward line is kept at any age: it names the steward
   * session a restart reuses; so are review and reviewed lines (one per PR head commit), so an
   * open PR is never asked again and keeps its review.
   */
  const prune = (): JournalEntry[] | null => {
    let kept: JournalEntry[];
    try {
      const all = read();
      const steward = all.findLast((e) => e.kind === "steward");
      kept = all.filter((e) => e === steward || e.kind === "review" || e.kind === "reviewed" || e.at >= Date.now() - KEEP_MS);
    } catch (err) {
      logError("journal", err);
      return null;
    }
    if (existsSync(path)) {
      try {
        writeFileSync(path, kept.map((e) => `${JSON.stringify(e)}\n`).join(""));
      } catch (err) {
        logError("journal", err);
      }
    }
    return kept;
  };
  const kept = prune() ?? [];
  setInterval(prune, PRUNE_EVERY_MS).unref();
  return {
    read,
    kept,
    append(entry) {
      try {
        mkdirSync(dirname(path), { recursive: true });
        appendFileSync(path, `${JSON.stringify(entry)}\n`);
      } catch (err) {
        logError("journal", err);
      }
    },
  };
}

/** The morning view of the letter and stuck `entries` at or after `since`, grouped by cwd. */
export function morning(entries: JournalEntry[], since: number): Morning {
  const projects = new Map<string, Morning["projects"][number]>();
  for (const e of entries.filter((x): x is Extract<JournalEntry, { kind: "letter" | "stuck" }> => (x.kind === "letter" || x.kind === "stuck") && x.at >= since).sort((a, b) => b.at - a.at)) {
    let p = projects.get(e.cwd);
    if (!p) {
      p = { project: basename(e.cwd) || e.cwd, cwd: e.cwd, done: [], stuck: [] };
      projects.set(e.cwd, p);
    }
    if (e.kind === "stuck") p.stuck.push({ at: e.at, lead: e.lead, who: e.who, name: e.name, reason: e.reason });
    else if (e.letter.from === e.lead && !p.done.some((d) => d.lead === e.lead)) p.done.push({ ...e.letter, lead: e.lead });
  }
  return { since, projects: [...projects.values()] };
}
