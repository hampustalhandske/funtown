#!/usr/bin/env node
// A stand-in for the user's login shell. On start it prints `shell args:<argv> cwd:<cwd>
// size:<cols>x<rows> env:[<CLAUDE*/AI_AGENT variable names>] TERM=<> COLORTERM=<> TERM_PROGRAM=<>
// terminal-vars:[<names of terminal-program variables>]` and appends {pid, cwd} to
// shell-starts.jsonl next to this script. It echoes every input chunk as `got:<JSON string>`,
// prints `size:<cols>x<rows>` on resize and exits when the input contains `exit`. With
// FAKE_SHELL_EXIT=<n> in its env it exits with status n at once, before printing anything. On
// input containing `flood` it prints 4000 numbered lines of varying length (about 400 KB,
// `line-<n>-xxx...`) and then `END`.
const fs = process.getBuiltinModule("fs");
const path = process.getBuiltinModule("path");

const out = (s) => process.stdout.write(s);
const size = () => `${process.stdout.columns}x${process.stdout.rows}`;
const leaked = Object.keys(process.env).filter((k) => /^(CLAUDE|AI_AGENT)/.test(k));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a plain script: the fake installs terminal-vars.cjs beside itself
const termVars = require("./terminal-vars.cjs")();

if (process.env.FAKE_SHELL_EXIT) process.exit(Number(process.env.FAKE_SHELL_EXIT));
process.stdin.setRawMode(true);
fs.appendFileSync(path.join(__dirname, "shell-starts.jsonl"), JSON.stringify({ pid: process.pid, cwd: process.cwd() }) + "\n");
out(`shell args:${process.argv.slice(2).join(" ")} cwd:${process.cwd()} size:${size()} env:[${leaked.join(",")}] TERM=${process.env.TERM} COLORTERM=${process.env.COLORTERM} TERM_PROGRAM=${process.env.TERM_PROGRAM} terminal-vars:[${termVars.join(",")}]\r\n`);
process.stdout.on("resize", () => out(`size:${size()}\r\n`));
process.stdin.on("data", (d) => {
  const s = d.toString();
  if (s.includes("exit")) process.exit(0);
  if (s.includes("flood")) {
    for (let i = 0; i < 4000; i++) out(`line-${i}-${"x".repeat(60 + (i % 37))}\r\n`);
    out("END\r\n");
    return;
  }
  out(`got:${JSON.stringify(s)}\r\n`);
});
