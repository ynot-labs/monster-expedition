import {
  CAMP_NODES,
  GEAR_BASES,
  GEAR_QUALITY_ORDER,
  GEAR_TRAITS,
  HOUR_MS,
  MAX_OFFLINE_MS,
  MINUTE_MS,
  MONSTERS,
  OFFLINE_EFFICIENCY,
  ROUTES,
  TIMELINE,
  TRAINER_LEVEL_THRESHOLDS,
  TRAINER_NODES,
  type TimelineMilestone,
} from "./game-content.js";
import {
  GAME_SCHEMA_VERSION,
  InvalidGameActionError,
  RevisionConflictError,
  type CommandEnvelope,
  type CommandResult,
  type GameAction,
  type GameEvent,
  type GameSnapshot,
  type GearItem,
  type GearQuality,
  type GearSlot,
  type GearTrait,
  type MonsterId,
  type PendingChoice,
  type PreferenceCommand,
  type Signal,
  type SyncCommand,
  type TokenUsageEvent,
} from "./game-types.js";

const MAX_REMEMBERED_COMMANDS = 256;
const MAX_REMEMBERED_TOKEN_EVENTS = 2_048;
const MAX_PENDING_EVENTS = 128;
const CHALLENGE_RETRY_MS = 30 * MINUTE_MS;

