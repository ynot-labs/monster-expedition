export const GAME_SCHEMA_VERSION = 1 as const;

export type Locale = "en" | "zh-CN";
export type CodexLinkState =
  | "not-configured"
  | "restart-required"
  | "connected"
  | "config-conflict"
  | "unavailable";
export type PetState =
  | "traveling"
  | "bond-ready"
  | "elite-alert"
  | "bursting"
  | "reward-ready"
  | "training"
  | "offline-return"
  | "link-unavailable";
export type Signal = "break" | "pursuit" | "guard" | "echo";
export type MonsterId = "hammerpaw" | "swiftwing" | "mosshide" | "bellhorn";
export type RouteId = "windmill-plains" | "mistwood-trail" | "ridge-pass";
export type GearSlot = "charm" | "harness" | "crest" | "talisman";
export type GearQuality = "common" | "refined" | "legendary";
export type GearTrait =
  | "quickened"
  | "stalwart"
  | "watchful"
  | "resonant"
  | "fortunate"
  | "unyielding";

export interface MonsterDefinition {
  id: MonsterId;
  nameKey: string;
  signatureKey: string;
  signal: Signal;
  respondsTo: Signal;
}

export interface MonsterState {
  speciesId: MonsterId;
  name: string | null;
  befriended: boolean;
  level: number;
  xp: number;
  encounterAttempts: number;
}

export interface GearItem {
  id: string;
  baseId: string;
  slot: GearSlot;
  quality: GearQuality;
  traits: GearTrait[];
  locked: boolean;
  acquiredAtEffectiveMs: number;
}

export interface RewardGearOption {
  id: string;
  kind: "gear";
  baseId: string;
  slot: GearSlot;
  quality: GearQuality;
  trait: GearTrait;
}

export interface TraitOption {
  id: string;
  kind: "trait";
  trait: GearTrait;
}

export type PendingChoice =
  | {
      id: string;
      kind: "bonus-gear" | "regular-gear";
      sourceId: string;
      options: RewardGearOption[];
    }
  | {
      id: string;
      kind: "upgrade-trait";
      sourceId: string;
      gearId: string;
      options: TraitOption[];
    };

export interface PendingEncounter {
  id: string;
  speciesId: Exclude<MonsterId, "hammerpaw">;
  effectiveAtMs: number;
}

export type ChallengeKind = "elite" | "boss";
export interface ActiveChallenge {
  id: string;
  kind: ChallengeKind;
  stage: number;
  requiredPower: number;
  nextRetryAtEffectiveMs: number;
  failures: number;
}

export type GameEventKind =
  | "gear-found"
  | "monster-encounter"
  | "monster-befriended"
  | "monster-befriend-failed"
  | "trainer-level"
  | "camp-opened"
  | "route-entered"
  | "challenge-alert"
  | "challenge-failed"
  | "challenge-won"
  | "bond-ready"
  | "bond-burst"
  | "reward-ready"
  | "offline-return"
  | "expedition-complete";

export interface GameEvent {
  id: string;
  kind: GameEventKind;
  createdAtEffectiveMs: number;
  payload: Record<string, string | number | boolean | null>;
}

export interface TokenUsageEvent {
  id: string;
  totalTokens: number;
}

export interface GamePreferences {
  locale: Locale;
  soundEnabled: boolean;
  reducedMotion: boolean;
  displayMode: "inline" | "fullscreen";
}

export interface GameSnapshot {
  schemaVersion: typeof GAME_SCHEMA_VERSION;
  revision: number;
  seed: string;
  createdAt: string;
  lastSimulatedAt: string;
  elapsed: {
    realMs: number;
    effectiveMs: number;
  };
  locale: Locale;
  preferences: GamePreferences;
  codexLink: {
    state: CodexLinkState;
  };
  trainer: {
    name: string | null;
    level: number;
    xp: number;
    unspentSkillPoints: number;
    unlockedNodeIds: string[];
    command: "rally";
  };
  monsters: Record<MonsterId, MonsterState>;
  team: {
    activeMonsterIds: MonsterId[];
    leadMonsterId: MonsterId;
    maxSlots: 1 | 2;
    synergy: {
      active: boolean;
      signal: Signal | null;
      bonus: number;
    };
  };
  resources: {
    gold: number;
    gearMaterials: Record<GearQuality, number>;
    speciesObservation: Record<MonsterId, number>;
  };
  expedition: {
    routeId: RouteId;
    routeIndex: number;
    progress: number;
    status: "traveling" | "training" | "complete";
    completedRouteIds: RouteId[];
    bossInsight: number;
    defeatedChallengeIds: string[];
    activeChallenge: ActiveChallenge | null;
  };
  gear: {
    inventory: GearItem[];
    equipped: Record<GearSlot, string | null>;
  };
  camp: {
    available: boolean;
    unlockedNodeIds: string[];
    resetAvailable: boolean;
    spentGold: number;
  };
  bond: {
    threshold: 100_000;
    currentTokens: number;
    charges: number;
    maxCharges: 2;
    totalAcceptedTokens: number;
  };
  petState: PetState;
  pendingEncounters: PendingEncounter[];
  pendingChoices: PendingChoice[];
  pendingEvents: GameEvent[];
  processedMilestoneIds: string[];
  processedTokenEventIds: string[];
  processedCommandIds: string[];
  completed: boolean;
}

export type GameAction =
  | { type: "rename_trainer"; name: string }
  | { type: "rename_monster"; monsterId: MonsterId; name: string }
  | { type: "unlock_trainer_node"; nodeId: string }
  | { type: "set_team"; monsterIds: MonsterId[]; leadMonsterId: MonsterId }
  | { type: "attempt_befriend"; encounterId: string }
  | { type: "equip_gear"; gearId: string }
  | { type: "lock_gear"; gearId: string; locked: boolean }
  | { type: "salvage_gear"; gearId: string }
  | { type: "upgrade_gear"; gearId: string }
  | { type: "choose_reward"; choiceId: string; optionId: string }
  | { type: "unlock_camp_node"; nodeId: string }
  | { type: "reset_camp_tree" }
  | { type: "acknowledge_events"; eventIds: string[] };

export interface CommandEnvelope {
  commandId: string;
  expectedRevision: number;
  action: GameAction;
}

export interface PreferencePatch {
  locale?: Locale;
  soundEnabled?: boolean;
  reducedMotion?: boolean;
  displayMode?: "inline" | "fullscreen";
  codexLinkState?: CodexLinkState;
}

export type CodexLinkAction = "authorize" | "disconnect";

export interface PreferenceCommand {
  commandId: string;
  expectedRevision: number;
  preferences: PreferencePatch;
}

export interface SyncCommand {
  commandId: string;
  expectedRevision: number;
  tokenEvents?: TokenUsageEvent[];
}

export interface CommandResult {
  snapshot: GameSnapshot;
  duplicate: boolean;
}

export class RevisionConflictError extends Error {
  readonly currentRevision: number;

  constructor(currentRevision: number) {
    super(`Expected an older snapshot revision. Current revision is ${currentRevision}.`);
    this.name = "RevisionConflictError";
    this.currentRevision = currentRevision;
  }
}

export class InvalidGameActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGameActionError";
  }
}
