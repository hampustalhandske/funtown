import { isAbsolute, relative, resolve } from "node:path";
import type { Card, Level, QuestionRating, Severity } from "./types.ts";

/** Least to most serious among the stated levels. */
const STATED: Level[] = ["low", "medium", "high"];
const UNSTATED: Severity = { level: "unstated", reason: "the agent didn't say", source: "agent" };

/** How many of a plan's first lines are read for its "How serious:" line. */
const PLAN_LINES = 10;

/** What `rate` adds to a card. */
type Rating = Pick<Card, "severity" | "questions">;

/** The agent's word on one question: its header's first word, up to a colon or a space, when exactly `low`, `medium` or `high`. */
function word(header: unknown): Severity {
  if (typeof header !== "string") return UNSTATED;
  const first = header.split(/[:\s]/, 1)[0];
  const level = STATED.find((l) => l === first);
  return level ? { level, reason: `the agent's word: ${header}`, source: "agent" } : UNSTATED;
}

/** The index of the first option whose label ends " (Recommended)", else null. */
function pick(options: unknown): number | null {
  if (!Array.isArray(options)) return null;
  const at = options.findIndex((o) => typeof o?.label === "string" && o.label.endsWith(" (Recommended)"));
  return at < 0 ? null : at;
}

/** Any high, else any unstated, else the highest stated; the first question of that level gives the reason. */
function questionCard(input: Record<string, unknown>): Rating {
  const asked = Array.isArray(input.questions) ? input.questions : [];
  const words = asked.map((q) => word(q?.header));
  const questions: QuestionRating[] = asked.map((q, i) => ({ level: words[i].level, pick: pick(q?.options) }));
  const order: Level[] = ["high", "unstated", "medium", "low"];
  const level = order.find((l) => words.some((w) => w.level === l));
  return { severity: words.find((w) => w.level === level) ?? UNSTATED, questions };
}

