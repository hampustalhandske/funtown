import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** One entry of `claude agents --json`. */
export type Listed = {
  sessionId: string; id?: string; name?: string; kind: "interactive" | "background";
  pid?: number; cwd: string; startedAt?: number; status: "busy" | "idle" | "waiting"; waitingFor?: string;
};

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
    copyFileSync(join(import.meta.dirname, "fake-claude.cjs"), f.path + ".tmp");
    chmodSync(f.path + ".tmp", 0o755);
    renameSync(f.path + ".tmp", f.path);
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
  /** The `--bg` calls so far: cwd and argv of each. */
  started(): { cwd: string; argv: string[] }[] {
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
