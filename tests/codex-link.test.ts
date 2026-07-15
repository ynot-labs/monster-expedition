import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CodexLinkManager, parseResponseCompletedEvents } from "../server/codex-link.js";

test("OTel parser accepts only response.completed token totals and never preserves event body content", () => {
  const events = parseResponseCompletedEvents({
    resourceLogs: [{
      scopeLogs: [{
        logRecords: [
          {
            timeUnixNano: "123",
            attributes: [
              { key: "event.name", value: { stringValue: "response.completed" } },
              { key: "total_token_usage.total_tokens", value: { intValue: "1260" } },
              { key: "prompt", value: { stringValue: "this must not become part of the result" } },
            ],
          },
          {
            attributes: [
              { key: "event.name", value: { stringValue: "response.created" } },
              { key: "total_token_usage.total_tokens", value: { intValue: "9999" } },
            ],
          },
        ],
      }],
    }],
  }, "test-key");
  assert.equal(events.length, 1);
  assert.equal(events[0]?.totalTokens, 1260);
  assert.match(events[0]?.id ?? "", /^otel:[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(events), /prompt|this must not/);
});

test("Codex Link adds and removes only its marked local OTel configuration block", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "monster-expedition-link-"));
  const codexHome = path.join(root, ".codex");
  await writeFile(path.join(root, "placeholder"), "", "utf8");
  await mkdir(codexHome, { recursive: true });
  const config = path.join(codexHome, "config.toml");
  await writeFile(config, "model = \"gpt-test\"\n", "utf8");
  const manager = new CodexLinkManager({ dataDirectory: path.join(root, "data"), codexHome, port: 42129 });
  assert.equal((await manager.status()).state, "not-configured");
  const authorized = await manager.authorize();
  assert.equal(authorized.state, "restart-required");
  const configured = await readFile(config, "utf8");
  assert.match(configured, /Monster Expedition Codex Link/);
  assert.match(configured, /log_user_prompt = false/);
  assert.match(configured, /127\.0\.0\.1:42129/);
  assert.match(configured, /model = "gpt-test"/);
  assert.ok(authorized.endpoint);
  const response = await fetch(authorized.endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      resourceLogs: [{ scopeLogs: [{ logRecords: [{
        timeUnixNano: "456",
        attributes: [
          { key: "event.name", value: { stringValue: "response.completed" } },
          { key: "total_token_usage.total_tokens", value: { intValue: "789" } },
        ],
      }] }] }],
    }),
  });
  assert.equal(response.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual((await manager.drainTokenEvents()).map((event) => event.totalTokens), [789]);
  await manager.disconnect();
  assert.equal(await readFile(config, "utf8"), "model = \"gpt-test\"\n");
});
