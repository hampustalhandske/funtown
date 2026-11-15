import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { leadsOf, listed, post, start, townWhere } from "./helpers.ts";

const tempDirs: string[] = [];
const tempDir = (): string => {
  const d = mkdtempSync(join(tmpdir(), "funtown-dist-"));
  tempDirs.push(d);
  return d;
};
afterEach(async () => {
  for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** GET with an explicit Host header (fetch forbids overriding it). */
const getWithHost = (url: string, path: string, host: string): Promise<number> =>
  new Promise((resolve, reject) => {
    const req = request(`${url}${path}`, { headers: { host } }, (res) => {
      res.destroy();
      resolve(res.statusCode!);
    });
    req.on("error", reject);
    req.end();
  });

const ev = (name: string, extra: Record<string, unknown> = {}, session = "s1", cwd = "/work/demo-app") => ({
  hook_event_name: name,
  session_id: session,
  cwd,
  funtown: { tty: "ttys009", term_program: "TestTerm", at: 1 },
  ...extra,
});

/** A server whose list already shows interactive sessions `ids` in /work/demo-app, with the page's town in sync. */
async function withListed(...ids: string[]) {
  const s = await start({ pollMs: 60_000 });
  s.fake.list(ids.map((id) => listed(id, "/work/demo-app")));
  await townWhere(s.url, (t) => leadsOf(t).length === ids.length);
  return s;
}

describe("POST /events -> GET /stream", () => {
  it("hook_activity_step_tty_and_subagents_land_on_the_listed_lead", async () => {
    const { url } = await withListed("s1");
    await post(url, ev("SubagentStart", { agent_id: "x1", agent_type: "Explore" }));
    await post(url, ev("SubagentStart", { agent_id: "x2", agent_type: "Explore" }));
    await post(url, ev("PreToolUse", { tool_name: "Bash", tool_input: { command: "npm test" } }));
    await post(url, ev("PreToolUse", { agent_id: "x1", agent_type: "Explore", tool_name: "Bash", tool_input: { command: "ls" } }));

    const town = await townWhere(url, (t) => leadsOf(t)[0]?.subagents[0]?.activity === "Bash: ls");
    const lead = leadsOf(town)[0];
    expect(lead).toMatchObject({ id: "s1", step: "Bash: npm test", tty: "ttys009", termProgram: "TestTerm" });
    expect(lead.subagents.map((x) => x.name)).toEqual(["Explore-1", "Explore-2"]);
    expect(lead.activity).not.toBe("Bash: ls");

    await post(url, ev("SubagentStop", { agent_id: "x1", agent_type: "Explore" }));
    const after = await townWhere(url, (t) => leadsOf(t)[0].subagents[0].stage === "done");
    expect(leadsOf(after)[0].subagents[1].stage).toBe("working");
  });

  it("an_event_goes_to_its_own_session_when_two_are_listed", async () => {
    const { url } = await withListed("s1", "s2");
    await post(url, ev("PreToolUse", { tool_name: "Bash", tool_input: { command: "only-s2" } }, "s2"));
    const town = await townWhere(url, (t) => leadsOf(t).find((l) => l.id === "s2")?.step === "Bash: only-s2");
    expect(leadsOf(town).find((l) => l.id === "s1")!.step).toBeNull();
  });

  it("a_multibyte_character_split_across_two_chunks_is_read_intact", async () => {
    const { url } = await withListed("s1");
    const body = Buffer.from(JSON.stringify(ev("PreToolUse", { tool_name: "Bash", tool_input: { command: "echo 🙂é" } })));
    const cut = body.indexOf(Buffer.from("🙂")) + 2; // inside the 4-byte character
    await new Promise<void>((resolve, reject) => {
      const req = request(`${url}/events`, { method: "POST", headers: { "content-type": "application/json" } }, (res) => {
        res.resume();
        res.on("end", () => (res.statusCode === 204 ? resolve() : reject(new Error(`status ${res.statusCode}`))));
      });
      req.on("error", reject);
      req.write(body.subarray(0, cut));
      setTimeout(() => req.end(body.subarray(cut)), 50);
    });
    const town = await townWhere(url, (t) => leadsOf(t)[0]?.step !== null);
    expect(leadsOf(town)[0].step).toBe("Bash: echo 🙂é");
  });

  it("invalid_json_gets_400_and_is_not_applied", async () => {
    const { url } = await withListed("s1");
    const res = await fetch(`${url}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"hook_event_name": "PreToolUse", "session_id": "s1", "cwd": "/work/demo-app"',
    });
    expect(res.status).toBe(400);
    await post(url, ev("PreToolUse", { tool_name: "Edit", tool_input: {} }));
    const town = await townWhere(url, (t) => leadsOf(t)[0].step !== null);
    expect(leadsOf(town)[0].step).toBe("Edit");
  });

  it("a_foreign_host_header_gets_403_while_the_real_host_and_localhost_are_served", async () => {
    const { url } = await start();
    const port = new URL(url).port;
    expect(await getWithHost(url, "/stream", "evil.example")).toBe(403);
    expect(await getWithHost(url, "/stream", `127.0.0.1:${port}`)).toBe(200);
    expect(await getWithHost(url, "/stream", `localhost:${port}`)).toBe(200);
  });

  it("an_event_with_an_origin_header_gets_403_and_does_not_change_the_town", async () => {
    const { url } = await withListed("s1");
    const bad = ev("PreToolUse", { tool_name: "Bash", tool_input: { command: "evil" } });
    expect(await post(url, bad, { origin: "http://evil.example" })).toBe(403);
    expect(await post(url, ev("PreToolUse", { tool_name: "Bash", tool_input: { command: "ok" } }))).toBe(204);
    const town = await townWhere(url, (t) => leadsOf(t)[0].step !== null);
    expect(leadsOf(town)[0].step).toBe("Bash: ok");
  });
});

describe("GET / without a built page", () => {
  it("answers_503_with_the_build_hint_not_a_bare_404", async () => {
    const { url } = await start({ distDir: tempDir() });
    const res = await fetch(`${url}/`);
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(await res.text()).toBe("Funtown's page isn't built yet. Run: npm run build");
  });
});

describe("GET / with an unreadable index.html", () => {
  it("answers_500_not_the_503_build_hint_when_the_read_fails_for_a_reason_other_than_missing", async () => {
    const dist = tempDir();
    mkdirSync(join(dist, "index.html"));
    const { url } = await start({ distDir: dist });
    const res = await fetch(`${url}/`);
    expect(res.status).toBe(500);
  });
});
