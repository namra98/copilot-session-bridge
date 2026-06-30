import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { joinSession } from "@github/copilot-sdk/extension";

const registryDir = join(homedir(), ".copilot", "session-send-bridge");
await mkdir(registryDir, { recursive: true });

const token = randomUUID();
let bridgeUrl = "";

const session = await joinSession({
  tools: [
    {
      name: "session_send_bridge_info",
      description: "Return this session's session-send bridge endpoint and registry path.",
      parameters: { type: "object", properties: {} },
      skipPermission: true,
      handler: async () =>
        JSON.stringify(
          {
            sessionId: session.sessionId,
            bridgeUrl,
            registryPath,
          },
          null,
          2,
        ),
    },
  ],
});

const registryPath = join(registryDir, `${session.sessionId}.json`);

function sendJson(res, status, value) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
}

async function handleSend(req, res) {
  let raw = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", async () => {
    try {
      const input = JSON.parse(raw || "{}");
      const auth = req.headers.authorization || "";
      const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
      const suppliedToken = bearer || input.token;

      if (suppliedToken !== token) {
        sendJson(res, 401, { ok: false, error: "unauthorized" });
        return;
      }

      if (typeof input.prompt !== "string" || input.prompt.trim() === "") {
        sendJson(res, 400, { ok: false, error: "prompt_required" });
        return;
      }

      const mode = input.mode === "immediate" ? "immediate" : "enqueue";
      const messageId = await session.send({ prompt: input.prompt, mode });
      sendJson(res, 200, { ok: true, sessionId: session.sessionId, messageId, mode });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: String(error?.message || error) });
    }
  });
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true, sessionId: session.sessionId, bridgeUrl });
    return;
  }

  if (req.method === "POST" && req.url === "/send") {
    await handleSend(req, res);
    return;
  }

  sendJson(res, 404, { ok: false, error: "not_found" });
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address();
bridgeUrl = `http://127.0.0.1:${address.port}/send`;
const healthUrl = `http://127.0.0.1:${address.port}/health`;

await writeFile(
  registryPath,
  JSON.stringify(
    {
      sessionId: session.sessionId,
      bridgeUrl,
      healthUrl,
      token,
      pid: process.pid,
      createdAt: new Date().toISOString(),
    },
    null,
    2,
  ),
  "utf8",
);

await session.log(`session-send-bridge ready for ${session.sessionId} at ${bridgeUrl}`);

const cleanup = async () => {
  try {
    await rm(registryPath, { force: true });
  } catch {}
  try {
    server.close();
  } catch {}
};

process.once("SIGTERM", cleanup);
process.once("SIGINT", cleanup);

