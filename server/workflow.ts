import { execFileAsync } from "./agents.ts";

/** What Funtown reads from a project's `.claude/phase.json`. */
export type PhaseFile = { phase: string; note?: string; tags: Map<string, string[]> };

/** An open pull request as `gh pr list` gives it. */
export type Pr = { number: number; title: string; url: string; draft: boolean; head: string };

/**
 * The phase file's `text`: its phase, its note when that is a string, and under `tags` each
 * role or name whose value is a list, with its string labels. Throws when the text isn't JSON
 * or has no string `phase`; other fields are ignored.
 */
export function parsePhase(text: string): PhaseFile {
  const raw = JSON.parse(text) as { phase?: unknown; note?: unknown; tags?: unknown } | null;
  if (typeof raw?.phase !== "string") throw new Error('the file has no string "phase"');
  const tags = new Map<string, string[]>();
  if (typeof raw.tags === "object" && raw.tags !== null) {
    for (const [key, labels] of Object.entries(raw.tags)) {
      if (Array.isArray(labels)) tags.set(key, labels.filter((l) => typeof l === "string"));
    }
  }
  return { phase: raw.phase, ...(typeof raw.note === "string" ? { note: raw.note } : {}), tags };
}

/**
 * The open PRs the user opened (`--author @me`) in the repository in `cwd`, newest number first,
 * from `gh pr list` (run as `gh`, never through a shell, with `cwd` as its working folder). Rejects with gh's error output, or
 * when its output isn't a list of PRs; `signal` kills gh, and the promise settles once it has exited.
 */
export async function listPrs(gh: string, cwd: string, signal: AbortSignal): Promise<Pr[]> {
  const args = ["pr", "list", "--state", "open", "--json", "number,title,url,isDraft,headRefOid", "--limit", "50", "--author", "@me"];
  let out: string;
  try {
    out = (await execFileAsync(gh, args, { cwd, timeout: 30_000, signal })).stdout;
  } catch (err) {
    const { stderr, message } = err as { stderr?: string; message: string };
    throw new Error(stderr?.trim() || message, { cause: err });
  }
  type Raw = { number: number; title: string; url: string; isDraft: boolean; headRefOid: string };
  const list: unknown = JSON.parse(out);
  const valid = (p: Partial<Raw> | null) =>
    typeof p?.number === "number" && typeof p.title === "string" && typeof p.url === "string" && typeof p.isDraft === "boolean" && typeof p.headRefOid === "string";
  if (!Array.isArray(list) || !list.every(valid)) throw new Error("gh pr list output is not a list of PRs");
  return (list as Raw[])
    .map((p) => ({ number: p.number, title: p.title, url: p.url, draft: p.isDraft, head: p.headRefOid }))
    .sort((a, b) => b.number - a.number);
}
