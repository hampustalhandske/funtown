#!/usr/bin/env node
// A stand-in for the `claude` executable. State lives in files next to this script:
//   list.json (the `agents --json` output, written raw), version, and the switches
//   list-fail, version-fail, bg-fail; list-delay (ms `agents --json` waits before printing
//   what list.json held when it was asked) and list-asks (one character per `agents --json`
//   call). `--bg` appends (cwd, argv, CLAUDE*/AI_AGENT variable names) to started.json and lists a new background session; `attach <id>` echoes every
//   input chunk as `got:<JSON string>` and appends it to attach-<id>.input.
// It also stands in for `gh`: `pr list ...` appends (cwd, argv) to pr-calls.jsonl and prints
//   prs.json's list for its cwd (`[]` when none is set; a null entry fails like gh outside a repo).
const fs = process.getBuiltinModule("fs");
const path = process.getBuiltinModule("path");
const crypto = process.getBuiltinModule("crypto");

const dir = __dirname;
const file = (n) => path.join(dir, n);
const read = (n, d) => (fs.existsSync(file(n)) ? fs.readFileSync(file(n), "utf8") : d);
const argv = process.argv.slice(2);
const out = (s) => process.stdout.write(s);

if (argv[0] === "--version") {
  if (fs.existsSync(file("version-fail"))) process.exit(1);
  out(`${read("version", "2.1.325").trim()} (Claude Code)\n`);
} else if (argv[0] === "agents" && argv[1] === "--json") {
  if (fs.existsSync(file("list-fail"))) {
    process.stderr.write("agents failed\n");
    process.exit(1);
  }
  fs.appendFileSync(file("list-asks"), "x");
  const text = read("list.json", "[]");
  const delay = Number(read("list-delay", "0"));
  if (delay > 0) setTimeout(() => out(text), delay);
  else out(text);
} else if (argv[0] === "--bg") {
  if (fs.existsSync(file("bg-fail"))) {
    process.stderr.write("bg failed\n");
    process.exit(1);
  }
  const id = crypto.randomBytes(4).toString("hex");
  const started = JSON.parse(read("started.json", "[]"));
  const leaked = Object.keys(process.env).filter((k) => /^(CLAUDE|AI_AGENT)/.test(k));
  started.push({ cwd: process.cwd(), argv, env: leaked });
  fs.writeFileSync(file("started.json"), JSON.stringify(started));
  const list = JSON.parse(read("list.json", "[]"));
  list.push({
    sessionId: `${id}-0000-4000-8000-000000000000`, id, name: `fresh-${id}`, kind: "background",
    pid: process.pid, cwd: process.cwd(), startedAt: Date.now(), status: "idle",
  });
  fs.writeFileSync(file("list.tmp"), JSON.stringify(list));
  fs.renameSync(file("list.tmp"), file("list.json"));
  out(`${id}\n`);
} else if (argv[0] === "pr" && argv[1] === "list") {
  fs.appendFileSync(file("pr-calls.jsonl"), JSON.stringify({ cwd: process.cwd(), argv }) + "\n");
  const prs = JSON.parse(read("prs.json", "{}"))[process.cwd()];
  if (prs === null) {
    process.stderr.write("no git remotes found\n");
    process.exit(1);
  }
  out(JSON.stringify(prs ?? []));
} else if (argv[0] === "attach") {
  const id = argv[1];
  process.stdin.setRawMode(true);
  fs.appendFileSync(file(`attach-${id}.pids`), `${process.pid}\n`);
  const leaked = Object.keys(process.env).filter((k) => /^(CLAUDE|AI_AGENT)/.test(k));
  const size = () => `${process.stdout.columns}x${process.stdout.rows}`;
  out(`attached ${id} TERM=${process.env.TERM} size:${size()} env:[${leaked.join(",")}]\r\n`);
  process.stdout.on("resize", () => out(`size:${size()}\r\n`));
  process.stdin.on("data", (d) => {
    fs.appendFileSync(file(`attach-${id}.input`), d);
    const s = d.toString();
    if (s === "quit") process.exit(0);
    out(`got:${JSON.stringify(s)}\r\n`);
  });
} else {
  process.stderr.write(`fake claude: unexpected arguments ${JSON.stringify(argv)}\n`);
  process.exit(2);
}
