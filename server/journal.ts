import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import type { LogError } from "./errors.ts";
import type { JournalEntry, Morning } from "./types.ts";

const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

export type Journal = {
  /** Adds one line; a failed write is logged and changes nothing else. */
  append(entry: JournalEntry): void;
  /** Every entry in the file, in file order; lines that don't parse are skipped. An absent file gives none; any other read error throws. */
  read(): JournalEntry[];
};

function parse(line: string): JournalEntry | null {
  try {
    const e = JSON.parse(line) as JournalEntry;
    const ok = (e.kind === "letter" || e.kind === "stuck") && typeof e.at === "number" && typeof e.cwd === "string" && typeof e.lead === "string";
    return ok && (e.kind === "stuck" || typeof e.letter?.text === "string") ? e : null;
  } catch {
    return null;
  }
}

/**
 * The journal file at `path`: JSON lines. Opening it drops the lines older than 7 days and the
 * lines that don't parse. Failures go to `logError`.
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
  let kept: JournalEntry[] | null = null;
  try {
    kept = read().filter((e) => e.at >= Date.now() - KEEP_MS);
  } catch (err) {
    logError("journal", err);
  }
  if (kept && existsSync(path)) {
    try {
      writeFileSync(path, kept.map((e) => `${JSON.stringify(e)}\n`).join(""));
    } catch (err) {
      logError("journal", err);
    }
  }
  return {
    read,
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

/** The morning view of `entries` at or after `since`, grouped by cwd. */
export function morning(entries: JournalEntry[], since: number): Morning {
  const projects = new Map<string, Morning["projects"][number]>();
  for (const e of entries.filter((x) => x.at >= since).sort((a, b) => b.at - a.at)) {
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
