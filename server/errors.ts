import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type Source = "hook" | "hold" | "server";

/** The error log's default path, `~/.funtown/errors.log`. */
export const defaultErrorLog = () => join(homedir(), ".funtown", "errors.log");

/** True when `err` is a refused connection: Funtown isn't running, which is not an error. */
export function isRefused(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "ECONNREFUSED" || e?.cause?.code === "ECONNREFUSED";
}

/** `err` as "Name: message", with the cause's code when it has one. */
export function describe(err: unknown): string {
  const text = String(err instanceof Error ? `${err.name}: ${err.message}` : err);
  const code = (err as { cause?: { code?: string } } | null)?.cause?.code;
  return code ? `${text} (${code})` : text;
}

/**
 * Appends `<ISO time> <source> <step>: [<about>: ]<message>` to the file at `path`, the message
 * on one line; best effort, never throws.
 */
export function appendError(path: string, source: Source, step: string, err: unknown, about?: string): void {
  const message = `${about ? `${about}: ` : ""}${describe(err)}`.replace(/\s*\n\s*/g, " ").trim();
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${new Date().toISOString()} ${source} ${step}: ${message}\n`);
  } catch {
    // Logging is best effort.
  }
}

/**
 * Reports a server error under `step`, with `about` naming what it concerns (a session, a
 * folder): the error itself on stderr and one line in the error log, when the logger has a file.
 */
export type LogError = (step: string, err: unknown, about?: string) => void;

/** A `LogError` for the server that writes to stderr and to the error log at `path`, when given. */
export function serverLogger(path?: string): LogError {
  return (step, err, about) => {
    console.error(`funtown: ${step}${about ? ` ${about}` : ""}:`, err);
    if (path) appendError(path, "server", step, err, about);
  };
}
