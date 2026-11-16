import { readFileSync } from "node:fs";
import { request } from "node:http";
import { appendError, defaultErrorLog, isRefused } from "../server/errors.ts";

const url = process.env.FUNTOWN_URL ?? "http://127.0.0.1:4777";
const logPath = process.env.FUNTOWN_LOG ?? defaultErrorLog();

const log = (step: string, err: unknown) => appendError(logPath, "hold", step, err);

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
let step = "read event";
try {
  const event = JSON.parse(readFileSync(0, "utf8"));
  event.funtown = { at: Date.now() };
  step = "post /hold";
  const { status, text } = await post(JSON.stringify(event));
  // stdout to a pipe is async, so wait for the write or an exit cuts the output at 64 KB.
  if (status === 200) {
    step = "print answer";
    await new Promise<void>((done, fail) => {
      process.stdout.once("error", fail);
      process.stdout.write(text, (err) => (err ? fail(err) : done()));
    });
  } else if (status !== 204) log("post /hold", `returned ${status}`);
} catch (err) {
  if (!(step === "post /hold" && isRefused(err))) log(step, err);
}
process.exit(0);
