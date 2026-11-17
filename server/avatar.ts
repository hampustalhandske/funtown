import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** The shape of an avatar id: 1 to 32 lowercase letters, digits or hyphens. */
export const AVATAR_ID = /^[a-z0-9-]{1,32}$/;

/**
 * The avatar id in the avatar file at `path` (`{ "id": "<id>" }`); undefined when the file is
 * missing, can't be read, or doesn't hold an id of the right shape.
 */
export function readAvatar(path: string): string | undefined {
  try {
    const { id } = JSON.parse(readFileSync(path, "utf8")) as { id?: unknown };
    return typeof id === "string" && AVATAR_ID.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Writes `id` as the avatar file at `path`, making its folder if needed; the file is replaced
 * whole, through a temporary file beside it, so a failed write leaves the old choice.
 */
export function writeAvatar(path: string, id: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify({ id })}\n`);
  renameSync(temp, path);
}
