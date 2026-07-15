import { createHmac, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CodexLinkState, TokenUsageEvent } from "./game-types.js";

const BEGIN_MARKER = "# >>> Monster Expedition Codex Link >>>";
const END_MARKER = "# <<< Monster Expedition Codex Link <<<";
const RECEIVER_PORT = 42127;
const MAX_BODY_BYTES = 1_000_000;

interface CodexLinkMetadata {
  schemaVersion: 1;
  pathToken: string;
  hmacKey: string;
}

interface TokenQueueFile {
  schemaVersion: 1;
  events: TokenUsageEvent[];
}

export interface CodexLinkStatus {
  state: CodexLinkState;
  endpoint: string | null;
  restartRequired: boolean;
  reason: string | null;
}

export interface CodexLinkManagerOptions {
  dataDirectory: string;
  codexHome?: string;
  port?: number;
}

function configPath(codexHome?: string): string {
  return path.join(codexHome ?? path.join(os.homedir(), ".codex"), "config.toml");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scalar(value: unknown): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return null;
}

function otelScalar(value: unknown): unknown {
  if (!isObject(value)) return value;
  if ("stringValue" in value) return value.stringValue;
  if ("intValue" in value) return typeof value.intValue === "string" ? Number(value.intValue) : value.intValue;
  if ("doubleValue" in value) return value.doubleValue;
  if ("boolValue" in value) return value.boolValue;
  return value;
}

function flattenRecord(value: unknown, prefix = ""): Record<string, string | number | boolean | null> {
  if (!isObject(value)) return prefix ? { [prefix]: scalar(value) } : {};
  return Object.entries(value).reduce<Record<string, string | number | boolean | null>>((result, [key, nested]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    if (isObject(nested)) Object.assign(result, flattenRecord(nested, next));
    else result[next] = scalar(nested);
    return result;
  }, {});
}

export function parseResponseCompletedEvents(payload: unknown, hmacKey: string): TokenUsageEvent[] {
  if (!isObject(payload) || !Array.isArray(payload.resourceLogs)) return [];
  const events: TokenUsageEvent[] = [];
  for (const resourceLog of payload.resourceLogs) {
    if (!isObject(resourceLog) || !Array.isArray(resourceLog.scopeLogs)) continue;
    for (const scopeLog of resourceLog.scopeLogs) {
      if (!isObject(scopeLog) || !Array.isArray(scopeLog.logRecords)) continue;
      for (const record of scopeLog.logRecords) {
        if (!isObject(record)) continue;
        const attributes = Object.assign(
          {},
          ...((Array.isArray(record.attributes) ? record.attributes : []).flatMap((entry) => {
            if (!isObject(entry) || typeof entry.key !== "string") return [];
            return [{ [entry.key]: otelScalar(entry.value) }];
          })),
        );
        let body: Record<string, unknown> = {};
        if (isObject(record.body) && typeof record.body.stringValue === "string") {
          try {
            const parsed: unknown = JSON.parse(record.body.stringValue);
            if (isObject(parsed)) body = parsed;
          } catch {
            continue;
          }
        }
        const flat = { ...flattenRecord(attributes), ...flattenRecord(body) };
        const eventName = [
          flat["event.name"],
          flat["event"],
          flat["event.kind"],
          flat["type"],
        ].find((value) => typeof value === "string");
        if (eventName !== "response.completed") continue;
        const total = [
          flat["total_token_usage.total_tokens"],
          flat["token_count.total_token_usage.total_tokens"],
          flat["total_tokens"],
        ].find((value) => typeof value === "number");
        if (typeof total !== "number" || !Number.isSafeInteger(total) || total <= 0) continue;
        const fingerprint = JSON.stringify({
          timestamp: record.timeUnixNano ?? record.observedTimeUnixNano ?? "",
          total,
          eventName,
        });
        const id = createHmac("sha256", hmacKey).update(fingerprint).digest("hex");
        events.push({ id: `otel:${id}`, totalTokens: total });
      }
    }
  }
  return events;
}

