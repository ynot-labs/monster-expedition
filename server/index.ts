import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import {
  applyGameCommand,
  applyPreferenceCommand,
  applySyncCommand,
  diagnosticSummary,
} from "./game-core.js";
import { JsonGameStore, resolvePluginDataDirectory } from "./game-store.js";
import { writePetBridge } from "./pet-bridge.js";
import { CodexLinkManager } from "./codex-link.js";
import type {
  GameAction,
  PreferenceCommand,
  SyncCommand,
} from "./game-types.js";

const SERVER_VERSION = "0.2.0";
const WIDGET_URI = "ui://monster-expedition/app-v1.html";
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDirectory, "..", "..");
const widgetPath = path.join(projectRoot, "dist", "widget", "index.html");

async function updatePetBridge(snapshot: import("./game-types.js").GameSnapshot): Promise<void> {
  try {
    await writePetBridge(snapshot);
  } catch (error) {
    // The desktop companion is a positive-feedback surface, never a reason to
    // terminate the local game or its MCP session.
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Monster Expedition Pet bridge unavailable: ${message}\n`);
  }
}

const monsterIdSchema = z.enum(["hammerpaw", "swiftwing", "mosshide", "bellhorn"]);
const codexLinkStateSchema = z.enum([
  "not-configured",
  "restart-required",
  "connected",
  "config-conflict",
  "unavailable",
]);
const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("rename_trainer"), name: z.string().min(1).max(100) }),
  z.object({
    type: z.literal("rename_monster"),
    monsterId: monsterIdSchema,
    name: z.string().min(1).max(100),
  }),
  z.object({ type: z.literal("unlock_trainer_node"), nodeId: z.string().min(1).max(100) }),
  z.object({
    type: z.literal("set_team"),
    monsterIds: z.array(monsterIdSchema).min(1).max(2),
    leadMonsterId: monsterIdSchema,
  }),
  z.object({ type: z.literal("attempt_befriend"), encounterId: z.string().min(1).max(200) }),
  z.object({ type: z.literal("equip_gear"), gearId: z.string().min(1).max(300) }),
  z.object({
    type: z.literal("lock_gear"),
    gearId: z.string().min(1).max(300),
    locked: z.boolean(),
  }),
  z.object({ type: z.literal("salvage_gear"), gearId: z.string().min(1).max(300) }),
  z.object({ type: z.literal("upgrade_gear"), gearId: z.string().min(1).max(300) }),
  z.object({
    type: z.literal("choose_reward"),
    choiceId: z.string().min(1).max(300),
    optionId: z.string().min(1).max(400),
  }),
  z.object({ type: z.literal("unlock_camp_node"), nodeId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("reset_camp_tree") }),
  z.object({
    type: z.literal("acknowledge_events"),
    eventIds: z.array(z.string().min(1).max(300)).max(128),
  }),
]);

export interface ServerOptions {
  dataDirectory?: string;
  clock?: () => Date;
}

export async function createMonsterExpeditionServer(
  options: ServerOptions = {},
): Promise<McpServer> {
  const widgetHtml = await readFile(widgetPath, "utf8");
  const clock = options.clock ?? (() => new Date());
  const dataDirectory = options.dataDirectory ?? resolvePluginDataDirectory(projectRoot);
  const store = new JsonGameStore(dataDirectory, clock);
  const codexLink = new CodexLinkManager({ dataDirectory });
  await codexLink.startIfConfigured().catch(() => undefined);
  const server = new McpServer({
    name: "monster-expedition",
    version: SERVER_VERSION,
  });

  registerAppTool(
    server,
    "monster_expedition_open",
    {
      title: "Open Monster Expedition",
      description:
        "Opens the local Monster Expedition management panel and returns the current authoritative game snapshot. Use when the user asks to open, start, show, or inspect Monster Expedition.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: { ui: { resourceUri: WIDGET_URI } },
    },
    async () => {
      const snapshot = await store.read();
      await updatePetBridge(snapshot);
      return {
        content: [
          {
            type: "text" as const,
            text: "Monster Expedition is ready. Open the rendered panel to manage the expedition.",
          },
        ],
        structuredContent: {
          phase: "expedition",
          snapshot,
        },
      };
    },
  );

  registerAppTool(
    server,
    "monster_expedition_sync",
    {
      title: "Sync Monster Expedition",
      description:
        "Advances local idle progress and accepts deduplicated local Codex token totals supplied by the signed helper.",
      inputSchema: {
        commandId: z.string().min(1).max(200),
        expectedRevision: z.number().int().min(0),
        tokenEvents: z
          .array(
            z.object({
              id: z.string().min(1).max(300),
              totalTokens: z.number().int().min(0).max(100_000_000),
            }),
          )
          .max(500)
          .optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: { ui: { visibility: ["app"] } },
    },
    async (input) => {
      const receivedEvents = await codexLink.drainTokenEvents();
      const command = {
        ...(input as unknown as SyncCommand),
        tokenEvents: [...((input.tokenEvents as SyncCommand["tokenEvents"]) ?? []), ...receivedEvents],
      };
      const result = await store.transact(async (snapshot) => {
        const commandResult = applySyncCommand(snapshot, command, clock());
        const linkStatus = await codexLink.status();
        commandResult.snapshot.codexLink.state = linkStatus.state === "restart-required" ? "restart-required" : linkStatus.state;
        return { snapshot: commandResult.snapshot, value: commandResult };
      });
      await updatePetBridge(result.snapshot);
      return {
        content: [{ type: "text" as const, text: "Monster Expedition progress synchronized." }],
        structuredContent: { snapshot: result.snapshot, duplicate: result.duplicate },
      };
    },
  );

  registerAppTool(
    server,
    "monster_expedition_act",
    {
      title: "Act in Monster Expedition",
      description: "Applies one versioned, idempotent game command to the local expedition.",
      inputSchema: {
        commandId: z.string().min(1).max(200),
        expectedRevision: z.number().int().min(0),
        action: actionSchema,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: { ui: { visibility: ["app"] } },
    },
    async (input) => {
      const command = {
        commandId: input.commandId,
        expectedRevision: input.expectedRevision,
        action: input.action as GameAction,
      };
      const result = await store.transact(async (snapshot) => {
        const commandResult = applyGameCommand(snapshot, command);
        return { snapshot: commandResult.snapshot, value: commandResult };
      });
      await updatePetBridge(result.snapshot);
      return {
        content: [{ type: "text" as const, text: "Monster Expedition command applied." }],
        structuredContent: { snapshot: result.snapshot, duplicate: result.duplicate },
      };
    },
  );

  registerAppTool(
    server,
    "monster_expedition_preferences",
    {
      title: "Update Monster Expedition preferences",
      description: "Updates local language, sound, motion, display, or Codex Link state.",
      inputSchema: {
        commandId: z.string().min(1).max(200),
        expectedRevision: z.number().int().min(0),
        preferences: z.object({
          locale: z.enum(["en", "zh-CN"]).optional(),
          soundEnabled: z.boolean().optional(),
          reducedMotion: z.boolean().optional(),
          displayMode: z.enum(["inline", "fullscreen"]).optional(),
          codexLinkState: codexLinkStateSchema.optional(),
          codexLinkAction: z.enum(["authorize", "disconnect"]).optional(),
        }),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: { ui: { visibility: ["app"] } },
    },
    async (input) => {
      const linkAction = input.preferences.codexLinkAction;
      const requestedLinkState = linkAction === "authorize"
        ? await codexLink.authorize()
        : linkAction === "disconnect"
          ? await codexLink.disconnect()
          : null;
      const preferencePatch: PreferenceCommand["preferences"] = {};
      if (input.preferences.locale !== undefined) preferencePatch.locale = input.preferences.locale;
      if (input.preferences.soundEnabled !== undefined) preferencePatch.soundEnabled = input.preferences.soundEnabled;
      if (input.preferences.reducedMotion !== undefined) preferencePatch.reducedMotion = input.preferences.reducedMotion;
      if (input.preferences.displayMode !== undefined) preferencePatch.displayMode = input.preferences.displayMode;
      if (input.preferences.codexLinkState !== undefined) preferencePatch.codexLinkState = input.preferences.codexLinkState;
      if (requestedLinkState) preferencePatch.codexLinkState = requestedLinkState.state;
      const command = {
        commandId: input.commandId,
        expectedRevision: input.expectedRevision,
        preferences: preferencePatch,
      };
      const result = await store.transact(async (snapshot) => {
        const commandResult = applyPreferenceCommand(snapshot, command);
        return { snapshot: commandResult.snapshot, value: commandResult };
      });
      await updatePetBridge(result.snapshot);
      return {
        content: [{ type: "text" as const, text: "Monster Expedition preferences updated." }],
        structuredContent: { snapshot: result.snapshot, duplicate: result.duplicate },
      };
    },
  );

  registerAppTool(
    server,
    "monster_expedition_export_diagnostics",
    {
      title: "Export Monster Expedition diagnostics",
      description:
        "Returns a local, conversation-free diagnostic summary. It does not upload or write the summary anywhere.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: { ui: {} },
    },
    async () => {
      const snapshot = await store.read();
      const diagnostics = diagnosticSummary(snapshot);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(diagnostics, null, 2) }],
        structuredContent: { diagnostics },
      };
    },
  );

  registerAppResource(
    server,
    "Monster Expedition",
    WIDGET_URI,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description:
        "The local English-first Monster Expedition management panel. Its state is restored from the authoritative server snapshot.",
    },
    async () => ({
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetHtml,
        },
      ],
    }),
  );

  return server;
}

async function main(): Promise<void> {
  const server = await createMonsterExpeditionServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`Monster Expedition MCP ${SERVER_VERSION} ready on stdio.\n`);
}

const launchedFile = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (launchedFile === import.meta.url) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`Monster Expedition MCP failed: ${message}\n`);
    process.exitCode = 1;
  });
}
