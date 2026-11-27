import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it } from "vitest";
import { errorLines, hold, houseAt, listed, mainEnv, pastes, postPage, pr, realDir, sleep, townWhere, until } from "./helpers.ts";

const MAIN = resolve(import.meta.dirname, "../server/main.ts");

const children: ChildProcess[] = [];
const blockers: Server[] = [];
afterEach(() => {
  for (const c of children.splice(0)) if (c.exitCode === null && c.signalCode === null) c.kill("SIGKILL");
  for (const b of blockers.splice(0)) b.close();
});

/** Starts `node [...nodeArgs] server/main.ts` with `env`; `exited` resolves with its exit code. */
function startMain(env: NodeJS.ProcessEnv, nodeArgs: string[] = []) {
  const child = spawn(process.execPath, [...nodeArgs, MAIN], { env });
  children.push(child);
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  const exited = new Promise<number | null>((r) => child.on("exit", (code) => r(code)));
  /** Resolves once the server says it is running. */
  const running = () => until(() => output.includes("running at"), 8000);
  /** The URL the server says it runs at. */
  const url = () => /running at (\S+)/.exec(output)![1];
  return { child, exited, running, url, output: () => output };
}

/** The run file at `path`, parsed. */
const runFile = (path: string) => JSON.parse(readFileSync(path, "utf8")) as { pid: number; startedAt: number };

/** Resolves once the run file at `path` names `pid`. */
const runFileOf = (path: string, pid: number | undefined) =>
  until(() => existsSync(path) && runFile(path).pid === pid, 8000);

it("a_start_on_a_taken_port_logs_server_start_exits_1_and_leaves_no_run_file", async () => {
  const m = mainEnv();
  const blocker = createServer();
  blockers.push(blocker);
  await new Promise<void>((r) => blocker.listen(0, "127.0.0.1", r));
  const port = (blocker.address() as { port: number }).port;

  const main = startMain({ ...m.env, FUNTOWN_PORT: String(port) });
  expect(await main.exited).toBe(1);

  const starts = errorLines(m.log).filter((l) => l.step === "start");
  expect(starts).toEqual([expect.objectContaining({ source: "server" })]);
  expect(starts[0].message).toContain("EADDRINUSE");
  expect(existsSync(m.run)).toBe(false);
}, 15_000);

it.each([
  ["an_uncaught_exception", 'throw new Error("boom-after-start")'],
  ["an_unhandled_rejection", 'void Promise.reject(new Error("boom-after-start"))'],
])("%s_after_start_logs_one_server_crash_line_with_the_message_and_top_frame_and_exits_1", async (_name, fail) => {
  const m = mainEnv();
  // Loaded with --import: fails 100 ms after the server prints that it is running.
  const module = join(m.dir, "fails-after-start.mjs");
  writeFileSync(
    module,
    `const write = process.stdout.write.bind(process.stdout);\n` +
      `process.stdout.write = (chunk, ...rest) => {\n` +
      `  if (String(chunk).includes("running at")) setTimeout(() => { ${fail}; }, 100);\n` +
      `  return write(chunk, ...rest);\n` +
      `};\n`,
  );
  const main = startMain(m.env, ["--import", pathToFileURL(module).href]);
  expect(await main.exited).toBe(1);

  const crashes = errorLines(m.log).filter((l) => l.step === "crash");
  expect(crashes).toEqual([expect.objectContaining({ source: "server" })]);
  expect(crashes[0].message).toContain("boom-after-start");
  expect(crashes[0].message).toContain("fails-after-start.mjs");
}, 15_000);

it("after_kill_9_the_next_start_logs_unclean_exit_once_and_a_start_after_a_sigterm_stop_logs_none", async () => {
  const m = mainEnv();
  const earlier = "2026-11-16T08:00:00.000Z hook read event: SyntaxError: an earlier line\n";
  writeFileSync(m.log, earlier);

  const first = startMain(m.env);
  await first.running();
  await runFileOf(m.run, first.child.pid);
  const { pid, startedAt } = runFile(m.run);
  expect(typeof startedAt).toBe("number");
  first.child.kill("SIGKILL");
  await first.exited;

  const second = startMain(m.env);
  await second.running();
  await runFileOf(m.run, second.child.pid);
  const unclean = () => errorLines(m.log).filter((l) => l.step === "unclean-exit");
  expect(unclean()).toEqual([
    {
      source: "server",
      step: "unclean-exit",
      message: `the last run (pid ${pid}, started ${new Date(startedAt).toISOString()}) ended without shutting down`,
    },
  ]);
  expect(readFileSync(m.log, "utf8").startsWith(earlier)).toBe(true);

  second.child.kill("SIGTERM");
  expect(await second.exited).toBe(0);
  expect(existsSync(m.run)).toBe(false);

  const third = startMain(m.env);
  await third.running();
  await runFileOf(m.run, third.child.pid);
  expect(unclean()).toHaveLength(1);
}, 30_000);

it("a_sigint_stop_removes_the_run_file_and_exits_0", async () => {
  const m = mainEnv();
  const main = startMain(m.env);
  await main.running();
  await runFileOf(m.run, main.child.pid);
  main.child.kill("SIGINT");
  expect(await main.exited).toBe(0);
  expect(existsSync(m.run)).toBe(false);
}, 15_000);

