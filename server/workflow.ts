import { execFileAsync } from "./agents.ts";
import type { Parcel } from "./types.ts";

/** What Funtown reads from a project's `.claude/phase.json`. */
export type PhaseFile = { phase: string; note?: string; steps?: string[]; goal?: string; spec?: string; tags: Map<string, string[]> };

/** The state of a PR's checks (see `Parcel`). */
export type Checks = Parcel["checks"];

/** An open pull request as `gh pr list` gives it; `redAt` is when its earliest failed check finished (ms), when one carries a time. */
export type Pr = { number: number; title: string; url: string; draft: boolean; head: string; checks: Checks; redAt?: number };

/** What `gh pr checks` files as failed, plus STARTUP_FAILURE, which gh files as pending. */
const FAILED = new Set(["FAILURE", "ERROR", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"]);
/** What a finished check that did not fail says: it is settled. */
const SETTLED = new Set(["SUCCESS", "NEUTRAL", "SKIPPED", "CANCELLED"]);

/**
 * The checks of a PR from its `statusCheckRollup` list. Each item is read as gh reads it: its
 * `state` if it has one, else its `conclusion` once its `status` is COMPLETED, else its `status`.
 * An item that is not an object, or says nothing known, counts as running, so an odd item never
 * puts a fire out. `redAt` is the earliest finish of a failed item (a check run's `completedAt`,
 * a status's `startedAt`), left out when none has a time.
 */
function readChecks(rollup: unknown[]): { checks: Checks; redAt?: number } {
  if (rollup.length === 0) return { checks: "none" };
  let running = false;
  let red = false;
  let redAt: number | undefined;
  for (const item of rollup) {
    const it = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const hasState = typeof it.state === "string" && it.state !== "";
    const word = hasState ? it.state : it.status === "COMPLETED" ? it.conclusion : it.status;
    if (typeof word === "string" && FAILED.has(word)) {
      red = true;
      const at = Date.parse(String(hasState ? it.startedAt : it.completedAt));
      if (Number.isFinite(at) && (redAt === undefined || at < redAt)) redAt = at;
    } else if (!(typeof word === "string" && SETTLED.has(word))) running = true;
  }
  return red ? { checks: "red", ...(redAt === undefined ? {} : { redAt }) } : { checks: running ? "running" : "green" };
}

/** The most `steps` a phase file may list. */
const MAX_STEPS = 24;

/**
 * The phase file's `text`: its phase, its note when that is a string, its `steps` when that is a
 * list of at most 24 strings, its `goal` and `spec` when each is a string, and under `tags` each
 * role or name whose value is a list, with its string labels. Throws when the text isn't JSON
 * or has no string `phase`; other fields are ignored.
 */
export function parsePhase(text: string): PhaseFile {
  const raw = JSON.parse(text) as { phase?: unknown; note?: unknown; steps?: unknown; goal?: unknown; spec?: unknown; tags?: unknown } | null;
  if (typeof raw?.phase !== "string") throw new Error('the file has no string "phase"');
  const tags = new Map<string, string[]>();
  if (typeof raw.tags === "object" && raw.tags !== null) {
    for (const [key, labels] of Object.entries(raw.tags)) {
      if (Array.isArray(labels)) tags.set(key, labels.filter((l) => typeof l === "string"));
    }
  }
  const steps = Array.isArray(raw.steps) && raw.steps.length <= MAX_STEPS && raw.steps.every((s) => typeof s === "string");
  return {
    phase: raw.phase,
    ...(typeof raw.note === "string" ? { note: raw.note } : {}),
    ...(steps ? { steps: raw.steps as string[] } : {}),
    ...(typeof raw.goal === "string" ? { goal: raw.goal } : {}),
    ...(typeof raw.spec === "string" ? { spec: raw.spec } : {}),
    tags,
  };
}

/**
 * What gh says on stderr when a folder has no GitHub repo: not a git repository, no remotes, and no remote
 * that points to a GitHub host. Matched by text, so a changed text makes that house fog, never fire. The
 * first is gh's full text, because git's "not a git repository: <path>" also names a broken worktree.
 */
const NO_GITHUB = [
  "not a git repository (or any of the parent directories)",
  "no git remotes found",
  "none of the git remotes configured for this repository point to a known GitHub host",
];

/**
 * The open PRs the user opened (`--author @me`) in the repository in `cwd`, newest number first,
 * from `gh pr list` (run as `gh`, never through a shell, with `cwd` as its working folder); `[]` when gh says
 * the folder has no GitHub repo. Rejects with gh's error output, or when its output isn't a list of PRs;
 * `signal` kills gh, and the promise settles once it has exited.
 */
export async function listPrs(gh: string, cwd: string, signal: AbortSignal): Promise<Pr[]> {
  const args = ["pr", "list", "--state", "open", "--json", "number,title,url,isDraft,headRefOid,statusCheckRollup", "--limit", "50", "--author", "@me"];
  let out: string;
  try {
    out = (await execFileAsync(gh, args, { cwd, timeout: 30_000, signal })).stdout;
  } catch (err) {
    const { stderr, message } = err as { stderr?: string; message: string };
    if (NO_GITHUB.some((text) => stderr?.includes(text))) return [];
    throw new Error(stderr?.trim() || message, { cause: err });
  }
  type Raw = { number: number; title: string; url: string; isDraft: boolean; headRefOid: string; statusCheckRollup: unknown[] };
  const list: unknown = JSON.parse(out);
  const valid = (p: Partial<Raw> | null) =>
    typeof p?.number === "number" && typeof p.title === "string" && typeof p.url === "string" && typeof p.isDraft === "boolean" && typeof p.headRefOid === "string" &&
    Array.isArray(p.statusCheckRollup);
  if (!Array.isArray(list) || !list.every(valid)) throw new Error("gh pr list output is not a list of PRs");
  return (list as Raw[])
    .map((p) => ({ number: p.number, title: p.title, url: p.url, draft: p.isDraft, head: p.headRefOid, ...readChecks(p.statusCheckRollup) }))
    .sort((a, b) => b.number - a.number);
}
