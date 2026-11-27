import { describe, expect, it } from "vitest";
import { connectPage, CWD, ev, held as holding, leadsOf, listed, listedBg, sleep, start, townWhere, type Json } from "./helpers.ts";

const BG = "bg111111-0000-4000-8000-000000000000";

/** A server with a terminal lead `s1` and a background lead BG, both listed, and a page connected. */
async function room() {
  const s = await start({ pollMs: 60_000 });
  s.fake.list([listed("s1", CWD), listedBg(BG, CWD, { status: "busy" })]);
  await townWhere(s.url, (t) => leadsOf(t).length === 2);
  connectPage(s.url);
  await sleep(50);
  return s;
}

/** The card `payload` becomes once held. */
const held = async (s: { url: string }, payload: Json) => (await holding(s, payload)).card;

const ask = (questions: Json[]) => ev("PreToolUse", { tool_name: "AskUserQuestion", tool_use_id: "tu1", tool_input: { questions } }, BG);
const q = (header: string, labels: string[] = ["A", "B"]): Json => ({
  question: `Q ${header}?`,
  header,
  multiSelect: false,
  options: labels.map((label) => ({ label, description: "" })),
});

describe("severity and the pick on a question card", () => {
  it("reads_the_level_from_the_header_up_to_a_colon_or_a_space", async () => {
    const s = await room();
    const cases: [string, string, string][] = [
      ["medium: data", "medium", "the agent's word: medium: data"],
      ["high", "high", "the agent's word: high"],
      ["low stakes", "low", "the agent's word: low stakes"],
      ["low:no space", "low", "the agent's word: low:no space"],
    ];
    for (const [header, level, reason] of cases) {
      const card = await held(s, ask([q(header)]));
      expect(card.severity, header).toEqual({ level, reason, source: "agent" });
      expect(card.questions).toEqual([{ level, pick: null }]);
    }
  });

  it("an_unknown_word_or_a_wrong_case_or_no_header_is_unstated", async () => {
    const s = await room();
    for (const header of ["Data", "Medium: data", "mediumish", "", " high", "urgent: yes"]) {
      const card = await held(s, ask([q(header)]));
      expect(card.severity, header).toEqual({ level: "unstated", reason: "the agent didn't say", source: "agent" });
      expect(card.questions).toEqual([{ level: "unstated", pick: null }]);
    }
    const noHeader = await held(s, ask([{ question: "Which?", options: [{ label: "A" }] }]));
    expect(noHeader.questions).toEqual([{ level: "unstated", pick: null }]);
  });

  it("the_pick_is_the_first_option_whose_label_ends_in_recommended", async () => {
    const s = await room();
    const card = await held(s, ask([q("low", ["A", "B (Recommended)", "C (Recommended)"])]));
    expect(card.questions).toEqual([{ level: "low", pick: 1 }]);
    const mid = await held(s, ask([q("low", ["(Recommended) A", "B (recommended)", "C"])]));
    expect(mid.questions).toEqual([{ level: "low", pick: null }]);
  });

  it("several_questions_give_one_entry_each_and_the_card_takes_high_then_unstated_then_the_highest", async () => {
    const s = await room();
    const cases: [string[], string][] = [
      [["low", "high", "medium"], "high"],
      [["low", "oops", "medium"], "unstated"],
      [["high", "oops"], "high"],
      [["low", "medium"], "medium"],
      [["low", "low"], "low"],
    ];
    for (const [headers, level] of cases) {
      const card = await held(s, ask(headers.map((h, i) => q(h, i === 0 ? ["A (Recommended)", "B"] : ["A", "B"]))));
      expect(card.severity.level, headers.join()).toBe(level);
      expect(card.questions!.map((e) => e.level)).toEqual(headers.map((h) => (["low", "medium", "high"].includes(h) ? h : "unstated")));
      expect(card.questions![0].pick).toBe(0);
    }
    const two = await held(s, ask([q("low"), q("high: data")]));
    expect(two.severity).toEqual({ level: "high", reason: "the agent's word: high: data", source: "agent" });
  });

  it("a_question_card_with_no_questions_is_unstated", async () => {
    const s = await room();
    const card = await held(s, ev("PreToolUse", { tool_name: "AskUserQuestion", tool_use_id: "t", tool_input: {} }, BG));
    expect(card.severity).toEqual({ level: "unstated", reason: "the agent didn't say", source: "agent" });
    expect(card.questions).toEqual([]);
  });
});