export interface AdvanceOptions {
  efficiency?: number;
  maxElapsedMs?: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function stableHash(source: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function stableIndex(source: string, size: number): number {
  return stableHash(source) % size;
}

function trimHistory(values: string[], maximum: number): string[] {
  return values.length <= maximum ? values : values.slice(values.length - maximum);
}

function nextEventId(snapshot: GameSnapshot, source: string, kind: string): string {
  return `event:${source}:${kind}`;
}

function addEvent(
  snapshot: GameSnapshot,
  source: string,
  kind: GameEvent["kind"],
  payload: GameEvent["payload"] = {},
): void {
  const event: GameEvent = {
    id: nextEventId(snapshot, source, kind),
    kind,
    createdAtEffectiveMs: snapshot.elapsed.effectiveMs,
    payload,
  };
  const existingIndex = snapshot.pendingEvents.findIndex((entry) => entry.id === event.id);
  if (existingIndex >= 0) snapshot.pendingEvents[existingIndex] = event;
  else snapshot.pendingEvents.push(event);
  if (snapshot.pendingEvents.length > MAX_PENDING_EVENTS) {
    snapshot.pendingEvents.splice(0, snapshot.pendingEvents.length - MAX_PENDING_EVENTS);
  }
}

function blankEquipped(): Record<GearSlot, string | null> {
  return { charm: null, harness: null, crest: null, talisman: null };
}

export function createInitialSnapshot(
  now: Date = new Date(),
  seed = "monster-expedition-demo",
): GameSnapshot {
  const timestamp = now.toISOString();
  return {
    schemaVersion: GAME_SCHEMA_VERSION,
    revision: 0,
    seed,
    createdAt: timestamp,
    lastSimulatedAt: timestamp,
    elapsed: { realMs: 0, effectiveMs: 0 },
    locale: "en",
    preferences: {
      locale: "en",
      soundEnabled: true,
      reducedMotion: false,
      displayMode: "fullscreen",
    },
    codexLink: { state: "not-configured" },
    trainer: {
      name: null,
      level: 1,
      xp: 0,
      unspentSkillPoints: 0,
      unlockedNodeIds: [],
      command: "rally",
    },
    monsters: {
      hammerpaw: {
        speciesId: "hammerpaw",
        name: null,
        befriended: true,
        level: 1,
        xp: 0,
        encounterAttempts: 0,
      },
      swiftwing: {
        speciesId: "swiftwing",
        name: null,
        befriended: false,
        level: 1,
        xp: 0,
        encounterAttempts: 0,
      },
      mosshide: {
        speciesId: "mosshide",
        name: null,
        befriended: false,
        level: 1,
        xp: 0,
        encounterAttempts: 0,
      },
      bellhorn: {
        speciesId: "bellhorn",
        name: null,
        befriended: false,
        level: 1,
        xp: 0,
        encounterAttempts: 0,
      },
    },
    team: {
      activeMonsterIds: ["hammerpaw"],
      leadMonsterId: "hammerpaw",
      maxSlots: 1,
      synergy: { active: false, signal: null, bonus: 0 },
    },
    resources: {
      gold: 0,
      gearMaterials: { common: 0, refined: 0, legendary: 0 },
      speciesObservation: {
        hammerpaw: 1,
        swiftwing: 0,
        mosshide: 0,
        bellhorn: 0,
      },
    },
    expedition: {
      routeId: "windmill-plains",
      routeIndex: 0,
      progress: 0,
      status: "traveling",
      completedRouteIds: [],
      bossInsight: 0,
      defeatedChallengeIds: [],
      activeChallenge: null,
    },
    gear: { inventory: [], equipped: blankEquipped() },
    camp: {
      available: false,
      unlockedNodeIds: [],
      resetAvailable: true,
      spentGold: 0,
    },
    bond: {
      threshold: 100_000,
      currentTokens: 0,
      charges: 0,
      maxCharges: 2,
      totalAcceptedTokens: 0,
    },
    petState: "traveling",
    pendingEncounters: [],
    pendingChoices: [],
    pendingEvents: [],
    processedMilestoneIds: [],
    processedTokenEventIds: [],
    processedCommandIds: [],
    completed: false,
  };
}

export function cloneSnapshot(snapshot: GameSnapshot): GameSnapshot {
  return structuredClone(snapshot);
}

function updateSynergy(snapshot: GameSnapshot): void {
  const [leaderId, followerId] = snapshot.team.activeMonsterIds;
  if (!leaderId || !followerId) {
    snapshot.team.synergy = { active: false, signal: null, bonus: 0 };
    return;
  }
  const leader = MONSTERS[leaderId];
  const follower = MONSTERS[followerId];
  const active = follower.respondsTo === leader.signal;
  snapshot.team.synergy = {
    active,
    signal: active ? follower.signal : null,
    bonus: active ? 3 : 0,
  };
}

function updatePetState(snapshot: GameSnapshot): void {
  if (
    snapshot.codexLink.state === "unavailable" ||
    snapshot.codexLink.state === "config-conflict"
  ) {
    snapshot.petState = "link-unavailable";
  } else if (snapshot.pendingChoices.length > 0) {
    snapshot.petState = "reward-ready";
  } else if (snapshot.expedition.status === "training") {
    snapshot.petState = "training";
  } else if (snapshot.expedition.activeChallenge) {
    snapshot.petState = "elite-alert";
  } else if (snapshot.bond.charges > 0) {
    snapshot.petState = "bond-ready";
  } else {
    snapshot.petState = "traveling";
  }
}

function normalizeName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (normalized.length < 1 || [...normalized].length > 24) {
    throw new InvalidGameActionError("Names must contain between 1 and 24 characters.");
  }
  return normalized;
}

function gearQualityPower(quality: GearQuality): number {
  return GEAR_QUALITY_ORDER.indexOf(quality) + 1;
}

export function calculateTeamPower(snapshot: GameSnapshot): number {
  const monsterPower = snapshot.team.activeMonsterIds.reduce(
    (total, monsterId) => total + snapshot.monsters[monsterId].level * 1.2,
    0,
  );
  const gearPower = Object.values(snapshot.gear.equipped).reduce((total, gearId) => {
    const item = snapshot.gear.inventory.find((entry) => entry.id === gearId);
    return total + (item ? gearQualityPower(item.quality) : 0);
  }, 0);
  const trainerNodePower = snapshot.trainer.unlockedNodeIds.filter(
    (nodeId) => nodeId !== "dual-command",
  ).length;
  const campPower = snapshot.camp.unlockedNodeIds.length * 0.5;
  return (
    2 +
    snapshot.trainer.level +
    monsterPower +
    gearPower +
    snapshot.team.synergy.bonus +
    trainerNodePower +
    campPower
  );
}

function gearId(sourceId: string, baseId: string, quality: GearQuality): string {
  return `gear:${sourceId}:${baseId}:${quality}`;
}

function awardGear(
  snapshot: GameSnapshot,
  sourceId: string,
  baseId: string,
  quality: GearQuality,
  traits: GearTrait[],
): GearItem | null {
  const base = GEAR_BASES.find((entry) => entry.id === baseId);
  if (!base) throw new InvalidGameActionError(`Unknown gear base: ${baseId}.`);
  const duplicate = snapshot.gear.inventory.some(
    (entry) => entry.baseId === baseId && entry.quality === quality,
  );
  if (duplicate) {
    snapshot.resources.gearMaterials[quality] += 1;
    return null;
  }
  const item: GearItem = {
    id: gearId(sourceId, baseId, quality),
    baseId,
    slot: base.slot,
    quality,
    traits: [...new Set(traits)],
    locked: false,
    acquiredAtEffectiveMs: snapshot.elapsed.effectiveMs,
  };
  snapshot.gear.inventory.push(item);
  addEvent(snapshot, sourceId, "gear-found", {
    gearId: item.id,
    baseId,
    quality,
  });
  return item;
}

function optionTraits(snapshot: GameSnapshot, sourceId: string, count: number): GearTrait[] {
  const start = stableIndex(`${snapshot.seed}:${sourceId}:trait`, GEAR_TRAITS.length);
  return Array.from(
    { length: count },
    (_, offset) => GEAR_TRAITS[(start + offset) % GEAR_TRAITS.length]!,
  );
}

function createGearChoice(
  snapshot: GameSnapshot,
  sourceId: string,
  kind: "bonus-gear" | "regular-gear",
): void {
  const choiceId = `choice:${sourceId}:${kind}`;
  if (snapshot.pendingChoices.some((choice) => choice.id === choiceId)) return;
  const baseStart = stableIndex(`${snapshot.seed}:${sourceId}:base`, GEAR_BASES.length);
  const traits = optionTraits(snapshot, sourceId, 3);
  const quality: GearQuality =
    snapshot.elapsed.effectiveMs >= 16 * HOUR_MS
      ? "legendary"
      : snapshot.elapsed.effectiveMs >= 4 * HOUR_MS
        ? "refined"
        : "common";
  snapshot.pendingChoices.push({
    id: choiceId,
    kind,
    sourceId,
    options: Array.from({ length: 3 }, (_, offset) => {
      const base = GEAR_BASES[(baseStart + offset) % GEAR_BASES.length]!;
      return {
        id: `${choiceId}:option:${offset + 1}`,
        kind: "gear" as const,
        baseId: base.id,
        slot: base.slot,
        quality,
        trait: traits[offset]!,
      };
    }),
  });
  addEvent(snapshot, sourceId, "reward-ready", { choiceId, bonus: kind === "bonus-gear" });
}

function levelFromXp(xp: number): number {
  return 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 30));
}