/** A plan is medium by Funtown's rule; its own "How serious:" line among its first lines starting with `high` raises it to high, never lower. */
function planCard(input: Record<string, unknown>): Rating {
  const lines = typeof input.plan === "string" ? input.plan.split("\n", PLAN_LINES) : [];
  for (const line of lines) {
    const said = /^[\s#>*_-]*how serious:[\s*_]*(high(?![a-z]).*)$/i.exec(line)?.[1];
    if (said) return { severity: { level: "high", reason: `the agent's word: ${said.trim()}`, source: "agent" } };
  }
  return { severity: { level: "medium", reason: "Funtown's rule: every plan is medium", source: "kind" } };
}

// The permission rule. Every list it reads is here.

/** Tools that only read. */
const READ_TOOLS = ["Read", "Glob", "Grep", "LS", "NotebookRead", "WebFetch", "WebSearch", "BashOutput"];
/** Tools that change a file, with the input field holding the path. */
const EDIT_TOOLS: Record<string, string> = { Edit: "file_path", Write: "file_path", NotebookEdit: "notebook_path" };
/** Bash commands that only read (`find` and `git` have their own checks). */
const READ_COMMANDS = ["ls", "cat", "head", "tail", "wc", "pwd", "which", "grep", "rg"];
const READ_GIT = ["status", "log", "diff", "show"];
/** `find` options that delete, run a command or write a file. */
const FIND_ACTIONS = /^-(delete|exec|execdir|ok|okdir|fprint0?|fls)$/;
const READ_GH = ["view", "list", "diff", "status", "checks"];
/** Commands that publish a package, with the word that does it. */
const PUBLISH: Record<string, string> = {
  npm: "publish", pnpm: "publish", yarn: "publish", bun: "publish", cargo: "publish", poetry: "publish",
  uv: "publish", twine: "upload", gem: "push", docker: "push",
};
/** Commands that deploy when given `deploy`. */
const DEPLOY = ["npm", "pnpm", "yarn", "bun", "vercel", "netlify", "fly", "flyctl", "firebase", "wrangler", "serverless", "sls"];
/** git options that take the next word as their value. */
const GIT_VALUE_OPTIONS = ["-C", "-c", "--git-dir", "--work-tree", "--namespace"];
const RECURSIVE = /^(--recursive|-[a-zA-Z]*[rR][a-zA-Z]*)$/;
const FORCE = /^(--force(-with-lease|-if-includes)?(=.*)?|-[a-zA-Z]*f[a-zA-Z]*)$/;
/** curl options that send a body or upload (short ones after flags that take no value), and wget's. */
const CURL_BODY = /^(--(data|form|json|upload-file)|-[sSLkvfiIgNOJ#]*[dFT])/;
const WGET_BODY = /^--(post-data|post-file|body-data|body-file)/;

const RANK = { low: 0, medium: 1, high: 2 };
type Rule = { level: "low" | "medium" | "high"; why: string };
const OTHER: Rule = { level: "medium", why: "not on the high or low list" };

/** A command line cut at `&&`, `||`, `;`, `|` and newlines outside quotes, each part as its words, with whether it writes a file by `>`. */
function partsOf(command: string): { words: string[]; writes: boolean }[] {
  const parts: { words: string[]; writes: boolean }[] = [];
  let words: string[] = [];
  let word = "";
  let started = false;
  let writes = false;
  let quote = "";
  const endWord = () => {
    if (started) words.push(word);
    word = "";
    started = false;
  };
  const endPart = () => {
    endWord();
    parts.push({ words, writes });
    words = [];
    writes = false;
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = "";
      else if (c === "\\" && quote === '"' && i + 1 < command.length) word += command[++i];
      else word += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      started = true;
    } else if (c === "\\" && i + 1 < command.length) {
      word += command[++i];
      started = true;
    } else if (c === "\n" || c === ";") {
      endPart();
    } else if (/\s/.test(c)) {
      endWord();
    } else if (c === "|" || (c === "&" && command[i + 1] === "&")) {
      endPart();
      if (command[i + 1] === c) i++;
    } else if (c === ">") {
      // `2>&1` and `>/dev/null` write nothing; any other target is a file written.
      if (/^\d$/.test(word)) [word, started] = ["", false];
      endWord();
      const target = /^>?(&\S*|\s*([^\s;&|<>]*))/.exec(command.slice(i + 1))!;
      if (!target[1].startsWith("&") && target[2] && target[2] !== "/dev/null") writes = true;
      i += target[0].length;
    } else {
      word += c;
      started = true;
    }
  }
  endPart();
  return parts;
}

/** The subcommand of a git command's arguments, and the arguments after it. */
function gitCommand(args: string[]): { sub: string | undefined; rest: string[] } {
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) i += GIT_VALUE_OPTIONS.includes(args[i]) ? 2 : 1;
  return { sub: args[i], rest: args.slice(i + 1) };
}

/** The rule for one command of a Bash line, or null when none of the high rules applies. */
function highBash(cmd: string, args: string[]): Rule | null {
  const high = (why: string): Rule => ({ level: "high", why });
  const plain = args.filter((a) => !a.startsWith("-")).slice(0, 2);
  if (cmd === "sudo") return high("sudo runs as root");
  if (cmd === "rm" && args.some((a) => RECURSIVE.test(a))) return high("rm with a recursive flag can't be walked back");
  if (cmd === "git") {
    const { sub, rest } = gitCommand(args);
    if (sub === "push") return high("git push leaves this Mac");
    if (sub === "reset" && rest.includes("--hard")) return high("git reset --hard can't be walked back");
    if (sub === "clean" && rest.some((a) => FORCE.test(a))) return high("git clean with force can't be walked back");
    if (sub === "checkout" && rest.includes("--")) return high("git checkout -- over files can't be walked back");
    if (sub === "restore") return high("git restore over files can't be walked back");
    if (rest.some((a) => FORCE.test(a)) && !READ_GIT.includes(sub ?? "")) return high("a force flag on git can't be walked back");
  }
  if (cmd === "gh" && plain.length > 0 && !plain.some((a) => READ_GH.includes(a))) return high(`gh ${plain.join(" ")} changes GitHub`);
  if (Object.hasOwn(PUBLISH, cmd) && plain.includes(PUBLISH[cmd])) return high(`${cmd} ${PUBLISH[cmd]} leaves this Mac`);
  if (DEPLOY.includes(cmd) && plain.includes("deploy")) return high(`${cmd} deploy leaves this Mac`);
  if (cmd === "curl" && args.some((a) => CURL_BODY.test(a))) return high("curl that sends a body leaves this Mac");
  if (cmd === "wget" && args.some((a) => WGET_BODY.test(a))) return high("wget that sends a body leaves this Mac");
  return null;
}

/** The rule for one part of a Bash line. */
function bashPart(part: { words: string[]; writes: boolean }): Rule {
  const first = part.words.findIndex((w) => !/^[A-Za-z_]\w*=/.test(w));
  const words = first < 0 ? [] : part.words.slice(first);
  const cmd = (words[0] ?? "").split("/").pop()!;
  const args = words.slice(1);
  const high = highBash(cmd, args);
  if (high) return high;
  const reads =
    READ_COMMANDS.includes(cmd) ||
    (cmd === "find" && !args.some((a) => FIND_ACTIONS.test(a))) ||
    (cmd === "git" && READ_GIT.includes(gitCommand(args).sub ?? ""));
  return reads && !part.writes ? { level: "low", why: `${cmd === "git" ? `git ${gitCommand(args).sub}` : cmd} only reads` } : OTHER;
}

/** The rule for a Bash line: its highest part, the first when parts tie. */
function bashRule(command: string): Rule {
  const rules = partsOf(command).filter((p) => p.words.length > 0).map(bashPart);
  return rules.length === 0 ? OTHER : rules.reduce((best, r) => (RANK[r.level] > RANK[best.level] ? r : best));
}

/** Funtown's rule for a permission request: by tool, and for Bash by each part of the command. */
function permissionCard(tool: string, input: Record<string, unknown>, cwd: string): Rating {
  let rule = OTHER;
  const path = Object.hasOwn(EDIT_TOOLS, tool) ? input[EDIT_TOOLS[tool]] : undefined;
  if (tool === "Bash" && typeof input.command === "string") rule = bashRule(input.command);
  else if (READ_TOOLS.includes(tool)) rule = { level: "low", why: `${tool} only reads` };
  else if (typeof path === "string") {
    // With no folder to compare with, every path counts as outside.
    const from = cwd ? relative(cwd, resolve(cwd, path)) : "..";
    const inside = !/^\.\.(\/|$)/.test(from) && !isAbsolute(from);
    rule = inside ? { level: "medium", why: `${tool} inside the project folder` } : { level: "high", why: `${tool} outside the project folder` };
  }
  return { severity: { level: rule.level, reason: `Funtown's rule: ${rule.why}`, source: "rule" } };
}

/** The severity of a card made from a held request, and a question card's per-question levels and picks. */
export function rate(card: Pick<Card, "kind" | "tool" | "input" | "cwd">): Rating {
  if (card.kind === "question") return questionCard(card.input);
  if (card.kind === "plan") return planCard(card.input);
  return permissionCard(card.tool, card.input, card.cwd);
}
