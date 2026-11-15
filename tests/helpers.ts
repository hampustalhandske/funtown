import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { startServer } from "../server/app.ts";
import type { Session } from "../server/rebuild.ts";
import type { Town } from "../server/types.ts";

export type Json = Record<string, unknown>;

type Server = Awaited<ReturnType<typeof startServer>>;
type StartOptions = Omit<Parameters<typeof startServer>[0], "port">;
const open: Server[] = [];

/** Starts a server on a free port; it is closed after each test. */
export async function start(opts: StartOptions = {}): Promise<Server> {
  const s = await startServer({ port: 0, ...opts });
  open.push(s);
  return s;
}
afterEach(async () => {
  await Promise.all(open.splice(0).map((s) => s.close()));
});

/** Posts one hook event to a running server and returns the HTTP status. */
export async function post(url: string, event: Json, headers: Record<string, string> = {}): Promise<number> {
  const res = await fetch(`${url}/events`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(event),
  });
  return res.status;
}

/** Opens GET /stream and resolves with the first Town state satisfying `ok`, or rejects after `ms`. */
export async function townWhere(url: string, ok: (t: Town) => boolean, ms = 3000): Promise<Town> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  let last: Town | undefined;
  try {
    const res = await fetch(`${url}/stream`, { signal: ctl.signal });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const frames = buf.split("\n\n");
      buf = frames.pop()!;
      for (const f of frames) {
        if (!f.includes("event: state")) continue;
        const data = f.split("\n").find((l) => l.startsWith("data:"))!.slice(5).trim();
        last = JSON.parse(data) as Town;
        if (ok(last)) return last;
      }
    }
  } catch (e) {
    if (!ctl.signal.aborted) throw e;
  } finally {
    clearTimeout(timer);
    ctl.abort();
  }
  throw new Error(`town never matched; last state: ${JSON.stringify(last)}`);
}

export const leadsOf = (t: Town) => t.houses.flatMap((h) => h.leads);

/** A pid above macOS's maximum (99999), so no process has it. */
export const deadPid = (): number => 999999;

/** Fixture Claude folder: sessions/<pid>.json plus optional transcripts under projects/p/. */
export class ClaudeDir {
  readonly dir = mkdtempSync(join(tmpdir(), "funtown-claude-"));
  constructor() {
    mkdirSync(join(this.dir, "sessions"), { recursive: true });
    mkdirSync(join(this.dir, "projects", "p"), { recursive: true });
    claudeDirs.push(this.dir);
  }
  session(s: Session): this {
    writeFileSync(join(this.dir, "sessions", `${s.pid}.json`), JSON.stringify({ ...s, entrypoint: "cli" }));
    return this;
  }
  /** Writes sessions/<pid>.json with `text` as its exact content. */
  rawSession(pid: number, text: string): this {
    writeFileSync(join(this.dir, "sessions", `${pid}.json`), text);
    return this;
  }
  /** Writes only agent-<agentId>.meta.json, with `metaText` as its exact content and no transcript. */
  subagentMeta(sessionId: string, agentId: string, metaText: string): this {
    const d = join(this.dir, "projects", "p", sessionId, "subagents");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, `agent-${agentId}.meta.json`), metaText);
    return this;
  }
  /** Writes the lead transcript; each line is JSON-stringified unless it is a raw string. */
  transcript(sessionId: string, lines: (Json | string)[]): this {
    writeFileSync(join(this.dir, "projects", "p", `${sessionId}.jsonl`), lines.map(asLine).join("\n") + "\n");
    return this;
  }
  subagent(sessionId: string, agentId: string, meta: Json, lines: (Json | string)[]): this {
    const d = join(this.dir, "projects", "p", sessionId, "subagents");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, `agent-${agentId}.meta.json`), JSON.stringify(meta));
    writeFileSync(join(d, `agent-${agentId}.jsonl`), lines.map(asLine).join("\n") + "\n");
    return this;
  }
}
const asLine = (l: Json | string): string => (typeof l === "string" ? l : JSON.stringify(l));
const claudeDirs: string[] = [];
afterEach(() => {
  for (const d of claudeDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A transcript line holding one tool_use. */
export const toolUse = (name: string, input: Json, timestamp = "2024-01-01T00:00:00Z"): Json => ({
  type: "assistant",
  timestamp,
  message: { content: [{ type: "tool_use", name, input }] },
});

/** An `exec` fake that answers ps with `lines[pid]` and records each call. */
export function fakePs(lines: Record<number, string>) {
  const calls: [string, string[]][] = [];
  const exec = async (file: string, args: string[]): Promise<string> => {
    calls.push([file, args]);
    return `${lines[Number(args[args.length - 1])] ?? ""}\n`;
  };
  return { exec, calls };
}
