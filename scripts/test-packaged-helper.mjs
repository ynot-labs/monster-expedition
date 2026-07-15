import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "build", "Monster Expedition.app");
const executable = path.join(app, "Contents", "MacOS", "MonsterExpeditionHelper");
const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "monster-expedition-package-"));

const child = spawn(executable, ["--mcp-stdio"], {
  env: {
    ...process.env,
    MONSTER_EXPEDITION_DATA_DIR: dataDirectory,
    MONSTER_EXPEDITION_DISABLE_GUI_LAUNCH: "1",
  },
  stdio: ["pipe", "pipe", "pipe"],
});

try {
  let output = "";
  let errors = "";
  const pending = [];
  child.once("error", (error) => {
    while (pending.length) pending.shift().reject(error);
  });
  child.stderr.on("data", (chunk) => { errors += chunk.toString(); });
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
    while (output.includes("\n")) {
      const newline = output.indexOf("\n");
      const line = output.slice(0, newline);
      output = output.slice(newline + 1);
      const request = pending.shift();
      if (!request) continue;
      try { request.resolve(JSON.parse(line)); } catch (error) { request.reject(error); }
    }
  });
  const request = (payload) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Packaged native MCP helper timed out. ${errors}`)), 5_000);
    pending.push({ resolve: (response) => { clearTimeout(timeout); resolve(response); }, reject: (error) => { clearTimeout(timeout); reject(error); } });
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  });

  const response = await request({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "package-smoke", version: "1" } },
    });
  assert.equal(response.id, 1);
  assert.equal(response.result?.serverInfo?.name, "monster-expedition");
  assert.equal(response.result?.capabilities?.resources?.listChanged, false);
  const toolList = await request({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  assert.ok(toolList.result?.tools?.some((tool) => tool.name === "monster_expedition_open"));
  const opened = await request({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "monster_expedition_open", arguments: {} },
  });
  assert.equal(opened.result?.isError, false);
  assert.equal(opened.result?.structuredContent?.snapshot?.leadMonsterID, "hammerpaw");
  console.log("Packaged native MCP helper smoke test passed.");
} finally {
  child.kill("SIGTERM");
  await rm(dataDirectory, { recursive: true, force: true });
}