export class CodexLinkManager {
  readonly #dataDirectory: string;
  readonly #metadataPath: string;
  readonly #queuePath: string;
  readonly #configPath: string;
  readonly #port: number;
  #metadata: CodexLinkMetadata | null = null;
  #server: Server | null = null;

  constructor(options: CodexLinkManagerOptions) {
    this.#dataDirectory = options.dataDirectory;
    this.#metadataPath = path.join(options.dataDirectory, "codex-link.json");
    this.#queuePath = path.join(options.dataDirectory, "codex-token-queue.json");
    this.#configPath = configPath(options.codexHome);
    this.#port = options.port ?? RECEIVER_PORT;
  }

  async status(): Promise<CodexLinkStatus> {
    const source = await this.#readConfig();
    const marked = source.includes(BEGIN_MARKER) && source.includes(END_MARKER);
    if (source.includes(BEGIN_MARKER) !== source.includes(END_MARKER)) {
      return { state: "config-conflict", endpoint: null, restartRequired: false, reason: "The managed Codex Link block is incomplete." };
    }
    if (!marked) {
      const hasExistingOtel = /^\s*\[otel(?:[.\]])/m.test(source) || /^\s*exporter\s*=/m.test(source);
      return hasExistingOtel
        ? { state: "config-conflict", endpoint: null, restartRequired: false, reason: "Codex already has OpenTelemetry configuration." }
        : { state: "not-configured", endpoint: null, restartRequired: false, reason: null };
    }
    const metadata = await this.#loadMetadata();
    const endpoint = metadata ? this.#endpoint(metadata) : null;
    return {
      state: this.#server ? "connected" : "restart-required",
      endpoint,
      restartRequired: !this.#server,
      reason: this.#server ? null : "Restart Codex once to begin local token counting.",
    };
  }

