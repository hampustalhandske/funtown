import { chmodSync, copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

/** One entry of `claude agents --json`. */
export type Listed = {
  sessionId: string; id?: string; name?: string; kind: "interactive" | "background";
  pid?: number; cwd: string; startedAt?: number; status: "busy" | "idle" | "waiting"; waitingFor?: string; state?: string;
};

/** A listed session; `sessionId` and `cwd` are required, the rest has fixed defaults. */
export const listed = (sessionId: string, cwd: string, over: Partial<Listed> = {}): Listed => ({
  sessionId, cwd, kind: "interactive", status: "idle", name: sessionId, pid: 1, startedAt: 1, ...over,
});

/** A listed background session whose short id is the first 8 characters of `sessionId`. */
export const listedBg = (sessionId: string, cwd: string, over: Partial<Listed> = {}): Listed =>
  listed(sessionId, cwd, { kind: "background", id: sessionId.slice(0, 8), ...over });

/** One entry of `gh pr list --json number,title,url,isDraft,headRefOid`. */
export type Pr = { number: number; title: string; url: string; isDraft: boolean; headRefOid: string };

/** An open, ready PR with a fixed title, url and head commit unless given. */
export const pr = (number: number, over: Partial<Pr> = {}): Pr => ({
  number, title: `PR ${number}`, url: `https://github.com/example/repo/pull/${number}`, isDraft: false, headRefOid: `head-${number}`, ...over,
});

/** The e2e web server's port: `FUNTOWN_E2E_PORT`, so two checkouts can run their browser tests side by side; 4799 by default. */
export const E2E_PORT = process.env.FUNTOWN_E2E_PORT ?? "4799";

/** The e2e web server's address. */
export const E2E_URL = `http://127.0.0.1:${E2E_PORT}`;

/** Where the e2e web server's fake `claude` lives, so the config and the specs share it; one per port. */
export const E2E_FAKE_DIR = join(tmpdir(), `funtown-e2e-claude-${E2E_PORT}`);

const SOURCE = join(import.meta.dirname, "fake-claude.cjs");
const SHELL_SOURCE = join(import.meta.dirname, "fake-shell.cjs");

const texts = new Map<string, string>();
/** True when `path` holds the current text of the fake script `source`. */
const isCurrent = (path: string, source = SOURCE) => {
  if (!texts.has(source)) texts.set(source, readFileSync(source, "utf8"));
  return existsSync(path) && readFileSync(path, "utf8") === texts.get(source);
};

/**
 * The one executable copy of the fake script `source` in this temp folder. Every installed fake
 * is a hard link to it: macOS checks each new executable file the first time it runs, which
 * takes about a second (more under load), and a link to an already checked file skips that check.
 */
function master(source = SOURCE): string {
  const path = join(tmpdir(), `funtown-${basename(source)}`);
  if (isCurrent(path, source)) return path;
  const tmp = `${path}.${process.pid}.tmp`; // unique per process, so parallel workers do not clash
  copyFileSync(source, tmp);
  chmodSync(tmp, 0o755);
  renameSync(tmp, path);
  return path;
}

/** Puts a hard link to `source`'s one copy at `path`, unless `path` already holds the current script. */
function link(source: string, path: string): void {
  if (isCurrent(path, source)) return;
  const tmp = `${path}.${process.pid}.tmp`; // unique per process, so parallel installs do not clash
  rmSync(tmp, { force: true });
  linkSync(master(source), tmp);
  renameSync(tmp, path);
}

/** A fake `claude` executable in a folder; the tests steer it through files in that folder. */
export class FakeClaude {
  /** Path of the executable to pass as `claude`. */
  readonly path: string;
  readonly dir: string;
  private constructor(dir: string) {
    this.dir = dir;
    this.path = join(dir, "claude");
  }
  /** Creates a fresh fake in a new temp folder. */
  static create(): FakeClaude {
    return FakeClaude.install(mkdtempSync(join(tmpdir(), "funtown-fake-claude-")));
  }
  /** Puts the fake into `dir` (made if missing) as a hard link to this temp folder's one copy. */
  static install(dir: string): FakeClaude {
    mkdirSync(dir, { recursive: true });
    const f = new FakeClaude(dir);
    link(SOURCE, f.path);
    return f;
  }
  /** Points at a fake already installed in `dir`. */
  static at(dir: string): FakeClaude {
    return new FakeClaude(dir);
  }
  private put(name: string, text: string) {
    writeFileSync(join(this.dir, name + ".tmp"), text);
    renameSync(join(this.dir, name + ".tmp"), join(this.dir, name));
  }
  private flag(name: string, on: boolean) {
    if (on) writeFileSync(join(this.dir, name), "");
    else rmSync(join(this.dir, name), { force: true });
  }
  /** Empties the list and the `--bg` and `stop` records and clears every failure switch. */
  reset(): this {
    for (const n of ["started.json", "prs.json", "pr-calls.jsonl", "list-fail", "version-fail", "bg-fail", "bg-unlisted", "stop-fail", "stop-calls.jsonl", "attach-chatty", "attach-silent", "attach-sticky", "attach-links", "attach-modes", "attach-prompt", "list-delay", "list-asks", "agents.pids", "shell-starts.jsonl"]) rmSync(join(this.dir, n), { force: true });
    return this.list([]);
  }
  /** Sets what `agents --json` prints. */
  list(sessions: Listed[]): this {
    this.put("list.json", JSON.stringify(sessions));
    return this;
  }
  /** Sets the exact text `agents --json` prints. */
  rawList(text: string): this {
    this.put("list.json", text);
    return this;
  }
  /** Makes `agents --json` print the list as it is when asked, but only after `ms` (0 turns it off). */
  delayList(ms: number): this {
    this.flag("list-delay", ms > 0);
    if (ms > 0) this.put("list-delay", String(ms));
    return this;
  }
  /** Pids of every `agents --json` process since the last reset. */
  agentsPids(): number[] {
    const f = join(this.dir, "agents.pids");
    return existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map(Number) : [];
  }
  /** How many times `agents --json` has been asked since the last reset. */
  listAsks(): number {
    const f = join(this.dir, "list-asks");
    return existsSync(f) ? readFileSync(f, "utf8").length : 0;
  }
  failList(on = true): this {
    this.flag("list-fail", on);
    return this;
  }
  /** Sets the version `--version` reports; null makes it fail. */
  version(v: string | null): this {
    this.flag("version-fail", v === null);
    if (v !== null) this.put("version", v);
    return this;
  }
  failBg(on = true): this {
    this.flag("bg-fail", on);
    return this;
  }
  /** Makes `stop` fail without removing anything. */
  failStop(on = true): this {
    this.flag("stop-fail", on);
    return this;
  }
  /** The `stop` calls so far, each as its argv after the program name. */
  stopCalls(): string[][] {
    const f = join(this.dir, "stop-calls.jsonl");
    return existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  }
  /** Makes `--bg` start sessions that `agents --json` never lists. */
  unlistedBg(on = true): this {
    this.flag("bg-unlisted", on);
    return this;
  }
  /** Makes `attach` print something every 100 ms, so its output never pauses. */
  chattyAttach(on = true): this {
    this.flag("attach-chatty", on);
    return this;
  }
  /** Makes `attach` print nothing until it is typed to (then it echoes the input like any attach), as a session that is slow to wake. */
  silentAttach(on = true): this {
    this.flag("attach-silent", on);
    return this;
  }
  /** Makes `attach` exit only a second after it is hung up on, as a slow terminal might. */
  stickyAttach(on = true): this {
    this.flag("attach-sticky", on);
    return this;
  }
  /** Makes `attach` draw `PROMPT-BOX` on the screen's last row, where Claude's prompt box is. */
  promptAttach(on = true): this {
    this.flag("attach-prompt", on);
    return this;
  }
  /** Makes `attach` print a plain http link, an OSC 8 https link and an OSC 8 javascript: link, each on its own line. */
  linksAttach(on = true): this {
    this.flag("attach-links", on);
    return this;
  }
  /** Makes `attach` turn on bracketed paste and mouse mode, as Claude does. */
  modesAttach(on = true): this {
    this.flag("attach-modes", on);
    return this;
  }
  /** The `--bg` calls so far: cwd, argv, the names of the Claude and AI_AGENT variables each saw and its TERM_PROGRAM. */
  started(): { cwd: string; argv: string[]; env: string[]; termProgram?: string }[] {
    const f = join(this.dir, "started.json");
    return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : [];
  }
  /** What `agents --json` prints now, parsed: the set list plus each session `--bg` added. */
  sessions(): Listed[] {
    return JSON.parse(readFileSync(join(this.dir, "list.json"), "utf8"));
  }
  /** Sets what `pr list` prints when run in `cwd`; null makes it fail there. */
  prs(cwd: string, prs: Pr[] | null): this {
    const f = join(this.dir, "prs.json");
    const all = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
    this.put("prs.json", JSON.stringify({ ...all, [cwd]: prs }));
    return this;
  }
  /** The `pr list` calls so far: the folder each ran in and its arguments. */
  prCalls(): { cwd: string; argv: string[] }[] {
    const f = join(this.dir, "pr-calls.jsonl");
    return existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  }
  /** Every input chunk the `attach <id>` processes received, joined. */
  attachInput(id: string): string {
    const f = join(this.dir, `attach-${id}.input`);
    return existsSync(f) ? readFileSync(f, "utf8") : "";
  }
  /** Pids of every `attach <id>` process started so far. */
  attachPids(id: string): number[] {
    const f = join(this.dir, `attach-${id}.pids`);
    return existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map(Number) : [];
  }
  /** Path of a fake login shell in this folder (see fake-shell.cjs), linked on first use. */
  get shell(): string {
    const path = join(this.dir, "shell");
    link(SHELL_SOURCE, path);
    return path;
  }
  /** Every shell the fake shell has started so far: its pid and the folder it ran in. */
  shellStarts(): { pid: number; cwd: string }[] {
    const f = join(this.dir, "shell-starts.jsonl");
    return existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  }
  dispose() {
    rmSync(this.dir, { recursive: true, force: true });
  }
}
