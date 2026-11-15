import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { request } from "node:http";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const url = process.env.FUNTOWN_URL ?? "http://127.0.0.1:4777";
const logPath = process.env.FUNTOWN_LOG ?? join(homedir(), ".funtown", "hook.log");

function log(line: string): void {
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // Logging is best effort; the hook still exits 0.
  }
}

/** POSTs `body` to the server's /hold and resolves with the status and body once it replies, however long that takes. */
function post(body: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      `${url}/hold`,
      { method: "POST", headers: { "content-type": "application/json" } },
      (res) => {
        res.setEncoding("utf8");
        let text = "";
        res.on("data", (chunk: string) => (text += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

// Claude shows its own dialog whenever this prints nothing, so every failure logs and exits 0.
try {
  const event = JSON.parse(readFileSync(0, "utf8"));
  event.funtown = { at: Date.now() };
  const { status, text } = await post(JSON.stringify(event));
  // stdout to a pipe is async, so wait for the write or an exit cuts the output at 64 KB.
  if (status === 200) await new Promise((done) => process.stdout.write(text, done));
  else if (status !== 204) log(`POST ${url}/hold returned ${status}`);
} catch (err) {
  log(String(err));
}
process.exit(0);
