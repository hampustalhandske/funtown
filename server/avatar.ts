import { readIfExists, writeAtomic } from "./files.ts";

/** The shape of an avatar id: 1 to 32 lowercase letters, digits or hyphens. */
export const AVATAR_ID = /^[a-z0-9-]{1,32}$/;

/**
 * The avatar id in the avatar file at `path` (`{ "id": "<id>" }`); undefined when the file is
 * missing. Throws when the file can't be read or doesn't hold an id of the right shape.
 */
export function readAvatar(path: string): string | undefined {
  const text = readIfExists(path);
  if (text === undefined) return undefined;
  const { id } = JSON.parse(text) as { id?: unknown };
  if (typeof id !== "string" || !AVATAR_ID.test(id)) throw new Error("the file holds no avatar id");
  return id;
}

/**
 * Writes `id` as the avatar file at `path`, making its folder if needed; the file is replaced
 * whole, through a temporary file beside it, so a failed write leaves the old choice.
 */
export function writeAvatar(path: string, id: string): void {
  writeAtomic(path, `${JSON.stringify({ id })}\n`);
}