function accruePassiveProgress(snapshot: GameSnapshot, targetEffectiveMs: number): void {
  const previous = snapshot.elapsed.effectiveMs;
  if (targetEffectiveMs <= previous) return;

  const previousMinutes = Math.floor(previous / MINUTE_MS);
  const currentMinutes = Math.floor(targetEffectiveMs / MINUTE_MS);
  const gainedMinutes = currentMinutes - previousMinutes;
  snapshot.trainer.xp += gainedMinutes;
  const oldLevel = snapshot.trainer.level;
  snapshot.trainer.level =
    1 + TRAINER_LEVEL_THRESHOLDS.filter((threshold) => snapshot.trainer.xp >= threshold).length;
  if (snapshot.trainer.level > oldLevel) {
    const levelsGained = snapshot.trainer.level - oldLevel;
    snapshot.trainer.unspentSkillPoints += levelsGained;
    addEvent(snapshot, `trainer-level-${snapshot.trainer.level}`, "trainer-level", {
      level: snapshot.trainer.level,
      skillPoints: levelsGained,
    });
  }

  for (const monsterId of snapshot.team.activeMonsterIds) {
    const monster = snapshot.monsters[monsterId];
    monster.xp += gainedMinutes;
    monster.level = levelFromXp(monster.xp);
  }

  const previousGoldTicks = Math.floor(previous / (5 * MINUTE_MS));
  const currentGoldTicks = Math.floor(targetEffectiveMs / (5 * MINUTE_MS));
  snapshot.resources.gold += (currentGoldTicks - previousGoldTicks) * 10;

  const previousGearTicks = Math.floor(previous / (2 * HOUR_MS));
  const currentGearTicks = Math.floor(targetEffectiveMs / (2 * HOUR_MS));
  for (let tick = previousGearTicks + 1; tick <= currentGearTicks; tick += 1) {
    const sourceId = `trail-drop-${tick}`;
    const base = GEAR_BASES[stableIndex(`${snapshot.seed}:${sourceId}`, GEAR_BASES.length)]!;
    const quality: GearQuality = tick >= 8 ? "refined" : "common";
    awardGear(snapshot, sourceId, base.id, quality, [optionTraits(snapshot, sourceId, 1)[0]!]);
  }

  snapshot.elapsed.effectiveMs = targetEffectiveMs;
}

function processMilestone(snapshot: GameSnapshot, milestone: TimelineMilestone): void {
  snapshot.processedMilestoneIds.push(milestone.id);
  if (milestone.kind === "starter-gear") {
    const item = awardGear(
      snapshot,
      milestone.id,
      "sun-thread-charm",
      "common",
      ["resonant"],
    );
    if (item) snapshot.gear.equipped.charm = item.id;
    return;
  }
  if (milestone.kind === "encounter" && milestone.speciesId) {
    const encounterId = `encounter:${milestone.id}`;
    if (!snapshot.monsters[milestone.speciesId].befriended) {
      snapshot.pendingEncounters.push({
        id: encounterId,
        speciesId: milestone.speciesId,
        effectiveAtMs: milestone.atMs,
      });
      addEvent(snapshot, milestone.id, "monster-encounter", {
        encounterId,
        speciesId: milestone.speciesId,
      });
    }
    return;
  }
  if (milestone.kind === "camp") {
    snapshot.camp.available = true;
    addEvent(snapshot, milestone.id, "camp-opened");
    return;
  }
  if (milestone.kind === "route" && milestone.routeId) {
    const previousRoute = snapshot.expedition.routeId;
    if (!snapshot.expedition.completedRouteIds.includes(previousRoute)) {
      snapshot.expedition.completedRouteIds.push(previousRoute);
    }
    snapshot.expedition.routeId = milestone.routeId;
    snapshot.expedition.routeIndex = ROUTES.findIndex((route) => route.id === milestone.routeId);
    addEvent(snapshot, milestone.id, "route-entered", { routeId: milestone.routeId });
    return;
  }
  if (milestone.kind === "challenge" && milestone.challenge) {
    startOrResolveChallenge(snapshot, milestone);
  }
}

