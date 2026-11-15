import { afterEach, describe, expect, it } from "vitest";
import { leadsOf, post, townWhere } from "./helpers.ts";

type Server = { url: string; close(): Promise<void> };
const open: Server[] = [];

async function start(goneAfterMs?: number): Promise<Server> {
  const { startServer } = await import("../server/app.ts");
  const s = await startServer({ port: 0, goneAfterMs });
  open.push(s);
  return s;
}
afterEach(async () => {
  await Promise.all(open.splice(0).map((s) => s.close()));
});

const ev = (name: string, extra: Record<string, unknown> = {}, session = "s1", cwd = "/work/demo-app") => ({
  hook_event_name: name,
  session_id: session,
  cwd,
  funtown: { tty: "ttys009", term_program: "TestTerm", at: 1 },
  ...extra,
});

describe("POST /events -> GET /stream", () => {
  it("a_new_session_appears_as_lead_1_in_a_house_named_after_its_folder_with_tty", async () => {
    const { url } = await start();
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(await post(url, ev("SessionStart"))).toBe(204);
    const town = await townWhere(url, (t) => leadsOf(t).length === 1);
    expect(town.houses).toHaveLength(1);
    expect(town.houses[0]).toMatchObject({ project: "demo-app", cwd: "/work/demo-app" });
    expect(town.houses[0].leads[0]).toMatchObject({
      id: "s1", name: "lead-1", stage: "working", tty: "ttys009", termProgram: "TestTerm", subagents: [],
    });
  });

  it("a_second_session_in_the_same_project_is_lead_2_not_a_replacement", async () => {
    const { url } = await start();
    await post(url, ev("SessionStart", {}, "s1"));
    await post(url, ev("SessionStart", {}, "s2"));
    const town = await townWhere(url, (t) => leadsOf(t).length === 2);
    expect(leadsOf(town).map((l) => l.name).sort()).toEqual(["lead-1", "lead-2"]);
  });

  it("stage_follows_prompt_permission_tool_and_stop_and_shows_the_bash_command", async () => {
    const { url } = await start();
    const lead = async (ok: (l: ReturnType<typeof leadsOf>[number]) => boolean) =>
      leadsOf(await townWhere(url, (t) => leadsOf(t).some(ok)))[0];

    await post(url, ev("PreToolUse", { tool_name: "Bash", tool_input: { command: "npm test" } }));
    expect(await lead((l) => l.stage === "working")).toMatchObject({ activity: "Bash: npm test" });

    await post(url, ev("PermissionRequest", { tool_name: "Bash", tool_input: { command: "rm x" } }));
    expect(await lead((l) => l.stage === "needs_you")).toMatchObject({ needs: "permission" });

    await post(url, ev("PreToolUse", { tool_name: "Edit", tool_input: { file_path: "/work/demo-app/a.ts" } }));
    expect(await lead((l) => l.stage === "working")).toMatchObject({ activity: "Edit" });

    await post(url, ev("Stop"));
    expect(await lead((l) => l.stage === "needs_you")).toMatchObject({ needs: "turn ended" });

    await post(url, ev("UserPromptSubmit", { prompt: "go" }));
    expect(await lead((l) => l.stage === "working")).toBeTruthy();
  });

  it("subagents_attach_to_their_own_lead_are_numbered_per_type_and_finish_as_done", async () => {
    const { url } = await start();
    await post(url, ev("SessionStart", {}, "a", "/work/alpha"));
    await post(url, ev("SessionStart", {}, "b", "/work/beta"));
    await post(url, ev("SubagentStart", { agent_id: "x1", agent_type: "Explore" }, "b", "/work/beta"));
    await post(url, ev("SubagentStart", { agent_id: "x2", agent_type: "Explore" }, "b", "/work/beta"));
    await post(url, ev("PreToolUse", { agent_id: "x1", agent_type: "Explore", tool_name: "Bash", tool_input: { command: "ls" } }, "b", "/work/beta"));

    const town = await townWhere(url, (t) => leadsOf(t).find((l) => l.id === "b")?.subagents.length === 2);
    const [a, b] = ["a", "b"].map((id) => leadsOf(town).find((l) => l.id === id)!);
    expect(a.subagents).toEqual([]);
    expect(b.subagents.map((s) => s.name)).toEqual(["Explore-1", "Explore-2"]);
    expect(b.subagents[0]).toMatchObject({ id: "x1", stage: "working", activity: "Bash: ls" });
    expect(b.activity).not.toBe("Bash: ls");

    await post(url, ev("SubagentStop", { agent_id: "x1", agent_type: "Explore" }, "b", "/work/beta"));
    const after = await townWhere(url, (t) => leadsOf(t).find((l) => l.id === "b")?.subagents[0].stage === "done");
    expect(leadsOf(after).find((l) => l.id === "b")!.subagents[1].stage).toBe("working");
  });

  it("session_end_marks_the_lead_gone_then_removes_it_after_goneAfterMs", async () => {
    const { url } = await start(300);
    await post(url, ev("SessionStart"));
    await post(url, ev("SessionEnd"));
    const gone = await townWhere(url, (t) => leadsOf(t).some((l) => l.stage === "gone"));
    expect(leadsOf(gone)[0].id).toBe("s1");
    const removed = await townWhere(url, (t) => leadsOf(t).length === 0, 3000);
    expect(leadsOf(removed)).toEqual([]);
  });

  it("invalid_json_gets_400_and_is_not_applied", async () => {
    const { url } = await start();
    const res = await fetch(`${url}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"hook_event_name": "SessionStart", "session_id": "s1", "cwd": "/work/demo-app"',
    });
    expect(res.status).toBe(400);
    // A valid event afterwards is the first the town has seen: lead-1 is the only lead.
    await post(url, ev("SessionStart", {}, "s2"));
    const town = await townWhere(url, (t) => leadsOf(t).length >= 1);
    expect(leadsOf(town).map((l) => l.id)).toEqual(["s2"]);
  });
});