const exit = (plan: unknown) => ev("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "tp", tool_input: { plan } }, BG);
const MEDIUM_PLAN = { level: "medium", reason: "Funtown's rule: every plan is medium", source: "kind" };

describe("severity on a plan card", () => {
  it("a_plan_is_medium_by_rule_of_kind_whatever_it_says_about_itself", async () => {
    const s = await room();
    for (const plan of ["1. Do it", "Goal: x\nHow serious: low", "How serious: medium", "How serious: nonsense", "", undefined]) {
      const card = await held(s, exit(plan));
      expect(card.severity, String(plan)).toEqual(MEDIUM_PLAN);
      expect(card.questions).toBeUndefined();
    }
  });

  it("a_how_serious_line_starting_with_high_among_the_first_lines_raises_it_to_high_by_the_agent", async () => {
    const s = await room();
    for (const plan of [
      "Goal: ship it\nWhat changes: the db\nHow serious: high, it drops a table",
      "## Plan\n\n- **How serious:** high",
      "How serious: High (data)",
    ]) {
      const card = await held(s, exit(plan));
      expect(card.severity.level, plan).toBe("high");
      expect(card.severity.source).toBe("agent");
      expect(card.severity.reason).toMatch(/^the agent's word: high/i);
    }
  });

  it("a_high_line_far_down_the_plan_or_inside_a_sentence_is_not_read", async () => {
    const s = await room();
    const far = await held(s, exit(`${"step\n".repeat(20)}How serious: high`));
    expect(far.severity).toEqual(MEDIUM_PLAN);
    const mentions = await held(s, exit("Goal: x\nIt is not how serious: high at all"));
    expect(mentions.severity).toEqual(MEDIUM_PLAN);
  });
});

const perm = (tool: string, input: Json) => ev("PermissionRequest", { tool_name: tool, tool_input: input }, "s1");
const bash = (command: string) => perm("Bash", { command, description: "d" });

/** The level Funtown's rule gives each payload, in order, as `[label, level]` pairs. */
async function levels(s: { url: string }, payloads: [string, Json][]) {
  const out: [string, string][] = [];
  for (const [label, payload] of payloads) {
    const card = await held(s, payload);
    expect(card.severity.source, label).toBe("rule");
    expect(card.questions).toBeUndefined();
    out.push([label, card.severity.level]);
  }
  return out;
}
const bashCases = async (s: { url: string }, commands: string[]) => levels(s, commands.map((c) => [c, bash(c)]));
const all = (commands: string[], level: string) => commands.map((c) => [c, level]);

describe("severity on a permission card: Funtown's rule", () => {
  it("names_the_rule_in_the_reason", async () => {
    const s = await room();
    const reasons = async (payload: Json) => (await held(s, payload)).severity.reason;
    expect(await reasons(bash("git push origin main"))).toBe("Funtown's rule: git push leaves this Mac");
    expect(await reasons(bash("rm -rf build"))).toBe("Funtown's rule: rm with a recursive flag can't be walked back");
    expect(await reasons(bash("ls -la"))).toBe("Funtown's rule: ls only reads");
    expect(await reasons(bash("npm install"))).toBe("Funtown's rule: not on the high or low list");
    expect(await reasons(perm("Read", { file_path: "/x" }))).toBe("Funtown's rule: Read only reads");
    expect(await reasons(perm("Edit", { file_path: "/etc/hosts" }))).toBe("Funtown's rule: Edit outside the project folder");
    expect(await reasons(bash("ls && git push && rm -rf x"))).toBe("Funtown's rule: git push leaves this Mac");
  });

  it("bash_commands_that_leave_this_mac_or_cannot_be_walked_back_are_high", async () => {
    const s = await room();
    const high = [
      "git push", "git push --force origin main", "git -C /x push", "git -c a=b push",
      "gh pr create --title x", "gh pr merge 3", "gh api -X POST /repos/x/y", "gh release create v1", "gh issue comment 3 -b hi",
      "npm publish", "pnpm publish --access public", "yarn publish", "cargo publish", "twine upload dist/*",
      "fly deploy", "vercel deploy --prod", "netlify deploy --prod", "npm run deploy", "wrangler deploy",
      "rm -rf build", "rm -r x", "rm -fR x", "rm --recursive x", "/bin/rm -rf x",
      "git reset --hard", "git reset --hard HEAD~1", "git clean -fd", "git clean --force -x",
      "git checkout -- src/a.ts", "git restore src/a.ts", "git branch -f main HEAD", "git fetch --force", "git switch -f main",
      "sudo ls", "FOO=1 sudo make install",
      "curl -X POST -d '{}' https://x.test", "curl --data-binary @f https://x.test", "curl -F file=@a https://x.test",
      "curl -T a.txt ftp://x.test", "curl --json '{}' https://x.test", "curl -sSd x https://x.test", "wget --post-data=a=b https://x.test",
    ];
    expect(await bashCases(s, high)).toEqual(all(high, "high"));
  });

  it("bash_commands_that_only_read_are_low", async () => {
    const s = await room();
    const low = [
      "ls", "ls -la src", "cat a.txt | head -5", "git status", "git log --oneline -5", "git diff HEAD", "git show abc",
      "git -C /x status", "pwd", "which node", "grep -rn foo src", "rg foo", "find . -name '*.ts'", "wc -l a", "tail -n 5 a",
      "FOO=1 ls", "ls && pwd", "ls; git status", "cat a 2>&1", "grep x a 2>/dev/null", "head a || tail a && ls", "ls deploy",
    ];
    expect(await bashCases(s, low)).toEqual(all(low, "low"));
  });

  it("everything_else_is_medium_including_look_alikes", async () => {
    const s = await room();
    const medium = [
      "git commit -m x", "git checkout main", "git stash", "git reset HEAD~1", "git clean -n", "git branch new",
      "npm install", "npm test", "mkdir x", "rm build/a.txt", "echo hi", "unknown-tool --flag", "", "   ",
      "gh pr view 3", "gh pr list", "curl https://x.test", "curl -sSL -o a.tgz https://x.test", "wget https://x.test",
      "ls > out.txt", "cat a >> b", "cat a &> b", "find . -name x -delete", "find . -exec rm {} ;", "find . -execdir ls ;",
      "echo 'a; git push'", "sh -c 'git push'", "echo publish", "ls && true",
    ];
    expect(await bashCases(s, medium)).toEqual(all(medium, "medium"));
  });

  it("a_compound_command_takes_its_highest_part_split_at_and_or_semicolon_and_pipe", async () => {
    const s = await room();
    const cases: [string, string][] = [
      ["ls && git push", "high"],
      ["ls || git push", "high"],
      ["ls; git push", "high"],
      ["cat a | curl -d @- https://x.test", "high"],
      ["git push\nls", "high"],
      ["ls && npm install", "medium"],
      ["rm -rf a && ls", "high"],
      ["ls && pwd | wc -l", "low"],
    ];
    expect(await bashCases(s, cases.map(([c]) => c))).toEqual(cases);
  });

  it("read_only_tools_are_low_and_everything_else_is_medium", async () => {
    const s = await room();
    const cases: [string, Json, string][] = [
      ["Read", { file_path: "/etc/hosts" }, "low"],
      ["Glob", { pattern: "*.ts" }, "low"],
      ["Grep", { pattern: "x" }, "low"],
      ["mcp__notion__search", { query: "x" }, "medium"],
      ["Task", { prompt: "x" }, "medium"],
      ["WebFetch", { url: "https://x.test" }, "low"],
    ];
    expect(await levels(s, cases.map(([t, i]) => [t, perm(t, i)]))).toEqual(cases.map(([t, , l]) => [t, l]));
  });

  it("edit_write_and_notebook_edit_are_medium_in_the_project_folder_and_high_outside_it", async () => {
    const s = await room();
    const cases: [string, Json, string][] = [
      ["Edit", { file_path: `${CWD}/src/a.ts` }, "medium"],
      ["Edit", { file_path: "src/a.ts" }, "medium"],
      ["Write", { file_path: `${CWD}/new.md` }, "medium"],
      ["NotebookEdit", { notebook_path: `${CWD}/n.ipynb` }, "medium"],
      ["Edit", { file_path: "/etc/hosts" }, "high"],
      ["Write", { file_path: "/Users/x/other/a.ts" }, "high"],
      ["Edit", { file_path: "../other/a.ts" }, "high"],
      ["Edit", { file_path: `${CWD}/../x/a.ts` }, "high"],
      ["Edit", { file_path: `${CWD}-2/a.ts` }, "high"],
      ["NotebookEdit", { notebook_path: "/Users/x/n.ipynb" }, "high"],
      ["Edit", {}, "medium"],
    ];
    expect(await levels(s, cases.map(([t, i]) => [`${t} ${JSON.stringify(i)}`, perm(t, i)]))).toEqual(
      cases.map(([t, i, l]) => [`${t} ${JSON.stringify(i)}`, l]),
    );
  });
});