  async authorize(): Promise<CodexLinkStatus> {
    const source = await this.#readConfig();
    const current = await this.status();
    if (current.state === "config-conflict") return current;
    const metadata = await this.#loadMetadata();
    const nextMetadata = metadata ?? {
      schemaVersion: 1 as const,
      pathToken: randomBytes(18).toString("hex"),
      hmacKey: randomBytes(32).toString("hex"),
    };
    await this.#saveMetadata(nextMetadata);
    if (!source.includes(BEGIN_MARKER)) {
      await mkdir(path.dirname(this.#configPath), { recursive: true, mode: 0o700 });
      if (source.length > 0) {
        const backup = `${this.#configPath}.monster-expedition.${Date.now()}.bak`;
        await writeFile(backup, source, { encoding: "utf8", mode: 0o600 });
      }
      const block = this.#managedBlock(nextMetadata);
      const divider = source.length === 0 || source.endsWith("\n") ? "" : "\n";
      await writeFile(this.#configPath, `${source}${divider}\n${block}`, { encoding: "utf8", mode: 0o600 });
      await chmod(this.#configPath, 0o600).catch(() => undefined);
    }
    await this.startReceiver();
    return { state: "restart-required", endpoint: this.#endpoint(nextMetadata), restartRequired: true, reason: "Restart Codex once to apply the local-only Link." };
  }

  async disconnect(): Promise<CodexLinkStatus> {
    const source = await this.#readConfig();
    const start = source.indexOf(BEGIN_MARKER);
    const end = source.indexOf(END_MARKER);
    if (start >= 0 && end >= start) {
      const after = end + END_MARKER.length;
      const next = `${source.slice(0, start)}${source.slice(after).replace(/^\n/, "")}`.trimEnd();
      await writeFile(this.#configPath, next ? `${next}\n` : "", { encoding: "utf8", mode: 0o600 });
    }
    await this.stopReceiver();
    await rm(this.#queuePath, { force: true });
    return { state: "not-configured", endpoint: null, restartRequired: false, reason: null };
  }

  async startIfConfigured(): Promise<void> {
    const state = await this.status();
    if (state.state === "restart-required" || state.state === "connected") await this.startReceiver();
  }

  async startReceiver(): Promise<void> {
    if (this.#server) return;
    const metadata = await this.#loadMetadata();
    if (!metadata) return;
    this.#server = createServer((request, response) => {
      void this.#handleRequest(request, response, metadata);
    });
    await new Promise<void>((resolve, reject) => {
      this.#server?.once("error", reject);
      this.#server?.listen(this.#port, "127.0.0.1", () => {
        this.#server?.off("error", reject);
        resolve();
      });
    }).catch((error) => {
      this.#server = null;
      throw error;
    });
  }

  async stopReceiver(): Promise<void> {
    const server = this.#server;
    this.#server = null;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  async drainTokenEvents(): Promise<TokenUsageEvent[]> {
    try {
      const source = await readFile(this.#queuePath, "utf8");
      const parsed: unknown = JSON.parse(source);
      const events = isObject(parsed) && parsed.schemaVersion === 1 && Array.isArray(parsed.events)
        ? parsed.events.filter((event): event is TokenUsageEvent => isObject(event) && typeof event.id === "string" && typeof event.totalTokens === "number")
        : [];
      await rm(this.#queuePath, { force: true });
      return events;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      return [];
    }
  }

  #endpoint(metadata: CodexLinkMetadata): string {
    return `http://127.0.0.1:${this.#port}/monster-expedition/${metadata.pathToken}`;
  }

  #managedBlock(metadata: CodexLinkMetadata): string {
    return [
      BEGIN_MARKER,
      "# Local gameplay input only. No prompt content is enabled or stored.",
      "[otel]",
      'environment = "monster-expedition"',
      "log_user_prompt = false",
      `exporter = { otlp-http = { endpoint = "${this.#endpoint(metadata)}", protocol = "json" } }`,
      END_MARKER,
      "",
    ].join("\n");
  }

  async #readConfig(): Promise<string> {
    try {
      return await readFile(this.#configPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw error;
    }
  }

  async #loadMetadata(): Promise<CodexLinkMetadata | null> {
    if (this.#metadata) return this.#metadata;
    try {
      const source = await readFile(this.#metadataPath, "utf8");
      const parsed: unknown = JSON.parse(source);
      if (!isObject(parsed) || parsed.schemaVersion !== 1 || typeof parsed.pathToken !== "string" || typeof parsed.hmacKey !== "string") return null;
      this.#metadata = parsed as unknown as CodexLinkMetadata;
      return this.#metadata;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async #saveMetadata(metadata: CodexLinkMetadata): Promise<void> {
    await mkdir(this.#dataDirectory, { recursive: true, mode: 0o700 });
    await writeFile(this.#metadataPath, `${JSON.stringify(metadata)}\n`, { encoding: "utf8", mode: 0o600 });
    this.#metadata = metadata;
  }

  async #handleRequest(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse, metadata: CodexLinkMetadata): Promise<void> {
    if (request.method !== "POST" || request.url !== `/monster-expedition/${metadata.pathToken}`) {
      response.writeHead(404).end();
      return;
    }
    let size = 0;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    request.on("end", () => {
      if (size > MAX_BODY_BYTES) {
        response.writeHead(413).end();
        return;
      }
      try {
        const payload: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const events = parseResponseCompletedEvents(payload, metadata.hmacKey);
        void this.#appendEvents(events);
        response.writeHead(200).end();
      } catch {
        response.writeHead(400).end();
      }
    });
  }

  async #appendEvents(events: TokenUsageEvent[]): Promise<void> {
    if (events.length === 0) return;
    await mkdir(this.#dataDirectory, { recursive: true, mode: 0o700 });
    const existing = await this.drainTokenEvents();
    const byID = new Map([...existing, ...events].map((event) => [event.id, event]));
    const file: TokenQueueFile = { schemaVersion: 1, events: [...byID.values()].slice(-500) };
    await writeFile(this.#queuePath, `${JSON.stringify(file)}\n`, { encoding: "utf8", mode: 0o600 });
  }
}
