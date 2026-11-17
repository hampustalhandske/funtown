#!/usr/bin/env node
// A stand-in for the user's login shell. On start it prints `shell args:<argv> cwd:<cwd>
// size:<cols>x<rows> env:[<CLAUDE*/AI_AGENT variable names>]` and appends {pid, cwd} to
// shell-starts.jsonl next to this script. It echoes every input chunk as `got:<JSON string>`,
// prints `size:<cols>x<rows>` on resize and exits when the input contains `exit`.
const fs = process.getBuiltinModule("fs");
const path = process.getBuiltinModule("path");

const out = (s) => process.stdout.write(s);
const size = () => `${process.stdout.columns}x${process.stdout.rows}`;
const leaked = Object.keys(process.env).filter((k) => /^(CLAUDE|AI_AGENT)/.test(k));

process.stdin.setRawMode(true);
fs.appendFileSync(path.join(__dirname, "shell-starts.jsonl"), JSON.stringify({ pid: process.pid, cwd: process.cwd() }) + "\n");
out(`shell args:${process.argv.slice(2).join(" ")} cwd:${process.cwd()} size:${size()} env:[${leaked.join(",")}]\r\n`);
process.stdout.on("resize", () => out(`size:${size()}\r\n`));
process.stdin.on("data", (d) => {
  const s = d.toString();
  if (s.includes("exit")) process.exit(0);
  out(`got:${JSON.stringify(s)}\r\n`);
});
