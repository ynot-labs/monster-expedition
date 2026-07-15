import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("built stdio server exposes the Monster Expedition MCP App and applies an idempotent sync", async (context) => {
  const projectRoot = path.resolve(import.meta.dirname, "..");
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "monster-expedition-mcp-"));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server", "index.js")],
    cwd: projectRoot,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      PLUGIN_DATA: dataDirectory,
      MONSTER_EXPEDITION_APPLICATION_SUPPORT: path.join(dataDirectory, "app-support"),
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "monster-expedition-test", version: "0.2.0" });
  let serverStderr = "";
  transport.stderr?.on("data", (chunk: Buffer) => { serverStderr += chunk.toString("utf8"); });
  context.after(async () => client.close());
  try {
  await client.connect(transport);

  const tools = await client.listTools();
  const openTool = tools.tools.find((tool) => tool.name === "monster_expedition_open");
  assert.ok(openTool);
  assert.equal(
    (openTool._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri,
    "ui://monster-expedition/app-v1.html",
  );
  assert.deepEqual(
    tools.tools.map((tool) => tool.name).sort(),
    [
      "monster_expedition_act",
      "monster_expedition_export_diagnostics",
      "monster_expedition_open",
      "monster_expedition_preferences",
      "monster_expedition_sync",
    ],
  );

  const opened = await client.callTool({ name: "monster_expedition_open", arguments: {} });
  const initial = (opened.structuredContent as { snapshot: { revision: number } }).snapshot;
  assert.equal(initial.revision, 0);

  const synced = await client.callTool({
    name: "monster_expedition_sync",
    arguments: {
      commandId: "sync-integration-1",
      expectedRevision: 0,
      tokenEvents: [{ id: "otel-integration-1", totalTokens: 100_000 }],
    },
  });
  const snapshot = (synced.structuredContent as {
    snapshot: { revision: number; bond: { charges: number; currentTokens: number } };
  }).snapshot;
  assert.equal(snapshot.revision, 1);
  assert.deepEqual(snapshot.bond, { threshold: 100_000, currentTokens: 0, charges: 1, maxCharges: 2, totalAcceptedTokens: 100_000 });

  const duplicate = await client.callTool({
    name: "monster_expedition_sync",
    arguments: { commandId: "sync-integration-1", expectedRevision: 0 },
  });
  assert.equal((duplicate.structuredContent as { duplicate: boolean }).duplicate, true);

  const resources = await client.listResources();
  const widget = resources.resources.find((resource) => resource.uri === "ui://monster-expedition/app-v1.html");
  assert.ok(widget);
  const resource = await client.readResource({ uri: widget.uri });
  const html = resource.contents[0]?.text ?? "";
  assert.match(html, /<style>/);
  assert.match(html, /<script type="module">/);
  assert.doesNotMatch(html, /<script[^>]+src=/);
  assert.doesNotMatch(html, /<link[^>]+href=/);
  } catch (error) {
    assert.fail(`${error instanceof Error ? error.stack ?? error.message : String(error)}\nMCP stderr:\n${serverStderr}`);
  }
});