function adjustedChallengePower(snapshot: GameSnapshot, requiredPower: number, kind: "elite" | "boss"): number {
  if (kind !== "boss") return requiredPower;
  return requiredPower * (1 - snapshot.expedition.bossInsight / 100);
}

function completeChallenge(
  snapshot: GameSnapshot,
  challenge: NonNullable<TimelineMilestone["challenge"]>,
  challengeId: string,
  usedBurst: boolean,
): void {
  if (!snapshot.expedition.defeatedChallengeIds.includes(challengeId)) {
    snapshot.expedition.defeatedChallengeIds.push(challengeId);
  }
  snapshot.expedition.activeChallenge = null;
  snapshot.expedition.status = "traveling";
  addEvent(snapshot, challengeId, "challenge-won", {
    challengeId,
    kind: challenge.kind,
    stage: challenge.stage,
    usedBurst,
  });
  createGearChoice(snapshot, challengeId, "regular-gear");
  if (usedBurst) {
    addEvent(snapshot, challengeId, "bond-burst", {
      challengeId,
      stage: challenge.stage,
    });
    createGearChoice(snapshot, `bond:${challengeId}`, "bonus-gear");
  }
  if (challenge.kind === "boss" && challenge.stage === 3) {
    snapshot.completed = true;
    snapshot.expedition.status = "complete";
    snapshot.expedition.progress = 1;
    if (!snapshot.expedition.completedRouteIds.includes("ridge-pass")) {
      snapshot.expedition.completedRouteIds.push("ridge-pass");
    }
    addEvent(snapshot, "ridge-market", "expedition-complete", {
      destination: "ridge-market",
    });
  }
}

function failChallenge(
  snapshot: GameSnapshot,
  challenge: NonNullable<TimelineMilestone["challenge"]>,
  challengeId: string,
  failures: number,
): void {
  if (challenge.kind === "boss") {
    snapshot.expedition.bossInsight = Math.min(30, snapshot.expedition.bossInsight + 10);
  }
  snapshot.expedition.status = "training";
  snapshot.expedition.activeChallenge = {
    id: challengeId,
    kind: challenge.kind,
    stage: challenge.stage,
    requiredPower: challenge.requiredPower,
    nextRetryAtEffectiveMs: snapshot.elapsed.effectiveMs + CHALLENGE_RETRY_MS,
    failures,
  };
  addEvent(snapshot, `${challengeId}:failure:${failures}`, "challenge-failed", {
    challengeId,
    failures,
    bossInsight: snapshot.expedition.bossInsight,
  });
}

function resolveChallenge(
  snapshot: GameSnapshot,
  challenge: NonNullable<TimelineMilestone["challenge"]>,
  challengeId: string,
  failures: number,
): void {
  addEvent(snapshot, `${challengeId}:alert`, "challenge-alert", {
    challengeId,
    kind: challenge.kind,
    stage: challenge.stage,
  });
  const usedBurst = snapshot.bond.charges > 0;
  if (usedBurst) snapshot.bond.charges -= 1;
  const succeeds =
    usedBurst ||
    calculateTeamPower(snapshot) >=
      adjustedChallengePower(snapshot, challenge.requiredPower, challenge.kind);
  if (succeeds) completeChallenge(snapshot, challenge, challengeId, usedBurst);
  else failChallenge(snapshot, challenge, challengeId, failures);
}

function startOrResolveChallenge(snapshot: GameSnapshot, milestone: TimelineMilestone): void {
  if (!milestone.challenge) return;
  resolveChallenge(snapshot, milestone.challenge, milestone.id, 1);
}

function retryActiveChallenge(snapshot: GameSnapshot): void {
  const active = snapshot.expedition.activeChallenge;
  if (!active) return;
  resolveChallenge(
    snapshot,
    { kind: active.kind, stage: active.stage, requiredPower: active.requiredPower },
    active.id,
    active.failures + 1,
  );
}