it("a_run_file_that_does_not_parse_logs_unclean_exit_instead_of_passing_for_a_clean_stop", async () => {
  const m = mainEnv();
  writeFileSync(m.run, ""); // what a power loss can leave behind
  const main = startMain(m.env);
  await main.running();
  await runFileOf(m.run, main.child.pid);
  expect(errorLines(m.log).filter((l) => l.step === "unclean-exit")).toEqual([expect.objectContaining({ source: "server" })]);
}, 15_000);

/**
 * Starts main with a lead listed in a real added project whose gh lists the ready PR #7;
 * `homePrompt` is ~/.funtown/steward.md and `homeCardPrompt` ~/.funtown/steward-card.md, if any.
 */
async function mainWithReadyPr(homePrompt?: string, homeCardPrompt?: string) {
  const m = mainEnv();
  const project = realDir();
  m.fake.list([listed("s1", project)]).prs(project, [pr(7)]);
  mkdirSync(join(m.home, ".funtown"), { recursive: true });
  writeFileSync(join(m.home, ".funtown", "projects.json"), JSON.stringify([project]));
  if (homePrompt !== undefined) writeFileSync(join(m.home, ".funtown", "steward.md"), homePrompt);
  if (homeCardPrompt !== undefined) writeFileSync(join(m.home, ".funtown", "steward-card.md"), homeCardPrompt);
  const main = startMain(m.env);
  await main.running();
  return { ...m, main, project };
}

/** Holds a Bash permission from s1 in `project` on the server at `url`; resolves with the town once its card shows. */
async function cardIn(url: string, project: string) {
  hold(url, { hook_event_name: "PermissionRequest", session_id: "s1", cwd: project, tool_name: "Bash", tool_input: { command: "npm test" } });
  return townWhere(url, (t) => t.cards.length === 1, 8000);
}

it("a_home_steward_card_md_overrides_the_shipped_card_prompt_and_an_empty_one_turns_words_off", async () => {
  const on = await mainWithReadyPr(undefined, "Mine: {project}");
  const card = (await cardIn(on.main.url(), on.project)).cards[0];
  expect(card.word).toEqual({ state: "idle" });
  expect((await postPage({ url: on.main.url() }, "/word", { card: card.id })).status).toBe(204);
  await until(() => on.fake.sessions().some((x) => x.cwd === on.steward), 10_000);
  const short = on.fake.sessions().find((x) => x.cwd === on.steward)!.id!;
  await until(() => pastes(on.fake.attachInput(short)).length === 1, 10_000);
  expect(pastes(on.fake.attachInput(short))).toEqual([`Mine: ${basename(on.project)}`]);

  const off = await mainWithReadyPr(undefined, "");
  const offCard = (await cardIn(off.main.url(), off.project)).cards[0];
  expect(offCard).not.toHaveProperty("word");
  expect((await postPage({ url: off.main.url() }, "/word", { card: offCard.id })).status).toBe(409);
}, 30_000);

it("an_empty_steward_md_in_the_home_folder_turns_reviews_off", async () => {
  const m = await mainWithReadyPr("");
  const url = m.main.url();
  await townWhere(url, (t) => houseAt(t, m.project)?.parcels?.length === 1, 8000);
  await sleep(2500); // past the next list poll, when a started steward would be listed
  expect(houseAt(await townWhere(url, () => true), m.project)!.parcels![0].review).toBeUndefined();
  expect(m.fake.started()).toEqual([]);
}, 20_000);

it("without_a_home_steward_md_main_sends_server_steward_md_filled_in_to_a_steward_in_FUNTOWN_STEWARD_once_asked", async () => {
  const m = await mainWithReadyPr();
  const url = m.main.url();
  const idle = await townWhere(url, (t) => houseAt(t, m.project)?.parcels?.length === 1, 8000);
  expect(houseAt(idle, m.project)!.parcels![0].review?.state).toBe("idle");
  await sleep(2500); // past the next list poll: an unasked PR starts no steward
  expect(m.fake.started()).toEqual([]);

  expect((await postPage({ url }, "/review", { cwd: m.project, number: 7 })).status).toBe(204);
  await until(() => m.fake.sessions().some((x) => x.cwd === m.steward), 10_000);
  const short = m.fake.sessions().find((x) => x.cwd === m.steward)!.id!;
  const pasted = () => pastes(m.fake.attachInput(short));
  await until(() => pasted().length === 1, 10_000);

  const template = readFileSync(resolve(import.meta.dirname, "../server/steward.md"), "utf8");
  const seven = pr(7);
  const expected = template.replaceAll("{number}", String(seven.number)).replaceAll("{title}", seven.title).replaceAll("{url}", seven.url)
    .replaceAll("{project}", basename(m.project)).replaceAll("{repo}", "example/repo");
  expect(pasted()[0].trim()).toBe(expected.trim());
  expect(m.fake.started().map((c) => c.cwd)).toEqual([m.steward]);
}, 25_000);
