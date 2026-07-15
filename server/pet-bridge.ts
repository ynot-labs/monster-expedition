import { mkdir, open, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { GameSnapshot, PetState } from "./game-types.js";

export interface PetBridgeSnapshot {
  schemaVersion: 1;
  revision: number;
  leadMonsterID: string;
  partnerMonsterID: string | null;
  routeID: string;
  petState: PetState;
  codexLinkState: GameSnapshot["codexLink"]["state"];
  tokenProgress: number;
  bondCharges: number;
  pendingRewards: number;
  gold: number;
  trainerXP: number;
  gearMaterials: number;
  locale: GameSnapshot["locale"];
  updatedAt: string;
}

export function resolvePetBridgePath(homeDirectory = os.homedir()): string {
  const configured = process.env.MONSTER_EXPEDITION_APPLICATION_SUPPORT?.trim();
  if (configured) return path.join(path.resolve(configured), "pet-bridge.json");
  return path.join(
    homeDirectory,
    "Library",
    "Application Support",
    "Monster Expedition",
    "pet-bridge.json",
  );
}

export function toPetBridgeSnapshot(snapshot: GameSnapshot): PetBridgeSnapshot {
  const hasUnplayedBurst = snapshot.pendingEvents.some((event) => event.kind === "bond-burst");
  return {
    schemaVersion: 1,
    revision: snapshot.revision,
    leadMonsterID: snapshot.team.leadMonsterId,
    partnerMonsterID: snapshot.team.activeMonsterIds.find((id) => id !== snapshot.team.leadMonsterId) ?? null,
    routeID: snapshot.expedition.routeId,
    petState: hasUnplayedBurst ? "bursting" : snapshot.petState,
    codexLinkState: snapshot.codexLink.state,
    tokenProgress: snapshot.bond.currentTokens,
    bondCharges: snapshot.bond.charges,
    pendingRewards: snapshot.pendingChoices.length,
    gold: snapshot.resources.gold,
    trainerXP: snapshot.trainer.xp,
    gearMaterials: Object.values(snapshot.resources.gearMaterials).reduce((total, value) => total + value, 0),
    locale: snapshot.locale,
    updatedAt: new Date().toISOString(),
  };
}

export async function writePetBridge(snapshot: GameSnapshot): Promise<void> {
  const bridgePath = resolvePetBridgePath();
  const directory = path.dirname(bridgePath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = `${bridgePath}.${process.pid}.${Date.now()}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(`${JSON.stringify(toPetBridgeSnapshot(snapshot))}\n`, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    await rename(temporary, bridgePath);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