function nextUnprocessedMilestone(snapshot: GameSnapshot, target: number): TimelineMilestone | null {
  if (snapshot.expedition.activeChallenge) return null;
  return (
    TIMELINE.find(
      (milestone) =>
        milestone.atMs <= target && !snapshot.processedMilestoneIds.includes(milestone.id),
    ) ?? null
  );
}

function updateRouteProgress(snapshot: GameSnapshot): void {
  const route = ROUTES[snapshot.expedition.routeIndex] ?? ROUTES[0]!;
  snapshot.expedition.progress = snapshot.completed
    ? 1
    : clamp(
        (snapshot.elapsed.effectiveMs - route.startsAtMs) /
          (route.endsAtMs - route.startsAtMs),
        0,
        0.999,
      );
}

export function advanceGame(
  input: GameSnapshot,
  now: Date,
  options: AdvanceOptions = {},
): GameSnapshot {
  const snapshot = cloneSnapshot(input);
  const last = Date.parse(snapshot.lastSimulatedAt);
  if (!Number.isFinite(last)) throw new Error("Snapshot contains an invalid lastSimulatedAt timestamp.");
  const requestedElapsed = Math.max(0, now.getTime() - last);
  const cappedRealElapsed = Math.min(
    requestedElapsed,
    options.maxElapsedMs ?? MAX_OFFLINE_MS,
  );
  const efficiency = clamp(options.efficiency ?? OFFLINE_EFFICIENCY, 0, 1);
  const targetEffective =
    snapshot.elapsed.effectiveMs + Math.floor(cappedRealElapsed * efficiency);
  snapshot.elapsed.realMs += cappedRealElapsed;
  snapshot.lastSimulatedAt = now.toISOString();

  while (snapshot.elapsed.effectiveMs < targetEffective) {
    const milestone = nextUnprocessedMilestone(snapshot, targetEffective);
    const retryAt = snapshot.expedition.activeChallenge?.nextRetryAtEffectiveMs;
    const milestoneAt = milestone ? Math.max(snapshot.elapsed.effectiveMs, milestone.atMs) : null;
    let nextAt = targetEffective;
    let nextKind: "milestone" | "retry" | null = null;
    if (milestoneAt !== null && milestoneAt <= nextAt) {
      nextAt = milestoneAt;
      nextKind = "milestone";
    }
    if (retryAt !== undefined && retryAt <= nextAt) {
      nextAt = retryAt;
      nextKind = "retry";
    }
    accruePassiveProgress(snapshot, nextAt);
    if (nextKind === "milestone" && milestone) processMilestone(snapshot, milestone);
    else if (nextKind === "retry") retryActiveChallenge(snapshot);
    else break;
  }
  accruePassiveProgress(snapshot, targetEffective);
  updateRouteProgress(snapshot);
  updateSynergy(snapshot);

  if (cappedRealElapsed >= 15 * MINUTE_MS) {
    addEvent(snapshot, `offline:${last}:${now.getTime()}`, "offline-return", {
      realMs: cappedRealElapsed,
      effectiveMs: Math.floor(cappedRealElapsed * efficiency),
      capped: requestedElapsed > cappedRealElapsed,
    });
  }
  updatePetState(snapshot);
  return snapshot;
}

export function applyTokenEvents(
  input: GameSnapshot,
  events: readonly TokenUsageEvent[],
): GameSnapshot {
  const snapshot = cloneSnapshot(input);
  const seen = new Set(snapshot.processedTokenEventIds);
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    snapshot.processedTokenEventIds.push(event.id);
    if (!Number.isSafeInteger(event.totalTokens) || event.totalTokens <= 0) continue;
    const availableCapacity =
      (snapshot.bond.maxCharges - snapshot.bond.charges) * snapshot.bond.threshold -
      snapshot.bond.currentTokens;
    const accepted = Math.min(event.totalTokens, Math.max(0, availableCapacity));
    snapshot.bond.totalAcceptedTokens += accepted;
    snapshot.bond.currentTokens += accepted;
    while (
      snapshot.bond.currentTokens >= snapshot.bond.threshold &&
      snapshot.bond.charges < snapshot.bond.maxCharges
    ) {
      snapshot.bond.currentTokens -= snapshot.bond.threshold;
      snapshot.bond.charges += 1;
      addEvent(snapshot, `bond-ready:${event.id}:${snapshot.bond.charges}`, "bond-ready", {
        charges: snapshot.bond.charges,
      });
    }
    if (snapshot.bond.charges === snapshot.bond.maxCharges) {
      snapshot.bond.currentTokens = 0;
    }
  }
  snapshot.processedTokenEventIds = trimHistory(
    snapshot.processedTokenEventIds,
    MAX_REMEMBERED_TOKEN_EVENTS,
  );
  updatePetState(snapshot);
  return snapshot;
}

