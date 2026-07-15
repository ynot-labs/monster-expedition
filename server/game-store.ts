import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInitialSnapshot } from "./game-core.js";
import { GAME_SCHEMA_VERSION, type GameSnapshot } from "./game-types.js";

export function resolvePluginDataDirectory(projectRoot: string): string {
  const configured = process.env.PLUGIN_DATA?.trim();
  if (configured) return path.resolve(configured);
  const codexHome = process.env.CODEX_HOME?.trim();
  const baseDirectory = codexHome ? path.resolve(codexHome) : path.join(os.homedir(), ".codex");
  return path.join(baseDirectory, "plugin-data", "monster-expedition");
}

export type SnapshotTransaction<T> = (
  snapshot: GameSnapshot,
) => Promise<{ snapshot: GameSnapshot; value: T }> | { snapshot: GameSnapshot; value: T };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isGameSnapshot(value: unknown): value is GameSnapshot {
  if (!isObject(value) || value.schemaVersion !== GAME_SCHEMA_VERSION) return false;
  if (
    typeof value.revision !== "number" ||
    typeof value.seed !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.lastSimulatedAt !== "string" ||
    typeof value.completed !== "boolean"
  ) {
    return false;
  }
  const requiredObjects = [
    "elapsed",
    "preferences",
    "codexLink",
    "trainer",
    "monsters",
    "team",
    "resources",
    "expedition",
    "gear",
    "camp",
    "bond",
  ];
  if (requiredObjects.some((key) => !isObject(value[key]))) return false;
  const requiredArrays = [
    "pendingEncounters",
    "pendingChoices",
    "pendingEvents",
    "processedMilestoneIds",
    "processedTokenEventIds",
    "processedCommandIds",
  ];
  return requiredArrays.every((key) => Array.isArray(value[key]));
}

export class JsonGameStore {
  readonly #dataDirectory: string;
  readonly #snapshotPath: string;
  readonly #clock: () => Date;
  #transactionTail: Promise<void> = Promise.resolve();

  constructor(dataDirectory: string, clock: () => Date = () => new Date()) {
    this.#dataDirectory = dataDirectory;
    this.#snapshotPath = path.join(dataDirectory, "game-state.json");
    this.#clock = clock;
  }

  get snapshotPath(): string {
    return this.#snapshotPath;
  }

  async read(): Promise<GameSnapshot> {
    try {
      const source = await readFile(this.#snapshotPath, "utf8");
      const parsed: unknown = JSON.parse(source);
      if (!isGameSnapshot(parsed)) {
        await this.#quarantine("schema");
        return createInitialSnapshot(this.#clock());
      }
      return structuredClone(parsed);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return createInitialSnapshot(this.#clock());
      if (error instanceof SyntaxError) {
        await this.#quarantine("json");
        return createInitialSnapshot(this.#clock());
      }
      throw error;
    }
  }

  async write(snapshot: GameSnapshot): Promise<void> {
    if (!isGameSnapshot(snapshot)) throw new Error("Refusing to persist an invalid game snapshot.");
    await mkdir(this.#dataDirectory, { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.#snapshotPath}.${process.pid}.${Date.now()}.tmp`;
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporaryPath, this.#snapshotPath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  async transact<T>(transaction: SnapshotTransaction<T>): Promise<T> {
    const previous = this.#transactionTail;
    let release: () => void = () => undefined;
    this.#transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const current = await this.read();
      const result = await transaction(current);
      await this.write(result.snapshot);
      return result.value;
    } finally {
      release();
    }
  }

  async #quarantine(reason: string): Promise<void> {
    await mkdir(this.#dataDirectory, { recursive: true, mode: 0o700 });
    const quarantinePath = path.join(
      this.#dataDirectory,
      `game-state.corrupt-${reason}-${this.#clock().getTime()}.json`,
    );
    try {
      await rename(this.#snapshotPath, quarantinePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
