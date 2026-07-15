import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "build", "Monster Expedition.app");
const resources = path.join(app, "Contents", "Resources");
const executable = path.join(resources, "runtime", "node");
const server = path.join(resources, "server", "monster-expedition-server.mjs");
const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "monster-expedition-package-"));

const child = spawn(executable, [server], {
  env: {
    ...process.env,
    PLUGIN_DATA: dataDirectory,
    MONSTER_EXPEDITION_RESOURCE_ROOT: resources,
  },
  stdio: ["pipe", "pipe", "pipe"],
});

try {
  const response = await new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error("Packaged MCP runtime timed out.")), 5_000);
    child.once("error", reject);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      const newline = output.indexOf("\n");
      if (newline < 0) return;
      const line = output.slice(0, newline);
      clearTimeout(timeout);
      resolve(JSON.parse(line));
    });
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "package-smoke", version: "1" },
      },
    })}\n`);
  });
  assert.equal(response.id, 1);
  assert.equal(response.result?.serverInfo?.name, "monster-expedition");
  assert.equal(response.result?.capabilities?.resources?.listChanged, true);
  console.log("Packaged MCP runtime smoke test passed.");
} finally {
  child.kill("SIGTERM");
  await rm(dataDirectory, { recursive: true, force: true });
}