function ensureCommand(snapshot: GameSnapshot, commandId: string, expectedRevision: number): boolean {
  if (snapshot.processedCommandIds.includes(commandId)) return true;
  if (snapshot.revision !== expectedRevision) throw new RevisionConflictError(snapshot.revision);
  return false;
}

function finalizeCommand(snapshot: GameSnapshot, commandId: string): CommandResult {
  snapshot.revision += 1;
  snapshot.processedCommandIds.push(commandId);
  snapshot.processedCommandIds = trimHistory(
    snapshot.processedCommandIds,
    MAX_REMEMBERED_COMMANDS,
  );
  updateSynergy(snapshot);
  updatePetState(snapshot);
  return { snapshot, duplicate: false };
}

function findGear(snapshot: GameSnapshot, gearIdValue: string): GearItem {
  const item = snapshot.gear.inventory.find((entry) => entry.id === gearIdValue);
  if (!item) throw new InvalidGameActionError(`Gear item ${gearIdValue} does not exist.`);
  return item;
}

function setTeam(snapshot: GameSnapshot, monsterIds: MonsterId[], leadMonsterId: MonsterId): void {
  if (monsterIds.length < 1 || monsterIds.length > snapshot.team.maxSlots) {
    throw new InvalidGameActionError(`The current team supports ${snapshot.team.maxSlots} monster slot(s).`);
  }
  if (new Set(monsterIds).size !== monsterIds.length) {
    throw new InvalidGameActionError("A monster can occupy only one team slot.");
  }
  if (!monsterIds.includes(leadMonsterId)) {
    throw new InvalidGameActionError("The lead monster must be in the active team.");
  }
  if (monsterIds.some((monsterId) => !snapshot.monsters[monsterId].befriended)) {
    throw new InvalidGameActionError("Only befriended monsters can join the active team.");
  }
  const ordered = [leadMonsterId, ...monsterIds.filter((id) => id !== leadMonsterId)];
  snapshot.team.activeMonsterIds = ordered;
  snapshot.team.leadMonsterId = leadMonsterId;
}

function attemptBefriend(snapshot: GameSnapshot, encounterId: string): void {
  const index = snapshot.pendingEncounters.findIndex((entry) => entry.id === encounterId);
  if (index < 0) throw new InvalidGameActionError("That monster encounter is no longer available.");
  const encounter = snapshot.pendingEncounters.splice(index, 1)[0]!;
  const monster = snapshot.monsters[encounter.speciesId];
  snapshot.resources.speciesObservation[encounter.speciesId] += 1;
  if (monster.befriended) return;
  monster.encounterAttempts += 1;
  const tutorialSuccess = encounter.speciesId === "swiftwing" && monster.encounterAttempts >= 2;
  const pitySuccess = encounter.speciesId !== "swiftwing" && monster.encounterAttempts >= 3;
  const roll =
    stableHash(`${snapshot.seed}:${encounter.speciesId}:${monster.encounterAttempts}`) /
    0x1_0000_0000;
  const success = tutorialSuccess || pitySuccess || (encounter.speciesId !== "swiftwing" && roll < 0.3);
  if (!success) {
    addEvent(snapshot, encounter.id, "monster-befriend-failed", {
      speciesId: encounter.speciesId,
      attempt: monster.encounterAttempts,
    });
    return;
  }
  monster.befriended = true;
  addEvent(snapshot, encounter.id, "monster-befriended", {
    speciesId: encounter.speciesId,
    attempt: monster.encounterAttempts,
  });
  if (
    snapshot.team.maxSlots === 2 &&
    snapshot.team.activeMonsterIds.length === 1
  ) {
    snapshot.team.activeMonsterIds.push(encounter.speciesId);
  }
}

function unlockTrainerNode(snapshot: GameSnapshot, nodeId: string): void {
  const node = TRAINER_NODES[nodeId];
  if (!node) throw new InvalidGameActionError(`Unknown Trainer node: ${nodeId}.`);
  if (snapshot.trainer.unlockedNodeIds.includes(nodeId)) {
    throw new InvalidGameActionError("That Trainer node is already unlocked.");
  }
  if (node.requires && !snapshot.trainer.unlockedNodeIds.includes(node.requires)) {
    throw new InvalidGameActionError(`Trainer node ${nodeId} requires ${node.requires}.`);
  }
  if (snapshot.trainer.unspentSkillPoints < node.cost) {
    throw new InvalidGameActionError("Not enough Trainer skill points.");
  }
  snapshot.trainer.unspentSkillPoints -= node.cost;
  snapshot.trainer.unlockedNodeIds.push(nodeId);
  if (nodeId === "dual-command") {
    snapshot.team.maxSlots = 2;
    const companion = (Object.keys(snapshot.monsters) as MonsterId[]).find(
      (monsterId) =>
        monsterId !== snapshot.team.leadMonsterId && snapshot.monsters[monsterId].befriended,
    );
    if (companion && snapshot.team.activeMonsterIds.length === 1) {
      snapshot.team.activeMonsterIds.push(companion);
    }
  }
}

