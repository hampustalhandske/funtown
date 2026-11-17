import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { LogError } from "./errors.ts";

/**
 * The folders the user added, from the projects file at `path` (a JSON array of absolute
 * paths, in the order added); none when the file is missing, and none with the reason logged
 * when it is not such an array.
 */
export function readProjects(path: string, logError: LogError): string[] {
  try {
    const list: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(list) || !list.every((p) => typeof p === "string" && isAbsolute(p))) {
      throw new Error("not a JSON array of absolute paths");
    }
    return list;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    logError("projects", err, path);
    return [];
  }
}

/** Writes `list` as the projects file at `path`, making its folder if needed. */
export function writeProjects(path: string, list: readonly string[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(list, null, 2)}\n`);
}

/** `cwd` normalized when it is the absolute path of an existing folder, else the reason it can't be a project. */
export function projectFolder(cwd: string): { cwd: string } | { reason: string } {
  if (!isAbsolute(cwd)) return { reason: `${cwd} is not an absolute path.` };
  const folder = resolve(cwd);
  let stat;
  try {
    stat = statSync(folder, { throwIfNoEntry: false });
  } catch (err) {
    return { reason: `Can't look at ${folder}: ${(err as Error).message}` };
  }
  if (!stat) return { reason: `${folder} does not exist.` };
  if (!stat.isDirectory()) return { reason: `${folder} is not a folder.` };
  return { cwd: folder };
}
