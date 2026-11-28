import { realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { readIfExists, writeAtomic } from "./files.ts";

/**
 * The folders the user added, from the projects file at `path` (a JSON array of absolute
 * paths, in the order added); none when the file is missing. Throws when the file can't be
 * read or is not such an array.
 */
export function readProjects(path: string): string[] {
  const text = readIfExists(path);
  if (text === undefined) return [];
  const list: unknown = JSON.parse(text);
  if (!Array.isArray(list) || !list.every((p) => typeof p === "string" && isAbsolute(p))) {
    throw new Error("not a JSON array of absolute paths");
  }
  return list;
}

/**
 * Writes `list` as the projects file at `path`, making its folder if needed; the file is
 * replaced whole, through a temporary file beside it, so a failed write leaves the old list.
 */
export function writeProjects(path: string, list: readonly string[]): void {
  writeAtomic(path, `${JSON.stringify(list, null, 2)}\n`);
}

/**
 * The folder of the house that a session, shell or journal entry in `cwd` belongs to: the
 * deepest of `projects` that is `cwd` or holds it (`cwd` starts with it plus "/"), else `cwd`
 * itself (the steward's folder, or any folder when there is no projects file). Takes real
 * absolute paths with no trailing slash, as the projects file stores them; reads no files.
 */
export function houseOf(cwd: string, projects: readonly string[]): string {
  let house = cwd;
  let depth = -1;
  for (const p of projects) {
    if ((cwd === p || cwd.startsWith(`${p}/`)) && p.length > depth) {
      house = p;
      depth = p.length;
    }
  }
  return house;
}

/**
 * The real path of `cwd` (links followed, letter case as on disk) when it is the absolute
 * path of an existing folder, else the reason it can't be a project.
 */
export function projectFolder(cwd: string): { cwd: string } | { reason: string } {
  if (!isAbsolute(cwd)) return { reason: `${cwd} is not an absolute path.` };
  let folder;
  let stat;
  try {
    folder = realpathSync.native(cwd);
    stat = statSync(folder);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { reason: `${resolve(cwd)} does not exist.` };
    return { reason: `Can't look at ${resolve(cwd)}: ${(err as Error).message}` };
  }
  if (!stat.isDirectory()) return { reason: `${folder} is not a folder.` };
  return { cwd: folder };
}