function unlockCampNode(snapshot: GameSnapshot, nodeId: string): void {
  if (!snapshot.camp.available) throw new InvalidGameActionError("The camp is not open yet.");
  const node = CAMP_NODES[nodeId];
  if (!node) throw new InvalidGameActionError(`Unknown camp node: ${nodeId}.`);
  if (snapshot.camp.unlockedNodeIds.includes(nodeId)) {
    throw new InvalidGameActionError("That camp node is already unlocked.");
  }
  if (node.requires && !snapshot.camp.unlockedNodeIds.includes(node.requires)) {
    throw new InvalidGameActionError(`Camp node ${nodeId} requires ${node.requires}.`);
  }
  if (snapshot.resources.gold < node.cost) {
    throw new InvalidGameActionError("Not enough Gold.");
  }
  snapshot.resources.gold -= node.cost;
  snapshot.camp.spentGold += node.cost;
  snapshot.camp.unlockedNodeIds.push(nodeId);
}

function chooseReward(snapshot: GameSnapshot, choiceId: string, optionId: string): void {
  const choiceIndex = snapshot.pendingChoices.findIndex((entry) => entry.id === choiceId);
  if (choiceIndex < 0) throw new InvalidGameActionError("That reward choice is no longer available.");
  const choice = snapshot.pendingChoices[choiceIndex]!;
  const option = choice.options.find((entry) => entry.id === optionId);
  if (!option) throw new InvalidGameActionError("That reward option does not belong to the choice.");
  if (choice.kind === "upgrade-trait") {
    if (option.kind !== "trait") throw new InvalidGameActionError("Expected a gear trait option.");
    const item = findGear(snapshot, choice.gearId);
    if (!item.traits.includes(option.trait)) item.traits.push(option.trait);
  } else {
    if (option.kind !== "gear") throw new InvalidGameActionError("Expected a gear reward option.");
    awardGear(
      snapshot,
      `${choice.id}:${option.id}`,
      option.baseId,
      option.quality,
      [option.trait],
    );
  }
  snapshot.pendingChoices.splice(choiceIndex, 1);
}

function upgradeGear(snapshot: GameSnapshot, gearIdValue: string): void {
  const item = findGear(snapshot, gearIdValue);
  if (!item.locked) {
    throw new InvalidGameActionError("Lock a gear base before upgrading it.");
  }
  const qualityIndex = GEAR_QUALITY_ORDER.indexOf(item.quality);
  if (qualityIndex >= GEAR_QUALITY_ORDER.length - 1) {
    throw new InvalidGameActionError("Legendary gear cannot be upgraded further.");
  }
  if (snapshot.resources.gearMaterials[item.quality] < 5) {
    throw new InvalidGameActionError(`Upgrading requires 5 ${item.quality} Gear Materials.`);
  }
  snapshot.resources.gearMaterials[item.quality] -= 5;
  item.quality = GEAR_QUALITY_ORDER[qualityIndex + 1]!;
  const choiceId = `choice:upgrade:${item.id}:${item.quality}`;
  const existingTraits = new Set(item.traits);
  const candidates = optionTraits(snapshot, choiceId, GEAR_TRAITS.length).filter(
    (trait) => !existingTraits.has(trait),
  );
  snapshot.pendingChoices.push({
    id: choiceId,
    kind: "upgrade-trait",
    sourceId: item.id,
    gearId: item.id,
    options: candidates.slice(0, 3).map((trait, index) => ({
      id: `${choiceId}:option:${index + 1}`,
      kind: "trait",
      trait,
    })),
  });
}

