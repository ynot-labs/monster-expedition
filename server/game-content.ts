import type {
  GearQuality,
  GearSlot,
  GearTrait,
  MonsterDefinition,
  RouteId,
} from "./game-types.js";

export const HOUR_MS = 60 * 60 * 1_000;
export const MINUTE_MS = 60 * 1_000;
export const MAX_OFFLINE_MS = 12 * HOUR_MS;
export const OFFLINE_EFFICIENCY = 0.8;

export const MONSTERS = {
  hammerpaw: {
    id: "hammerpaw",
    nameKey: "monster.hammerpaw.name",
    signatureKey: "monster.hammerpaw.signature",
    signal: "break",
    respondsTo: "echo",
  },
  swiftwing: {
    id: "swiftwing",
    nameKey: "monster.swiftwing.name",
    signatureKey: "monster.swiftwing.signature",
    signal: "pursuit",
    respondsTo: "break",
  },
  mosshide: {
    id: "mosshide",
    nameKey: "monster.mosshide.name",
    signatureKey: "monster.mosshide.signature",
    signal: "guard",
    respondsTo: "pursuit",
  },
  bellhorn: {
    id: "bellhorn",
    nameKey: "monster.bellhorn.name",
    signatureKey: "monster.bellhorn.signature",
    signal: "echo",
    respondsTo: "guard",
  },
} as const satisfies Record<string, MonsterDefinition>;

export const ROUTES: ReadonlyArray<{
  id: RouteId;
  startsAtMs: number;
  endsAtMs: number;
}> = [
  { id: "windmill-plains", startsAtMs: 0, endsAtMs: 4 * HOUR_MS },
  { id: "mistwood-trail", startsAtMs: 4 * HOUR_MS, endsAtMs: 16 * HOUR_MS },
  { id: "ridge-pass", startsAtMs: 16 * HOUR_MS, endsAtMs: 24 * HOUR_MS },
];

export interface TimelineMilestone {
  id: string;
  atMs: number;
  kind: "starter-gear" | "encounter" | "camp" | "route" | "challenge";
  speciesId?: "swiftwing" | "mosshide" | "bellhorn";
  routeId?: RouteId;
  challenge?: {
    kind: "elite" | "boss";
    stage: number;
    requiredPower: number;
  };
}

export const TIMELINE: readonly TimelineMilestone[] = [
  { id: "starter-gear", atMs: 5 * MINUTE_MS, kind: "starter-gear" },
  {
    id: "swiftwing-1",
    atMs: 10 * MINUTE_MS,
    kind: "encounter",
    speciesId: "swiftwing",
  },
  {
    id: "swiftwing-2",
    atMs: 20 * MINUTE_MS,
    kind: "encounter",
    speciesId: "swiftwing",
  },
  {
    id: "plains-elite",
    atMs: 45 * MINUTE_MS,
    kind: "challenge",
    challenge: { kind: "elite", stage: 1, requiredPower: 6 },
  },
  { id: "first-camp", atMs: HOUR_MS, kind: "camp" },
  {
    id: "mosshide-1",
    atMs: 90 * MINUTE_MS,
    kind: "encounter",
    speciesId: "mosshide",
  },
  {
    id: "mosshide-2",
    atMs: 150 * MINUTE_MS,
    kind: "encounter",
    speciesId: "mosshide",
  },
  {
    id: "mosshide-3",
    atMs: 210 * MINUTE_MS,
    kind: "encounter",
    speciesId: "mosshide",
  },
  {
    id: "enter-mistwood",
    atMs: 4 * HOUR_MS,
    kind: "route",
    routeId: "mistwood-trail",
  },
  {
    id: "mistwood-elite",
    atMs: 6 * HOUR_MS,
    kind: "challenge",
    challenge: { kind: "elite", stage: 1, requiredPower: 14 },
  },
  {
    id: "enter-ridge",
    atMs: 16 * HOUR_MS,
    kind: "route",
    routeId: "ridge-pass",
  },
  {
    id: "bellhorn-1",
    atMs: 17 * HOUR_MS,
    kind: "encounter",
    speciesId: "bellhorn",
  },
  {
    id: "bellhorn-2",
    atMs: 18 * HOUR_MS,
    kind: "encounter",
    speciesId: "bellhorn",
  },
  {
    id: "bellhorn-3",
    atMs: 19 * HOUR_MS,
    kind: "encounter",
    speciesId: "bellhorn",
  },
  {
    id: "titan-stage-1",
    atMs: 20 * HOUR_MS,
    kind: "challenge",
    challenge: { kind: "boss", stage: 1, requiredPower: 23 },
  },
  {
    id: "titan-stage-2",
    atMs: 22 * HOUR_MS,
    kind: "challenge",
    challenge: { kind: "boss", stage: 2, requiredPower: 26 },
  },
  {
    id: "titan-stage-3",
    atMs: 24 * HOUR_MS,
    kind: "challenge",
    challenge: { kind: "boss", stage: 3, requiredPower: 27 },
  },
];

export const GEAR_BASES: ReadonlyArray<{
  id: string;
  slot: GearSlot;
}> = [
  { id: "sun-thread-charm", slot: "charm" },
  { id: "wayfinder-charm", slot: "charm" },
  { id: "trail-harness", slot: "harness" },
  { id: "guardian-harness", slot: "harness" },
  { id: "windmill-crest", slot: "crest" },
  { id: "ridge-crest", slot: "crest" },
  { id: "echo-talisman", slot: "talisman" },
  { id: "campfire-talisman", slot: "talisman" },
];

export const GEAR_TRAITS: readonly GearTrait[] = [
  "quickened",
  "stalwart",
  "watchful",
  "resonant",
  "fortunate",
  "unyielding",
];

export const GEAR_QUALITY_ORDER: readonly GearQuality[] = [
  "common",
  "refined",
  "legendary",
];

export const TRAINER_NODES: Readonly<
  Record<string, { cost: number; requires: string | null }>
> = {
  "dual-command": { cost: 1, requires: null },
  "assault-instinct": { cost: 1, requires: "dual-command" },
  "decisive-command": { cost: 1, requires: "assault-instinct" },
  "sheltering-call": { cost: 1, requires: "dual-command" },
  "steadfast-bond": { cost: 1, requires: "sheltering-call" },
};

export const CAMP_NODES: Readonly<
  Record<string, { cost: number; requires: string | null }>
> = {
  "scouting-paths": { cost: 100, requires: null },
  "scouting-signs": { cost: 250, requires: "scouting-paths" },
  "workshop-tools": { cost: 100, requires: null },
  "workshop-craft": { cost: 250, requires: "workshop-tools" },
  "care-rations": { cost: 100, requires: null },
  "care-shelter": { cost: 250, requires: "care-rations" },
};

export const TRAINER_LEVEL_THRESHOLDS = [
  25,
  240,
  480,
  960,
] as const;
