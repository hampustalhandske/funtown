#!/usr/bin/env node
// A stand-in for the `claude` executable. State lives in files next to this script:
//   list.json (the `agents --json` output, written raw), version, and the switches
//   list-fail, version-fail, bg-fail; list-delay (ms `agents --json` waits before printing
//   what list.json held when it was asked) and list-asks (one character per `agents --json`
//   call; its pid goes to agents.pids). `--bg` appends (cwd, argv, CLAUDE*/AI_AGENT variable names) to started.json and lists a new background session (none
//   with bg-unlisted); `attach <id>` prints its TERM, COLORTERM, TERM_PROGRAM and the names of the terminal-program variables it got, echoes every input chunk as `got:<JSON string>` and appends it to attach-<id>.input, and
//   with attach-chatty also prints a dot every 100 ms, so its output never pauses, and with
//   attach-sticky outlives a hangup by a second, with attach-prompt draws `PROMPT-BOX` on the screen's last row (again after each resize), as Claude draws its prompt box there, and with attach-modes turns on bracketed paste and mouse mode (button tracking, SGR encoding) the way Claude does, and with attach-links prints three links after its first line, each
//   alone on a line from column 0: a plain http URL, an OSC 8 https link and an OSC 8 javascript: link. `stop <id>` appends its argv to stop-calls.jsonl and removes the
//   listed session whose short id is <id> (exit 1 with a message when none is listed, or always with stop-fail).
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
  fs.appendFileSync(file("agents.pids"), `${process.pid}\n`);
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
  started.push({ cwd: process.cwd(), argv, env: leaked, termProgram: process.env.TERM_PROGRAM });
  fs.writeFileSync(file("started.json"), JSON.stringify(started));
  if (!fs.existsSync(file("bg-unlisted"))) {
    const list = JSON.parse(read("list.json", "[]"));
    list.push({
      sessionId: `${id}-0000-4000-8000-000000000000`, id, name: `fresh-${id}`, kind: "background",
      pid: process.pid, cwd: process.cwd(), startedAt: Date.now(), status: "idle",
    });
    fs.writeFileSync(file("list.tmp"), JSON.stringify(list));
    fs.renameSync(file("list.tmp"), file("list.json"));
  }
  out(`${id}\n`);
} else if (argv[0] === "stop") {
  fs.appendFileSync(file("stop-calls.jsonl"), JSON.stringify(argv) + "\n");
  const list = JSON.parse(read("list.json", "[]"));
  const rest = list.filter((s) => s.id !== argv[1]);
  if (fs.existsSync(file("stop-fail")) || rest.length === list.length || argv.length !== 2) {
    process.stderr.write("stop failed\n");
    process.exit(1);
  }
  fs.writeFileSync(file("list.tmp"), JSON.stringify(rest));
  fs.renameSync(file("list.tmp"), file("list.json"));
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
  // the terminal-program variables a real terminal sets, which Funtown must not pass on
  const termVars = Object.keys(process.env).filter((k) => /^(TERM_PROGRAM|TERM_PROGRAM_VERSION|TERM_SESSION_ID|LC_TERMINAL|LC_TERMINAL_VERSION|TMUX|TMUX_PANE|STY|VTE_VERSION|WT_SESSION|TERMINAL_EMULATOR)$|^(ITERM_|KITTY_|GHOSTTY_|WEZTERM_|ALACRITTY_|KONSOLE_)/.test(k));
  out(`attached ${id} TERM=${process.env.TERM} size:${size()} env:[${leaked.sort().join(",")}] COLORTERM=${process.env.COLORTERM} TERM_PROGRAM=${process.env.TERM_PROGRAM} terminal-vars:[${termVars.join(",")}]\r\n`);
  if (fs.existsSync(file("attach-links"))) {
    const osc = (url, text) => `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\\r\n`;
    out("http://example.test/plain\r\n" + osc("https://example.test/osc", "osc-link") + osc("javascript:alert(1)", "js-link"));
  }
  if (fs.existsSync(file("attach-modes"))) out("\x1b[?2004h\x1b[?1000h\x1b[?1006h");
  const prompt = () => fs.existsSync(file("attach-prompt")) && out(`\x1b7\x1b[${process.stdout.rows};1HPROMPT-BOX\x1b8`);
  prompt();
  process.stdout.on("resize", () => {
    out(`size:${size()}\r\n`);
    prompt();
  });
  if (fs.existsSync(file("attach-chatty"))) setInterval(() => out("."), 100);
  if (fs.existsSync(file("attach-sticky"))) process.on("SIGHUP", () => setTimeout(() => process.exit(0), 1000));
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
