import { afterEach, describe, expect, it, vi } from "vitest";
import { leadsOf, listed, post, start, tokenOf, townWhere } from "./helpers.ts";

type Call = [string, string[]];
afterEach(() => vi.restoreAllMocks());

const ev = (name: string, extra: Record<string, unknown> = {}, termProgram: string | null = "Apple_Terminal", tty = "ttys001") => ({
  hook_event_name: name,
  session_id: "s1",
  cwd: "/work/demo-app",
  funtown: { tty, term_program: termProgram, at: 1 },
  ...extra,
});

/** POSTs /jump with the page's token (unless `token` is null) and `origin` (default: the server's own). */
const jump = async (url: string, body: unknown, origin: string | null = url, token: string | null = null) =>
  fetch(`${url}/jump`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
      "x-funtown-token": token ?? (await tokenOf(url)),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

/** Starts a server whose `run` records its calls (or fails when `fail` is set), with lead s1 present. */
async function withLead(termProgram: string | null, tty = "ttys001", fail = false) {
  const calls: Call[] = [];
  const s = await start({ pollMs: 60_000, run: async (f, a) => {
    calls.push([f, a]);
    if (fail) throw new Error("boom");
  } });
  s.fake.list([listed("s1", "/work/demo-app")]);
  await townWhere(s.url, (t) => leadsOf(t).length === 1);
  await post(s.url, ev("SessionStart", {}, termProgram, tty));
  return { ...s, calls };
}

describe("step in the Town state", () => {
  it("step_is_the_last_pretooluse_text_for_lead_and_subagent_and_survives_posttooluse_and_stop", async () => {
    const { url, fake } = await start({ pollMs: 60_000, run: async () => {} });
    fake.list([listed("s1", "/work/demo-app")]);
    expect(leadsOf(await townWhere(url, (t) => leadsOf(t).length === 1))[0].step).toBeNull();

    await post(url, ev("SubagentStart", { agent_id: "x1", agent_type: "Explore" }));
    await post(url, ev("PreToolUse", { tool_name: "Bash", tool_input: { command: "npm test" } }));
    await post(url, ev("PreToolUse", { agent_id: "x1", agent_type: "Explore", tool_name: "Read", tool_input: { file_path: "/work/demo-app/a.ts" } }));
    await post(url, ev("PostToolUse", { tool_name: "Bash", tool_input: { command: "npm test" } }));
    await post(url, ev("PostToolUse", { agent_id: "x1", agent_type: "Explore", tool_name: "Read" }));
    await post(url, ev("Stop"));

    const town = await townWhere(url, (t) => leadsOf(t)[0].subagents[0]?.step === "Read");
    const lead = leadsOf(town)[0];
    expect(lead.step).toBe("Bash: npm test");
    expect(lead.activity).toBeNull();
    expect(lead.subagents[0].step).toBe("Read");
  });
});

describe("POST /jump command choice", () => {
  it("apple_terminal_with_a_tty_runs_osascript_with_the_tty_as_an_argument_never_in_the_script", async () => {
    const { url, calls } = await withLead("Apple_Terminal", "ttys001");
    expect((await jump(url, { lead: "s1" })).status).toBe(204);
    expect(calls).toHaveLength(1);
    const [file, args] = calls[0];
    expect(file).toBe("osascript");
    expect(args[0]).toBe("-e");
    expect(args[1]).not.toContain("ttys001");
    expect(args.slice(2)).toEqual(["ttys001"]);
  });

  it("apple_terminal_without_a_valid_tty_just_opens_terminal", async () => {
    for (const tty of ["", "ttys001; rm -rf /", "/dev/ttys001"]) {
      const { url, calls } = await withLead("Apple_Terminal", tty);
      expect((await jump(url, { lead: "s1" })).status).toBe(204);
      expect(calls).toEqual([["open", ["-a", "Terminal"]]]);
    }
  });

  it("a_known_other_terminal_is_opened_by_its_app_name", async () => {
    const { url, calls } = await withLead("ghostty");
    expect((await jump(url, { lead: "s1" })).status).toBe(204);
    expect(calls).toEqual([["open", ["-a", "Ghostty"]]]);
  });
});

describe("POST /jump refusals", () => {
  it("a_missing_or_foreign_origin_gets_403_and_runs_nothing_while_localhost_is_accepted", async () => {
    const { url, calls } = await withLead("ghostty");
    const port = new URL(url).port;
    expect((await jump(url, { lead: "s1" }, null)).status).toBe(403);
    expect((await jump(url, { lead: "s1" }, "http://evil.example")).status).toBe(403);
    expect((await jump(url, { lead: "s1" }, `http://127.0.0.1:${Number(port) + 1}`)).status).toBe(403);
    expect(calls).toEqual([]);
    expect((await jump(url, { lead: "s1" }, `http://localhost:${port}`)).status).toBe(204);
    expect(calls).toHaveLength(1);
  });

  it("a_missing_or_wrong_token_gets_403_even_from_the_servers_own_origin_and_runs_nothing", async () => {
    const { url, calls } = await withLead("ghostty");
    const noToken = await fetch(`${url}/jump`, {
      method: "POST", headers: { "content-type": "application/json", origin: url }, body: JSON.stringify({ lead: "s1" }),
    });
    expect(noToken.status).toBe(403);
    expect((await jump(url, { lead: "s1" }, url, "0".repeat(32))).status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("a_bad_body_gets_400_and_an_unknown_lead_404_and_nothing_runs", async () => {
    const { url, calls } = await withLead("ghostty");
    expect((await jump(url, "{nope")).status).toBe(400);
    expect((await jump(url, { lead: 5 })).status).toBe(400);
    expect((await jump(url, { lead: "nobody" })).status).toBe(404);
    expect(calls).toEqual([]);
  });

  it("a_body_over_64_kb_gets_413_and_runs_nothing", async () => {
    const { url, calls } = await withLead("ghostty");
    expect((await jump(url, { lead: "s1", pad: "x".repeat(70 * 1024) })).status).toBe(413);
    expect(calls).toEqual([]);
  });

  it("an_unknown_or_null_terminal_gets_409_with_the_message_and_runs_nothing", async () => {
    for (const prog of ["TestTerm", null]) {
      const { url, calls } = await withLead(prog);
      const res = await jump(url, { lead: "s1" });
      expect(res.status).toBe(409);
      expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
      expect(await res.text()).toBe("Funtown doesn't know how to open this session's terminal.");
      expect(calls).toEqual([]);
    }
  });

  it("a_failing_command_gets_500_with_the_message_and_the_error_is_logged_to_stderr", async () => {
    const logged: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void logged.push(a.map(String).join(" ")));
    const { url } = await withLead("ghostty", "ttys001", true);
    const res = await jump(url, { lead: "s1" });
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(await res.text()).toBe("Couldn't open the terminal.");
    expect(logged.join("\n")).toContain("boom");
  });
});
