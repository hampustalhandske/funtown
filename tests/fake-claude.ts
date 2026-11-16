import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** One entry of `claude agents --json`. */
export type Listed = {
  sessionId: string; id?: string; name?: string; kind: "interactive" | "background";
  pid?: number; cwd: string; startedAt?: number; status: "busy" | "idle" | "waiting"; waitingFor?: string;
};

/** A listed session; `sessionId` and `cwd` are required, the rest has fixed defaults. */
export const listed = (sessionId: string, cwd: string, over: Partial<Listed> = {}): Listed => ({
  sessionId, cwd, kind: "interactive", status: "idle", name: sessionId, pid: 1, startedAt: 1, ...over,
});

/** A listed background session whose short id is the first 8 characters of `sessionId`. */
export const listedBg = (sessionId: string, cwd: string, over: Partial<Listed> = {}): Listed =>
  listed(sessionId, cwd, { kind: "background", id: sessionId.slice(0, 8), ...over });

/** Where the e2e web server's fake `claude` lives, so the config and the specs share it. */
export const E2E_FAKE_DIR = join(tmpdir(), "funtown-e2e-claude");

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
  /** Copies the fake into `dir` (made if missing). */
  static install(dir: string): FakeClaude {
    mkdirSync(dir, { recursive: true });
    const f = new FakeClaude(dir);
    const src = join(import.meta.dirname, "fake-claude.cjs");
    if (existsSync(f.path) && readFileSync(f.path, "utf8") === readFileSync(src, "utf8")) return f;
    const tmp = `${f.path}.${process.pid}.tmp`; // unique per process, so parallel installs do not clash
    copyFileSync(src, tmp);
    chmodSync(tmp, 0o755);
    renameSync(tmp, f.path);
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
  /** Empties the list and the `--bg` record and clears every failure switch. */
  reset(): this {
    for (const n of ["started.json", "list-fail", "version-fail", "bg-fail", "list-delay", "list-asks"]) rmSync(join(this.dir, n), { force: true });
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
  /** The `--bg` calls so far: cwd, argv and the names of the Claude and AI_AGENT variables each saw. */
  started(): { cwd: string; argv: string[]; env: string[] }[] {
    const f = join(this.dir, "started.json");
    return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : [];
  }
  /** Pids of every `attach <id>` process started so far. */
  attachPids(id: string): number[] {
    const f = join(this.dir, `attach-${id}.pids`);
    return existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map(Number) : [];
  }
  dispose() {
    rmSync(this.dir, { recursive: true, force: true });
  }
}
