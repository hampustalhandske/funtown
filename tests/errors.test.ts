import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { CWD, errorLines, ev, leadsOf, listed, post, realDir, sleep, start, townWhere, until } from "./helpers.ts";

it("a_journal_write_that_fails_after_start_is_logged_as_server_journal", async () => {
  const dir = realDir();
  const log = join(dir, "errors.log");
  const journal = join(dir, "journal.jsonl");
  const s = await start({ journal, errorLog: log });
  s.fake.list([listed("s1", CWD)]);
  await townWhere(s.url, (t) => leadsOf(t).length === 1);
  expect(errorLines(log)).toEqual([]);

  mkdirSync(journal); // appending a line to a folder fails
  expect(await post(s.url, ev("Stop", { last_assistant_message: "Done." }))).toBe(204);
  await until(() => errorLines(log).some((l) => l.source === "server" && l.step === "journal"));
});

it("a_failing_poll_logs_one_line_until_a_poll_succeeds_and_a_later_failure_logs_again", async () => {
  const log = join(realDir(), "errors.log");
  const s = await start({ errorLog: log });
  s.fake.list([listed("s1", "/work/a")]);
  await townWhere(s.url, (t) => leadsOf(t).length === 1);
  const polls = () => errorLines(log).filter((l) => l.source === "server" && l.step === "poll");

  s.fake.failList();
  await until(() => polls().length === 1);
  await sleep(600); // about six more failing polls
  expect(polls()).toHaveLength(1);

  s.fake.failList(false).list([listed("s2", "/work/a")]);
  await townWhere(s.url, (t) => leadsOf(t)[0]?.id === "s2");
  s.fake.failList();
  await until(() => polls().length === 2);
});
