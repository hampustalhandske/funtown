import { mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

/**
 * The folders the user added, from the projects file at `path` (a JSON array of absolute
 * paths, in the order added); none when the file is missing. Throws when the file can't be
 * read or is not such an array.
 */
export function readProjects(path: string): string[] {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
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
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(list, null, 2)}\n`);
  renameSync(temp, path);
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