function applyActionMutable(snapshot: GameSnapshot, action: GameAction): void {
  switch (action.type) {
    case "rename_trainer":
      snapshot.trainer.name = normalizeName(action.name);
      return;
    case "rename_monster":
      if (!snapshot.monsters[action.monsterId].befriended) {
        throw new InvalidGameActionError("Only befriended monsters can be named.");
      }
      snapshot.monsters[action.monsterId].name = normalizeName(action.name);
      return;
    case "unlock_trainer_node":
      unlockTrainerNode(snapshot, action.nodeId);
      return;
    case "set_team":
      setTeam(snapshot, action.monsterIds, action.leadMonsterId);
      return;
    case "attempt_befriend":
      attemptBefriend(snapshot, action.encounterId);
      return;
    case "equip_gear": {
      const item = findGear(snapshot, action.gearId);
      snapshot.gear.equipped[item.slot] = item.id;
      return;
    }
    case "lock_gear":
      findGear(snapshot, action.gearId).locked = action.locked;
      return;
    case "salvage_gear": {
      const item = findGear(snapshot, action.gearId);
      if (item.locked) throw new InvalidGameActionError("Locked gear cannot be salvaged.");
      if (Object.values(snapshot.gear.equipped).includes(item.id)) {
        throw new InvalidGameActionError("Equipped gear cannot be salvaged.");
      }
      snapshot.gear.inventory = snapshot.gear.inventory.filter((entry) => entry.id !== item.id);
      snapshot.resources.gearMaterials[item.quality] += 1;
      return;
    }
    case "upgrade_gear":
      upgradeGear(snapshot, action.gearId);
      return;
    case "choose_reward":
      chooseReward(snapshot, action.choiceId, action.optionId);
      return;
    case "unlock_camp_node":
      unlockCampNode(snapshot, action.nodeId);
      return;
    case "reset_camp_tree":
      if (!snapshot.camp.resetAvailable) {
        throw new InvalidGameActionError("The free camp reset has already been used.");
      }
      snapshot.resources.gold += snapshot.camp.spentGold;
      snapshot.camp.spentGold = 0;
      snapshot.camp.unlockedNodeIds = [];
      snapshot.camp.resetAvailable = false;
      return;
    case "acknowledge_events": {
      const acknowledged = new Set(action.eventIds);
      snapshot.pendingEvents = snapshot.pendingEvents.filter(
        (event) => !acknowledged.has(event.id),
      );
      return;
    }
  }
}

export function applyGameCommand(input: GameSnapshot, command: CommandEnvelope): CommandResult {
  if (ensureCommand(input, command.commandId, command.expectedRevision)) {
    return { snapshot: cloneSnapshot(input), duplicate: true };
  }
  const snapshot = cloneSnapshot(input);
  applyActionMutable(snapshot, command.action);
  return finalizeCommand(snapshot, command.commandId);
}

export function applyPreferenceCommand(
  input: GameSnapshot,
  command: PreferenceCommand,
): CommandResult {
  if (ensureCommand(input, command.commandId, command.expectedRevision)) {
    return { snapshot: cloneSnapshot(input), duplicate: true };
  }
  const snapshot = cloneSnapshot(input);
  if (command.preferences.locale !== undefined) {
    snapshot.locale = command.preferences.locale;
    snapshot.preferences.locale = command.preferences.locale;
  }
  if (command.preferences.soundEnabled !== undefined) {
    snapshot.preferences.soundEnabled = command.preferences.soundEnabled;
  }
  if (command.preferences.reducedMotion !== undefined) {
    snapshot.preferences.reducedMotion = command.preferences.reducedMotion;
  }
  if (command.preferences.displayMode !== undefined) {
    snapshot.preferences.displayMode = command.preferences.displayMode;
  }
  if (command.preferences.codexLinkState !== undefined) {
    snapshot.codexLink.state = command.preferences.codexLinkState;
  }
  return finalizeCommand(snapshot, command.commandId);
}

export function applySyncCommand(
  input: GameSnapshot,
  command: SyncCommand,
  now: Date,
  options: AdvanceOptions = {},
): CommandResult {
  if (ensureCommand(input, command.commandId, command.expectedRevision)) {
    return { snapshot: cloneSnapshot(input), duplicate: true };
  }
  let snapshot = applyTokenEvents(input, command.tokenEvents ?? []);
  snapshot = advanceGame(snapshot, now, options);
  return finalizeCommand(snapshot, command.commandId);
}

export function diagnosticSummary(snapshot: GameSnapshot): Record<string, unknown> {
  return {
    schemaVersion: snapshot.schemaVersion,
    revision: snapshot.revision,
    elapsedRealMs: snapshot.elapsed.realMs,
    elapsedEffectiveMs: snapshot.elapsed.effectiveMs,
    routeId: snapshot.expedition.routeId,
    routeProgress: snapshot.expedition.progress,
    completed: snapshot.completed,
    befriendedSpecies: Object.values(snapshot.monsters)
      .filter((monster) => monster.befriended)
      .map((monster) => monster.speciesId),
    teamSize: snapshot.team.activeMonsterIds.length,
    trainerLevel: snapshot.trainer.level,
    gearCount: snapshot.gear.inventory.length,
    bondCharges: snapshot.bond.charges,
    bondProgress: snapshot.bond.currentTokens,
    codexLinkState: snapshot.codexLink.state,
    pendingEventCount: snapshot.pendingEvents.length,
    pendingChoiceCount: snapshot.pendingChoices.length,
  };
}

export function synergyForPair(leaderId: MonsterId, followerId: MonsterId): {
  active: boolean;
  signal: Signal | null;
} {
  const active = MONSTERS[followerId].respondsTo === MONSTERS[leaderId].signal;
  return { active, signal: active ? MONSTERS[followerId].signal : null };
}
