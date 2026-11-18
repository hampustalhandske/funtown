import { statSync } from "node:fs";
import { expect, it } from "vitest";
import { FakeClaude } from "./fake-claude.ts";

// macOS checks each new executable file the first time it runs (about a second, more under load),
// so a fake copied afresh per test can blow a test's time limit; links to one copy are checked once.
it("every_fake_claude_and_fake_shell_is_a_link_to_one_checked_copy_not_a_new_file", () => {
  const [a, b] = [FakeClaude.create(), FakeClaude.create()];
  expect(statSync(a.path).ino).toBe(statSync(b.path).ino);
  expect(statSync(a.shell).ino).toBe(statSync(b.shell).ino);
});
