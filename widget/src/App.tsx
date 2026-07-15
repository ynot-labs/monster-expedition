import type { App as McpApp } from "@modelcontextprotocol/ext-apps";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExpeditionStage } from "./ExpeditionStage";
import { type Locale, type MessageKey, translate } from "./i18n";

type DisplayMode = "inline" | "fullscreen";
type TabId =
  | "expedition"
  | "team"
  | "gear"
  | "trainer"
  | "camp"
  | "journal"
  | "codex"
  | "settings";
type CodexLinkState =
  | "not-configured"
  | "restart-required"
  | "connected"
  | "config-conflict"
  | "unavailable";
type GearSlot = "charm" | "harness" | "crest" | "talisman";
type GearQuality = "common" | "refined" | "legendary";

interface GamePreferences {
  locale: Locale;
  soundEnabled: boolean;
  reducedMotion: boolean;
  displayMode: DisplayMode;
}

interface MonsterRecord {
  speciesId: "hammerpaw" | "swiftwing" | "mosshide" | "bellhorn";
  name: string | null;
  befriended: boolean;
  level: number;
  xp: number;
  encounterAttempts: number;
}

interface GearItem {
  id: string;
  baseId: string;
  nameKey: MessageKey;
  slot: GearSlot;
  quality: GearQuality;
  affixKey: MessageKey;
  power: number;
  locked: boolean;
}

interface PendingChoice {
  id: string;
  type: "gear_reward" | "trait_reward";
  source: "bond_burst" | "challenge" | "gear_upgrade";
  options: GearItem[];
}

interface GameSnapshot {
  schemaVersion: number;
  revision: number;
  createdAt: string;
  lastSimulatedAt: string;
  elapsed: { realMs: number; effectiveMs: number };
  locale: Locale;
  preferences: GamePreferences;
  codexLink: { state: CodexLinkState };
  trainer: {
    name: string | null;
    level: number;
    xp: number;
    unspentSkillPoints: number;
    unlockedNodeIds: string[];
    command: string;
  };
  monsters: Record<string, MonsterRecord>;
  team: {
    activeMonsterIds: string[];
    leadMonsterId: string;
    maxSlots: number;
    synergy: string;
  };
  resources: {
    gold: number;
    gearMaterials: number;
    speciesObservation: number;
  };
  expedition: {
    routeId: string;
    routeIndex: number;
    progress: number;
    status: string;
    completedRouteIds: string[];
    bossInsight: number;
    activeChallenge: unknown | null;
  };
  gear: {
    inventory: GearItem[];
    equipped: Partial<Record<GearSlot, string>>;
  };
  camp: {
    unlockedNodeIds: string[];
    resetAvailable: boolean;
    spentGold: number;
  };
  bond: {
    threshold: number;
    currentTokens: number;
    charges: number;
    maxCharges: number;
    totalAcceptedTokens: number;
  };
  pendingEncounters: unknown[];
  pendingChoices: PendingChoice[];
  pendingEvents: unknown[];
  completed: boolean;
  demoClockMs: number;
}

type Translator = (key: MessageKey, values?: Record<string, string | number>) => string;

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => string;
  }
}

const LOCALE_STORAGE_KEY = "monster-expedition.locale";
const TABS: TabId[] = [
  "expedition",
  "team",
  "gear",
  "trainer",
  "camp",
  "journal",
  "codex",
  "settings",
];

const DEMO_GEAR: GearItem[] = [
  {
    id: "gear:starter-gear:sun-thread-charm:common",
    baseId: "sun-thread-charm",
    nameKey: "gear.base.sun-thread-charm",
    slot: "charm",
    quality: "common",
    affixKey: "gear.trait.resonant",
    power: 14,
    locked: true,
  },
  {
    id: "gear:demo:trail-harness:common",
    baseId: "trail-harness",
    nameKey: "gear.base.trail-harness",
    slot: "harness",
    quality: "common",
    affixKey: "gear.trait.stalwart",
    power: 12,
    locked: false,
  },
  {
    id: "gear:demo:windmill-crest:refined",
    baseId: "windmill-crest",
    nameKey: "gear.base.windmill-crest",
    slot: "crest",
    quality: "refined",
    affixKey: "gear.trait.watchful",
    power: 24,
    locked: false,
  },
  {
    id: "gear:demo:echo-talisman:common",
    baseId: "echo-talisman",
    nameKey: "gear.base.echo-talisman",
    slot: "talisman",
    quality: "common",
    affixKey: "gear.trait.fortunate",
    power: 12,
    locked: false,
  },
];

const DEMO_REWARD: PendingChoice = {
  id: "bond-reward-demo-1",
  type: "gear_reward",
  source: "bond_burst",
  options: [
    {
      id: "reward-sunspoke",
      baseId: "wayfinder-charm",
      nameKey: "gear.base.wayfinder-charm",
      slot: "charm",
      quality: "refined",
      affixKey: "gear.trait.resonant",
      power: 24,
      locked: false,
    },
    {
      id: "reward-cloudstep",
      baseId: "ridge-crest",
      nameKey: "gear.base.ridge-crest",
      slot: "crest",
      quality: "refined",
      affixKey: "gear.trait.quickened",
      power: 22,
      locked: false,
    },
    {
      id: "reward-merchant",
      baseId: "guardian-harness",
      nameKey: "gear.base.guardian-harness",
      slot: "harness",
      quality: "refined",
      affixKey: "gear.trait.fortunate",
      power: 20,
      locked: false,
    },
  ],
};

function makeDemoSnapshot(): GameSnapshot {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    revision: 7,
    createdAt: now,
    lastSimulatedAt: now,
    elapsed: { realMs: 42 * 60_000, effectiveMs: 42 * 60_000 },
    locale: "en",
    preferences: {
      locale: "en",
      soundEnabled: true,
      reducedMotion: false,
      displayMode: "fullscreen",
    },
    codexLink: { state: "connected" },
    trainer: {
      name: "Aster",
      level: 4,
      xp: 184,
      unspentSkillPoints: 2,
      unlockedNodeIds: ["trainer.duo"],
      command: "rallying_whistle",
    },
    monsters: {
      hammerpaw: {
        speciesId: "hammerpaw",
      name: null,
        befriended: true,
        level: 5,
        xp: 232,
        encounterAttempts: 0,
      },
      swiftwing: {
        speciesId: "swiftwing",
      name: null,
        befriended: true,
        level: 4,
        xp: 143,
        encounterAttempts: 2,
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
      activeMonsterIds: ["hammerpaw", "swiftwing"],
      leadMonsterId: "hammerpaw",
      maxSlots: 2,
      synergy: "break_pursuit",
    },
    resources: { gold: 460, gearMaterials: 13, speciesObservation: 9 },
    expedition: {
      routeId: "windmill-plains",
      routeIndex: 0,
      progress: 0.18,
      status: "traveling",
      completedRouteIds: [],
      bossInsight: 0,
      activeChallenge: null,
    },
    gear: {
      inventory: structuredClone(DEMO_GEAR),
      equipped: {
        charm: "gear:starter-gear:sun-thread-charm:common",
        harness: "gear:demo:trail-harness:common",
        crest: "gear:demo:windmill-crest:refined",
        talisman: "gear:demo:echo-talisman:common",
      },
    },
    camp: {
      unlockedNodeIds: ["scouting-paths"],
      resetAvailable: true,
      spentGold: 120,
    },
    bond: {
      threshold: 100_000,
      currentTokens: 63_240,
      charges: 1,
      maxCharges: 2,
      totalAcceptedTokens: 163_240,
    },
    pendingEncounters: [],
    pendingChoices: [structuredClone(DEMO_REWARD)],
    pendingEvents: [],
    completed: false,
    demoClockMs: 42 * 60_000,
  };
}

function readInitialLocale(): Locale {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY) === "zh-CN" ? "zh-CN" : "en";
  } catch {
    return "en";
  }
}

function commandId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const GEAR_BASE_KEYS: Record<string, MessageKey> = {
  "sun-thread-charm": "gear.base.sun-thread-charm",
  "wayfinder-charm": "gear.base.wayfinder-charm",
  "trail-harness": "gear.base.trail-harness",
  "guardian-harness": "gear.base.guardian-harness",
  "windmill-crest": "gear.base.windmill-crest",
  "ridge-crest": "gear.base.ridge-crest",
  "echo-talisman": "gear.base.echo-talisman",
  "campfire-talisman": "gear.base.campfire-talisman",
};

const GEAR_TRAIT_KEYS: Record<string, MessageKey> = {
  quickened: "gear.trait.quickened",
  stalwart: "gear.trait.stalwart",
  watchful: "gear.trait.watchful",
  resonant: "gear.trait.resonant",
  fortunate: "gear.trait.fortunate",
  unyielding: "gear.trait.unyielding",
};

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asGearSlot(value: unknown): GearSlot {
  return value === "harness" || value === "crest" || value === "talisman" ? value : "charm";
}

function asGearQuality(value: unknown): GearQuality {
  return value === "refined" || value === "legendary" ? value : "common";
}

function displayGear(source: unknown, fallbackId: string): GearItem {
  const item = isRecord(source) ? source : {};
  const baseId = typeof item.baseId === "string" ? item.baseId : "sun-thread-charm";
  const quality = asGearQuality(item.quality);
  const traits = Array.isArray(item.traits) ? item.traits : [];
  const trait = typeof item.trait === "string" ? item.trait : traits.find((value) => typeof value === "string");
  const qualityPower = quality === "legendary" ? 30 : quality === "refined" ? 20 : 10;
  return {
    id: typeof item.id === "string" ? item.id : fallbackId,
    baseId,
    nameKey: GEAR_BASE_KEYS[baseId] ?? "gear.base.sun-thread-charm",
    slot: asGearSlot(item.slot),
    quality,
    affixKey: GEAR_TRAIT_KEYS[trait ?? ""] ?? "gear.trait.resonant",
    power: qualityPower + (traits.length || trait ? 4 : 0),
    locked: item.locked === true,
  };
}

function totalNumericValues(value: unknown): number {
  if (!isRecord(value)) return asNumber(value);
  return Object.values(value).reduce<number>((total, entry) => total + asNumber(entry), 0);
}

function normalizeSnapshot(raw: unknown): GameSnapshot | null {
  if (!isRecord(raw)) return null;
  const wrapper = raw;
  const candidate = isRecord(wrapper.snapshot)
    ? wrapper.snapshot
    : isRecord(wrapper.game)
      ? wrapper.game
      : wrapper;
  if (typeof candidate.revision !== "number") return null;

  const demo = makeDemoSnapshot();
  const rawPreferences = isRecord(candidate.preferences) ? candidate.preferences : {};
  const rawTrainer = isRecord(candidate.trainer) ? candidate.trainer : {};
  const rawMonsters = isRecord(candidate.monsters) ? candidate.monsters : {};
  const monsters = { ...demo.monsters };
  (['hammerpaw', 'swiftwing', 'mosshide', 'bellhorn'] as const).forEach((id) => {
    const source = rawMonsters[id];
    if (!isRecord(source)) return;
    const previous = monsters[id] ?? demo.monsters.hammerpaw!;
    monsters[id] = {
      ...previous,
      ...source,
      speciesId: id,
      name: typeof source.name === "string" ? source.name : null,
      befriended: source.befriended === true,
      level: asNumber(source.level, previous.level),
      xp: asNumber(source.xp, previous.xp),
      encounterAttempts: asNumber(source.encounterAttempts, previous.encounterAttempts),
    };
  });

  const rawTeam = isRecord(candidate.team) ? candidate.team : {};
  const synergy = isRecord(rawTeam.synergy) && rawTeam.synergy.active === true
    ? `active-${String(rawTeam.synergy.signal ?? "link")}`
    : typeof rawTeam.synergy === "string" ? rawTeam.synergy : "none";
  const rawResources = isRecord(candidate.resources) ? candidate.resources : {};
  const rawExpedition = isRecord(candidate.expedition) ? candidate.expedition : {};
  const rawGear = isRecord(candidate.gear) ? candidate.gear : {};
  const inventory = Array.isArray(rawGear.inventory)
    ? rawGear.inventory.map((item, index) => displayGear(item, `gear:display:${index}`))
    : demo.gear.inventory;
  const rawEquipped = isRecord(rawGear.equipped) ? rawGear.equipped : {};
  const equipped: Partial<Record<GearSlot, string>> = {};
  (['charm', 'harness', 'crest', 'talisman'] as const).forEach((slot) => {
    if (typeof rawEquipped[slot] === "string") equipped[slot] = rawEquipped[slot];
  });
  const rawChoices = Array.isArray(candidate.pendingChoices) ? candidate.pendingChoices : [];
  const pendingChoices = rawChoices.map((entry, choiceIndex): PendingChoice => {
    const choice = isRecord(entry) ? entry : {};
    const traitChoice = choice.kind === "upgrade-trait";
    const upgradedGear = inventory.find((item) => item.id === choice.gearId);
    const options = Array.isArray(choice.options) ? choice.options : [];
    return {
      id: typeof choice.id === "string" ? choice.id : `choice:display:${choiceIndex}`,
      type: traitChoice ? "trait_reward" : "gear_reward",
      source: traitChoice ? "gear_upgrade" : choice.kind === "bonus-gear" ? "bond_burst" : "challenge",
      options: options.map((option, optionIndex) => {
        if (traitChoice && upgradedGear && isRecord(option)) {
          return displayGear(
            { ...upgradedGear, id: option.id, traits: [option.trait] },
            `trait:display:${optionIndex}`,
          );
        }
        return displayGear(option, `reward:display:${choiceIndex}:${optionIndex}`);
      }),
    };
  });
  const rawCamp = isRecord(candidate.camp) ? candidate.camp : {};
  const rawBond = isRecord(candidate.bond) ? candidate.bond : {};
  const rawCodexLink = isRecord(candidate.codexLink) ? candidate.codexLink : {};
  const locale: Locale = candidate.locale === "zh-CN" ? "zh-CN" : "en";
  const codexState: CodexLinkState = rawCodexLink.state === "connected" || rawCodexLink.state === "restart-required" || rawCodexLink.state === "config-conflict" || rawCodexLink.state === "unavailable" ? rawCodexLink.state : "not-configured";

  return {
    ...demo,
    schemaVersion: asNumber(candidate.schemaVersion, demo.schemaVersion),
    revision: candidate.revision,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : demo.createdAt,
    lastSimulatedAt: typeof candidate.lastSimulatedAt === "string" ? candidate.lastSimulatedAt : demo.lastSimulatedAt,
    elapsed: isRecord(candidate.elapsed) ? {
      realMs: asNumber(candidate.elapsed.realMs),
      effectiveMs: asNumber(candidate.elapsed.effectiveMs),
    } : demo.elapsed,
    locale,
    preferences: {
      locale,
      soundEnabled: rawPreferences.soundEnabled !== false,
      reducedMotion: rawPreferences.reducedMotion === true,
      displayMode: rawPreferences.displayMode === "inline" ? "inline" : "fullscreen",
    },
    codexLink: { state: codexState },
    trainer: {
      name: typeof rawTrainer.name === "string" ? rawTrainer.name : null,
      level: asNumber(rawTrainer.level, 1),
      xp: asNumber(rawTrainer.xp),
      unspentSkillPoints: asNumber(rawTrainer.unspentSkillPoints),
      unlockedNodeIds: Array.isArray(rawTrainer.unlockedNodeIds) ? rawTrainer.unlockedNodeIds.filter((id): id is string => typeof id === "string") : [],
      command: typeof rawTrainer.command === "string" ? rawTrainer.command : "rally",
    },
    monsters,
    team: {
      activeMonsterIds: Array.isArray(rawTeam.activeMonsterIds) ? rawTeam.activeMonsterIds.filter((id): id is string => typeof id === "string") : ["hammerpaw"],
      leadMonsterId: typeof rawTeam.leadMonsterId === "string" ? rawTeam.leadMonsterId : "hammerpaw",
      maxSlots: asNumber(rawTeam.maxSlots, 1),
      synergy,
    },
    resources: {
      gold: asNumber(rawResources.gold),
      gearMaterials: totalNumericValues(rawResources.gearMaterials),
      speciesObservation: totalNumericValues(rawResources.speciesObservation),
    },
    expedition: {
      routeId: typeof rawExpedition.routeId === "string" ? rawExpedition.routeId : "windmill-plains",
      routeIndex: asNumber(rawExpedition.routeIndex),
      progress: asNumber(rawExpedition.progress),
      status: typeof rawExpedition.status === "string" ? rawExpedition.status : "traveling",
      completedRouteIds: Array.isArray(rawExpedition.completedRouteIds) ? rawExpedition.completedRouteIds.filter((id): id is string => typeof id === "string") : [],
      bossInsight: asNumber(rawExpedition.bossInsight),
      activeChallenge: rawExpedition.activeChallenge ?? null,
    },
    gear: { inventory, equipped },
    camp: {
      unlockedNodeIds: Array.isArray(rawCamp.unlockedNodeIds) ? rawCamp.unlockedNodeIds.filter((id): id is string => typeof id === "string") : [],
      resetAvailable: rawCamp.resetAvailable !== false,
      spentGold: asNumber(rawCamp.spentGold),
    },
    bond: {
      threshold: asNumber(rawBond.threshold, 100_000),
      currentTokens: asNumber(rawBond.currentTokens),
      charges: asNumber(rawBond.charges),
      maxCharges: asNumber(rawBond.maxCharges, 2),
      totalAcceptedTokens: asNumber(rawBond.totalAcceptedTokens),
    },
    pendingEncounters: Array.isArray(candidate.pendingEncounters) ? candidate.pendingEncounters : [],
    pendingChoices,
    pendingEvents: Array.isArray(candidate.pendingEvents) ? candidate.pendingEvents : [],
    completed: candidate.completed === true,
    demoClockMs: isRecord(candidate.elapsed) ? asNumber(candidate.elapsed.effectiveMs) : demo.demoClockMs,
  };
}

function speciesNameKey(speciesId: MonsterRecord["speciesId"]): MessageKey {
  return `monster.${speciesId}` as MessageKey;
}

function speciesRoleKey(speciesId: MonsterRecord["speciesId"]): MessageKey {
  return `monster.${speciesId}Role` as MessageKey;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)").matches : false,
  );
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function TabGlyph({ tab }: { tab: TabId }) {
  const paths: Record<TabId, string> = {
    expedition: "M5 18c5-9 9-9 14-14M5 18h14M12 7l3 3-3 3",
    team: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 1a2.5 2.5 0 1 0 0-5M3 19c0-4 2-6 5-6s5 2 5 6m0 0c0-3 1-5 4-5 2 0 4 2 4 5",
    gear: "M12 3l3 5 5 2-3 5 1 6-6-2-6 2 1-6-3-5 5-2 3-5Z",
    trainer: "M12 3v5m0 8v5M3 12h5m8 0h5M6 6l3 3m6 6 3 3m0-12-3 3m-6 6-3 3",
    camp: "M4 20 12 4l8 16M7 15h10M8 20l4-8 4 8",
    journal: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm3 0v16m3-11h5m-5 4h5",
    codex: "M4 12a8 8 0 0 1 16 0M7 12a5 5 0 0 1 10 0m-5 0v8m0 0-3-3m3 3 3-3",
    settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1",
  };
  return (
    <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[tab]} />
    </svg>
  );
}

function BondRing({ snapshot, t, compact = false }: { snapshot: GameSnapshot; t: Translator; compact?: boolean }) {
  const { bond } = snapshot;
  const full = bond.charges >= bond.maxCharges;
  const progress = full ? 100 : Math.min(100, (bond.currentTokens / bond.threshold) * 100);
  const number = new Intl.NumberFormat(snapshot.locale);
  return (
    <div className={`bond-widget${compact ? " is-compact" : ""}`}>
      <div
        className={`bond-ring${full ? " is-full" : ""}`}
        style={{ "--bond-progress": `${progress * 3.6}deg` } as React.CSSProperties}
        aria-label={t("bond.progress", {
          current: number.format(bond.currentTokens),
          threshold: number.format(bond.threshold),
        })}
      >
        <span className="bond-spark" aria-hidden="true" />
        <strong>{bond.charges}</strong>
        <small>/ {bond.maxCharges}</small>
      </div>
      {!compact && (
        <div className="bond-copy">
          <span>{t("bond.title")}</span>
          <strong>{full ? t("bond.full") : t("bond.charges", { current: bond.charges, max: bond.maxCharges })}</strong>
          <small>
            {t("bond.progress", {
              current: number.format(bond.currentTokens),
              threshold: number.format(bond.threshold),
            })}
          </small>
        </div>
      )}
    </div>
  );
}

function ResourcePill({ label, value, tone }: { label: string; value: string; tone: "gold" | "green" | "blue" }) {
  return (
    <div className={`resource-pill tone-${tone}`}>
      <span aria-hidden="true" />
      <div><strong>{value}</strong><small>{label}</small></div>
    </div>
  );
}

function StageParty({ snapshot, t }: { snapshot: GameSnapshot; t: Translator }) {
  return (
    <div className="stage-party" aria-label={t("stage.party")}>
      {snapshot.team.activeMonsterIds.map((monsterId) => {
        const monster = snapshot.monsters[monsterId];
        if (!monster) return null;
        const lead = snapshot.team.leadMonsterId === monsterId;
        return (
          <div className={`party-chip species-${monster.speciesId}${lead ? " is-lead" : ""}`} key={monsterId}>
            <span className="party-portrait" aria-hidden="true" />
            <div>
              <strong>{monster.name || t(speciesNameKey(monster.speciesId))}</strong>
              <small>{lead ? t("stage.lead") : t("monster.level", { level: monster.level })}</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GearCard({ item, t, reward = false, onChoose }: { item: GearItem; t: Translator; reward?: boolean; onChoose?: () => void }) {
  return (
    <article className={`gear-card quality-${item.quality}${reward ? " is-reward" : ""}`}>
      <div className={`gear-illustration slot-${item.slot}`} aria-hidden="true"><span /></div>
      <div className="gear-card-copy">
        <div className="gear-meta">
          <span>{t(`gear.quality.${item.quality}` as MessageKey)}</span>
          <span>{t(`gear.slot.${item.slot}` as MessageKey)}</span>
        </div>
        <h3>{t(item.nameKey)}</h3>
        <p>{t(item.affixKey)}</p>
        {reward && <strong className="power-line">{t("reward.power", { power: item.power })}</strong>}
      </div>
      {item.locked && <span className="locked-ribbon">{t("gear.locked")}</span>}
      {onChoose && <button className="ink-button reward-choose" onClick={onChoose}>{t("reward.choose")}</button>}
    </article>
  );
}

interface GamePanelProps {
  snapshot: GameSnapshot;
  t: Translator;
  onLeader: (monsterId: string) => void;
  onBefriend: (encounterId: string) => void;
  onSkill: (nodeId: string) => void;
  onCamp: (nodeId: string, cost: number) => void;
  onUpgrade: (gearId: string) => void;
  onToggleLock: (gearId: string, locked: boolean) => void;
  onPreference: (preferences: Partial<GamePreferences> & { codexLinkState?: CodexLinkState; codexLinkAction?: "authorize" | "disconnect" }) => void;
  onLocale: (locale: Locale) => void;
  onReset: () => void;
}

function ExpeditionPanel({ snapshot, t, onBefriend }: Pick<GamePanelProps, "snapshot" | "t" | "onBefriend">) {
  const encounter = snapshot.pendingEncounters[0];
  const encounterRecord = isRecord(encounter) ? encounter : null;
  const encounterSpecies = typeof encounterRecord?.speciesId === "string" ? encounterRecord.speciesId : null;
  return (
    <div className="panel-layout expedition-panel">
      <header className="panel-intro">
        <span className="ink-kicker">{t("stage.steady")}</span>
        <h2>{t("expedition.heading")}</h2>
        <p>{t("expedition.copy")}</p>
      </header>
      <div className="trail-notes">
        <article className="trail-note note-feather">
          <span className="note-mark" aria-hidden="true" />
          <div><small>{t("expedition.encounter")}</small><strong>{t("stage.threat")}</strong><p>{t("expedition.encounterCopy")}</p></div>
        </article>
        <article className="trail-note note-milepost">
          <span className="note-mark" aria-hidden="true" />
          <div><small>{t("expedition.reward")}</small><strong>{t("stage.nextValue")}</strong><p>{t("expedition.rewardCopy")}</p></div>
        </article>
        <article className="trail-note note-moon">
          <span className="note-mark" aria-hidden="true" />
          <div><small>{t("expedition.offline")}</small><strong>{t("expedition.offlineValue")}</strong><p>{t("bond.shortRule")}</p></div>
        </article>
      </div>
      {encounterRecord && typeof encounterRecord.id === "string" && encounterSpecies && (
        <aside className="trail-note note-feather encounter-action">
          <span className="note-mark" aria-hidden="true" />
          <div><small>{t("expedition.encounter")}</small><strong>{t(speciesNameKey(encounterSpecies as MonsterRecord["speciesId"]))}</strong><p>{t("expedition.encounterCopy")}</p></div>
          <button className="ink-button" onClick={() => onBefriend(encounterRecord.id as string)}>{t("expedition.befriend")}</button>
        </aside>
      )}
      <div className="route-ribbon" aria-label={t("stage.progress")}>
        <div><span>{t("stage.route")}</span><strong>{Math.round(snapshot.expedition.progress * 100)}%</strong></div>
        <div className="route-track"><span style={{ width: `${snapshot.expedition.progress * 100}%` }}><i /></span></div>
        <div className="route-ends"><span>{t("stage.route")}</span><span>{t("stage.destination")}</span></div>
      </div>
    </div>
  );
}

function TeamPanel({ snapshot, t, onLeader }: Pick<GamePanelProps, "snapshot" | "t" | "onLeader">) {
  return (
    <div className="panel-layout">
      <header className="panel-intro">
        <span className="ink-kicker">{t("team.synergy")}</span>
        <h2>{t("team.heading")}</h2>
        <p>{t("team.copy")}</p>
      </header>
      <div className="team-spread">
        <div className="monster-cards">
          {snapshot.team.activeMonsterIds.map((monsterId, index) => {
            const monster = snapshot.monsters[monsterId];
            if (!monster) return null;
            const lead = snapshot.team.leadMonsterId === monsterId;
            const signal = monster.speciesId === "hammerpaw" ? "team.break" : "team.pursuit";
            return (
              <article className={`monster-card species-${monster.speciesId}${lead ? " is-lead" : ""}`} key={monsterId}>
                <div className="monster-card-art" aria-hidden="true"><span /></div>
                <div className="monster-card-head"><small>{t("team.slot", { slot: index + 1 })}</small>{lead && <span>{t("stage.lead")}</span>}</div>
                <h3>{monster.name || t(speciesNameKey(monster.speciesId))}</h3>
                <p>{t(speciesRoleKey(monster.speciesId))}</p>
                <div className="signal-row"><span>{t(signal as MessageKey)}</span><i aria-hidden="true" /><span>{monster.speciesId === "hammerpaw" ? t("monster.hammerpawSkill") : t("monster.swiftwingSkill")}</span></div>
                <button className={lead ? "quiet-button is-active" : "ink-button"} disabled={lead} onClick={() => onLeader(monsterId)}>
                  {lead ? t("team.currentLead") : t("team.makeLead")}
                </button>
              </article>
            );
          })}
        </div>
        <aside className="synergy-page">
          <span className="synergy-flare" aria-hidden="true">×</span>
          <small>{t("team.synergy")}</small>
          <h3>{t("team.synergyName")}</h3>
          <p>{t("team.synergyCopy")}</p>
          <div className="signal-chain"><span>{t("team.break")}</span><i /><span>{t("team.pursuit")}</span></div>
        </aside>
      </div>
    </div>
  );
}

function GearPanel({ snapshot, t, onUpgrade, onToggleLock }: Pick<GamePanelProps, "snapshot" | "t" | "onUpgrade" | "onToggleLock">) {
  const slots: GearSlot[] = ["charm", "harness", "crest", "talisman"];
  const selectedBase = snapshot.gear.inventory.find((item) => item.locked) ?? snapshot.gear.inventory[0] ?? null;
  const upgradeTarget = selectedBase?.locked ? selectedBase : null;
  return (
    <div className="panel-layout">
      <header className="panel-intro">
        <span className="ink-kicker">{t("gear.equipped")}</span>
        <h2>{t("gear.heading")}</h2>
        <p>{t("gear.copy")}</p>
      </header>
      <div className="gear-workbench">
        <section className="equipment-rack">
          {slots.map((slot) => {
            const id = snapshot.gear.equipped[slot];
            const item = snapshot.gear.inventory.find((candidate) => candidate.id === id);
            return (
              <div className="rack-slot" key={slot}>
                <small>{t(`gear.slot.${slot}` as MessageKey)}</small>
                {item ? <GearCard item={item} t={t} /> : <span className="empty-slot">{t("gear.empty")}</span>}
              </div>
            );
          })}
        </section>
        <aside className="upgrade-bench">
          <span className="bench-anvil" aria-hidden="true" />
          <small>{t("gear.pack")}</small>
          <strong>{snapshot.resources.gearMaterials} {t("resource.materials")}</strong>
          <p>{selectedBase ? `${t(selectedBase.nameKey)} · ${t(selectedBase.affixKey)}` : t("gear.empty")}</p>
          {selectedBase && <button className="quiet-button" onClick={() => onToggleLock(selectedBase.id, !selectedBase.locked)}>{t(selectedBase.locked ? "gear.unlock" : "gear.lock")}</button>}
          <button className="ink-button" disabled={!upgradeTarget || snapshot.resources.gearMaterials < 5} onClick={() => upgradeTarget && onUpgrade(upgradeTarget.id)}>
            {t("gear.upgrade")}
          </button>
        </aside>
      </div>
    </div>
  );
}

const TRAINER_NODES = [
  { id: "assault-instinct", title: "trainer.node.firstStrike", copy: "trainer.node.firstStrikeCopy", branch: "attack" },
  { id: "decisive-command", title: "trainer.node.followThrough", copy: "trainer.node.followThroughCopy", branch: "attack" },
  { id: "sheltering-call", title: "trainer.node.safeStep", copy: "trainer.node.safeStepCopy", branch: "protect" },
  { id: "steadfast-bond", title: "trainer.node.secondWind", copy: "trainer.node.secondWindCopy", branch: "protect" },
] as const;

function TrainerPanel({ snapshot, t, onSkill }: Pick<GamePanelProps, "snapshot" | "t" | "onSkill">) {
  const duoLearned = snapshot.trainer.unlockedNodeIds.includes("dual-command");
  return (
    <div className="panel-layout">
      <header className="panel-intro trainer-intro">
        <div>
          <span className="ink-kicker">{t("trainer.level", { level: snapshot.trainer.level })}</span>
          <h2>{t("trainer.heading")}</h2>
          <p>{t("trainer.copy")}</p>
        </div>
        <div className="skill-points"><strong>{snapshot.trainer.unspentSkillPoints}</strong><span>{t("trainer.points", { count: snapshot.trainer.unspentSkillPoints })}</span></div>
      </header>
      <section className="command-banner"><span className="whistle-mark" aria-hidden="true" /><div><small>{t("trainer.command")}</small><p>{t("trainer.commandCopy")}</p></div></section>
      <div className="skill-tree">
        <article className={`skill-root${duoLearned ? " is-learned" : ""}`}><span aria-hidden="true" /><div><strong>{t("trainer.node.duo")}</strong><p>{t("trainer.node.duoCopy")}</p></div><button className={duoLearned ? "quiet-button is-active" : "ink-button"} disabled={duoLearned || snapshot.trainer.unspentSkillPoints < 1} onClick={() => onSkill("dual-command")}>{duoLearned ? t("trainer.learned") : t("trainer.unlock")}</button></article>
        {(["attack", "protect"] as const).map((branch) => (
          <section className={`skill-branch branch-${branch}`} key={branch}>
            <h3>{t(branch === "attack" ? "trainer.branch.attack" : "trainer.branch.protect")}</h3>
            {TRAINER_NODES.filter((node) => node.branch === branch).map((node, index, branchNodes) => {
              const learned = snapshot.trainer.unlockedNodeIds.includes(node.id);
              const previousNode = branchNodes[index - 1];
              const prerequisite = duoLearned && (index === 0 || (previousNode ? snapshot.trainer.unlockedNodeIds.includes(previousNode.id) : false));
              return (
                <article className={`skill-node${learned ? " is-learned" : ""}${!prerequisite ? " is-locked" : ""}`} key={node.id}>
                  <span className="node-orb" aria-hidden="true" />
                  <div><strong>{t(node.title)}</strong><p>{t(node.copy)}</p></div>
                  <button className={learned ? "quiet-button is-active" : "ink-button"} disabled={learned || !prerequisite || snapshot.trainer.unspentSkillPoints < 1} onClick={() => onSkill(node.id)}>
                    {learned ? t("trainer.learned") : t("trainer.unlock")}
                  </button>
                </article>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}

const CAMP_BRANCHES = [
  {
    id: "scouting",
    title: "camp.scouting",
    nodes: [
      { id: "scouting-paths", title: "camp.scouting1", copy: "camp.scouting1Copy", cost: 100 },
      { id: "scouting-signs", title: "camp.scouting2", copy: "camp.scouting2Copy", cost: 250 },
    ],
  },
  {
    id: "workshop",
    title: "camp.workshop",
    nodes: [
      { id: "workshop-tools", title: "camp.workshop1", copy: "camp.workshop1Copy", cost: 100 },
      { id: "workshop-craft", title: "camp.workshop2", copy: "camp.workshop2Copy", cost: 250 },
    ],
  },
  {
    id: "care",
    title: "camp.care",
    nodes: [
      { id: "care-rations", title: "camp.care1", copy: "camp.care1Copy", cost: 100 },
      { id: "care-shelter", title: "camp.care2", copy: "camp.care2Copy", cost: 250 },
    ],
  },
] as const;

function CampPanel({ snapshot, t, onCamp }: Pick<GamePanelProps, "snapshot" | "t" | "onCamp">) {
  return (
    <div className="panel-layout camp-panel">
      <header className="panel-intro camp-intro">
        <div><span className="ink-kicker">{t("camp.gold", { amount: snapshot.resources.gold })}</span><h2>{t("camp.heading")}</h2><p>{t("camp.copy")}</p></div>
        {snapshot.camp.resetAvailable && <span className="reset-seal">{t("camp.reset")}</span>}
      </header>
      <div className="camp-clearing">
        {CAMP_BRANCHES.map((branch) => (
          <section className={`camp-sign branch-${branch.id}`} key={branch.id}>
            <h3>{t(branch.title)}</h3>
            {branch.nodes.map((node, index) => {
              const built = snapshot.camp.unlockedNodeIds.includes(node.id);
              const previousNode = branch.nodes[index - 1];
              const previousBuilt = index === 0 || (previousNode ? snapshot.camp.unlockedNodeIds.includes(previousNode.id) : false);
              return (
                <article className={`${built ? "is-built" : ""}${!previousBuilt ? " is-locked" : ""}`} key={node.id}>
                  <span className="camp-node-mark" aria-hidden="true" />
                  <div><strong>{t(node.title)}</strong><p>{t(node.copy)}</p></div>
                  <button className={built ? "quiet-button is-active" : "wood-button"} disabled={built || !previousBuilt || snapshot.resources.gold < node.cost} onClick={() => onCamp(node.id, node.cost)}>
                    {built ? t("camp.built") : t("camp.build", { cost: node.cost })}
                  </button>
                </article>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}

function JournalPanel({ t }: Pick<GamePanelProps, "t">) {
  const entries = [
    ["journal.now", "journal.entry1"],
    ["journal.ago12", "journal.entry2"],
    ["journal.ago31", "journal.entry3"],
  ] as const;
  return (
    <div className="panel-layout journal-panel">
      <header className="panel-intro"><span className="ink-kicker">{t("journal.summary")}</span><h2>{t("journal.heading")}</h2><p>{t("journal.copy")}</p></header>
      <div className="journal-spread">
        <ol className="journal-timeline">
          {entries.map(([time, copy], index) => <li key={copy}><span>{index + 1}</span><div><small>{t(time)}</small><p>{t(copy)}</p></div></li>)}
        </ol>
        <aside className="journey-summary"><span className="map-doodle" aria-hidden="true" /><small>{t("journal.summary")}</small><strong>{t("journal.summaryValue")}</strong></aside>
      </div>
    </div>
  );
}

function CodexPanel({ snapshot, t, onPreference }: Pick<GamePanelProps, "snapshot" | "t" | "onPreference">) {
  const state = snapshot.codexLink.state;
  const unavailable = state === "unavailable" || state === "config-conflict";
  const stateKey: MessageKey = state === "connected" ? "codex.connected" : unavailable ? "codex.unavailable" : "codex.notAuthorized";
  const copyKey: MessageKey = state === "connected" ? "codex.connectedCopy" : unavailable ? "codex.unavailableCopy" : "codex.notAuthorizedCopy";
  const number = new Intl.NumberFormat(snapshot.locale);
  return (
    <div className="panel-layout codex-panel">
      <header className="panel-intro"><span className="ink-kicker">{t("codex.privacy")}</span><h2>{t("codex.heading")}</h2><p>{t("codex.copy")}</p></header>
      <div className="codex-link-card">
        <div className={`link-lantern state-${state}`} aria-hidden="true"><i /><span /></div>
        <div className="link-state-copy"><small>{t(stateKey)}</small><h3>{state === "connected" ? `${number.format(snapshot.bond.currentTokens)} / ${number.format(snapshot.bond.threshold)}` : "—"}</h3><p>{t(copyKey)}</p></div>
        {state !== "connected" && <button className="ink-button" onClick={() => onPreference({ codexLinkAction: "authorize" })}>{t(unavailable ? "codex.retry" : "codex.connect")}</button>}
      </div>
      <div className="codex-rule-strip"><BondRing snapshot={snapshot} t={t} /><div><strong>{t("bond.shortRule")}</strong><p>{t("codex.rule")}</p><small>{t("codex.baseline")}</small></div></div>
    </div>
  );
}

function Toggle({ checked, onChange, label, onText, offText }: { checked: boolean; onChange: () => void; label: string; onText: string; offText: string }) {
  return (
    <button className={`toggle-row${checked ? " is-on" : ""}`} role="switch" aria-checked={checked} onClick={onChange}>
      <span>{label}</span><i aria-hidden="true"><b /></i><strong>{checked ? onText : offText}</strong>
    </button>
  );
}

function SettingsPanel({ snapshot, t, onPreference, onLocale, onReset }: Pick<GamePanelProps, "snapshot" | "t" | "onPreference" | "onLocale" | "onReset">) {
  return (
    <div className="panel-layout settings-panel">
      <header className="panel-intro"><span className="ink-kicker">{t("settings.displayValue")}</span><h2>{t("settings.heading")}</h2><p>{t("settings.copy")}</p></header>
      <div className="settings-ledger">
        <section className="language-setting"><span>{t("settings.language")}</span><div><button className={snapshot.locale === "en" ? "is-selected" : ""} onClick={() => onLocale("en")}>{t("settings.english")}</button><button className={snapshot.locale === "zh-CN" ? "is-selected" : ""} onClick={() => onLocale("zh-CN")}>{t("settings.chinese")}</button></div></section>
        <Toggle checked={snapshot.preferences.soundEnabled} onChange={() => onPreference({ soundEnabled: !snapshot.preferences.soundEnabled })} label={t("settings.sound")} onText={t("settings.soundOn")} offText={t("settings.soundOff")} />
        <Toggle checked={snapshot.preferences.reducedMotion} onChange={() => onPreference({ reducedMotion: !snapshot.preferences.reducedMotion })} label={t("settings.motion")} onText={t("settings.motionOn")} offText={t("settings.motionOff")} />
        <section className="display-setting"><span>{t("settings.display")}</span><strong>{t("settings.displayValue")}</strong></section>
      </div>
      <button className="quiet-button reset-demo" onClick={onReset}>{t("settings.resetDemo")}</button>
    </div>
  );
}

function RewardOverlay({ choice, t, onClose, onChoose }: { choice: PendingChoice; t: Translator; onClose: () => void; onChoose: (item: GearItem) => void }) {
  return (
    <div className="reward-backdrop" role="dialog" aria-modal="true" aria-labelledby="reward-title">
      <section className="reward-sheet">
        <button className="modal-close" onClick={onClose} aria-label={t("app.close")}>×</button>
        <span className="reward-rays" aria-hidden="true" />
        <header><span className="ink-kicker">{t("reward.kicker")}</span><h2 id="reward-title">{t("reward.heading")}</h2><p>{t("reward.copy")}</p></header>
        <div className="reward-options">{choice.options.map((item) => <GearCard key={item.id} item={item} t={t} reward onChoose={() => onChoose(item)} />)}</div>
        <footer><span>{t("reward.source")}</span><button className="quiet-button" onClick={onClose}>{t("app.later")}</button></footer>
      </section>
    </div>
  );
}

function InlineLauncher({ snapshot, t, locale, onLocale, onMode }: { snapshot: GameSnapshot; t: Translator; locale: Locale; onLocale: () => void; onMode: (mode: DisplayMode) => void }) {
  return (
    <main className="inline-launcher">
      <section className="inline-scene">
        <ExpeditionStage ariaLabel={t("stage.aria")} demoClockMs={snapshot.demoClockMs} reducedMotion={snapshot.preferences.reducedMotion} variant="compact" />
        <div className="inline-scene-label"><span>{t("stage.traveling")}</span><strong>{t("stage.route")}</strong></div>
        <StageParty snapshot={snapshot} t={t} />
      </section>
      <section className="inline-copy">
        <header><div className="brand-crest" aria-hidden="true"><i /></div><div><small>{t("app.chapterKicker")}</small><strong>{t("app.title")}</strong></div><button className="language-pill" onClick={onLocale}>{t("locale.switch")}</button></header>
        <div className="inline-status"><div><span>{t("stage.next")}</span><strong>{t("stage.nextValue")}</strong><small>{t("stage.time")}</small></div><BondRing snapshot={snapshot} t={t} compact /></div>
        <div className="inline-route"><span style={{ width: `${snapshot.expedition.progress * 100}%` }} /></div>
        <footer><button className="primary-action" onClick={() => onMode("fullscreen")}>{t("app.open")}</button></footer>
        <span className="sr-only">{locale}</span>
      </section>
    </main>
  );
}

export function App() {
  const browserPreview = typeof window !== "undefined" && window.self === window.top;
  const [snapshot, setSnapshot] = useState<GameSnapshot>(() => {
    const demo = makeDemoSnapshot();
    demo.locale = readInitialLocale();
    demo.preferences.locale = demo.locale;
    return demo;
  });
  const [activeTab, setActiveTab] = useState<TabId>("expedition");
  const [currentMode, setCurrentMode] = useState<DisplayMode>(browserPreview ? "fullscreen" : "inline");
  const [availableModes, setAvailableModes] = useState<DisplayMode[]>(browserPreview ? ["inline", "fullscreen"] : []);
  const [hostReady, setHostReady] = useState(browserPreview);
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "synced" | "failed">("idle");
  const [rewardOpen, setRewardOpen] = useState(false);
  const [toast, setToast] = useState<MessageKey | null>(null);
  const snapshotRef = useRef(snapshot);
  const tabRef = useRef(activeTab);
  const modeRef = useRef(currentMode);
  const appRef = useRef<McpApp | null>(null);
  const systemReducedMotion = usePrefersReducedMotion();

  const commitSnapshot = useCallback((next: GameSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const syncHostContext = useCallback((createdApp: McpApp) => {
    const context = createdApp.getHostContext();
    if (!context) return;
    if (context.displayMode) {
      const mode = context.displayMode as DisplayMode;
      modeRef.current = mode;
      setCurrentMode(mode);
    }
    if (context.availableDisplayModes) setAvailableModes(context.availableDisplayModes as DisplayMode[]);
  }, []);

  const { app, error } = useApp({
    appInfo: { name: "Monster Expedition", version: "0.2.0" },
    capabilities: {},
    onAppCreated: (createdApp: McpApp) => {
      appRef.current = createdApp;
      createdApp.ontoolresult = (result) => {
        const next = normalizeSnapshot(result.structuredContent);
        if (next) commitSnapshot(next);
        syncHostContext(createdApp);
        setHostReady(true);
      };
      createdApp.onhostcontextchanged = (context) => {
        if (context.displayMode) {
          const mode = context.displayMode as DisplayMode;
          modeRef.current = mode;
          setCurrentMode(mode);
        }
        if (context.availableDisplayModes) setAvailableModes(context.availableDisplayModes as DisplayMode[]);
      };
      syncHostContext(createdApp);
      setHostReady(true);
    },
  });

  useEffect(() => {
    appRef.current = app ?? null;
  }, [app]);

  useEffect(() => {
    if (hostReady) return;
    const timer = window.setTimeout(() => setHostReady(true), 900);
    return () => window.clearTimeout(timer);
  }, [hostReady]);

  useEffect(() => {
    snapshotRef.current = snapshot;
    document.documentElement.lang = snapshot.locale;
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, snapshot.locale);
    } catch {
      // Language still applies for this session when storage is unavailable.
    }
  }, [snapshot]);

  useEffect(() => { tabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { modeRef.current = currentMode; }, [currentMode]);

  const t = useCallback<Translator>(
    (key, values = {}) => translate(snapshot.locale, key, values),
    [snapshot.locale],
  );

  const applyToolSnapshot = useCallback((structuredContent: unknown) => {
    const next = normalizeSnapshot(structuredContent);
    if (next) commitSnapshot(next);
    return Boolean(next);
  }, [commitSnapshot]);

  const callTool = useCallback(async (name: string, argumentsValue: Record<string, unknown>) => {
    const activeApp = appRef.current;
    if (!activeApp) return null;
    const result = await activeApp.callServerTool({ name, arguments: argumentsValue });
    if (result.isError) throw new Error(name);
    applyToolSnapshot(result.structuredContent);
    return result;
  }, [applyToolSnapshot]);

  useEffect(() => {
    if (!appRef.current) return;
    const burstEventIds = snapshot.pendingEvents.reduce<string[]>((ids, event) => {
      if (isRecord(event) && event.kind === "bond-burst" && typeof event.id === "string") ids.push(event.id);
      return ids;
    }, []);
    if (burstEventIds.length === 0) return;
    const expectedRevision = snapshot.revision;
    const timer = window.setTimeout(() => {
      void callTool("monster_expedition_act", {
        commandId: commandId("acknowledge-burst"),
        expectedRevision,
        action: { type: "acknowledge_events", eventIds: burstEventIds },
      }).catch(() => setSyncState("failed"));
    }, 4_800);
    return () => window.clearTimeout(timer);
  }, [callTool, snapshot.pendingEvents, snapshot.revision]);

  const syncGame = useCallback(async () => {
    if (!appRef.current) {
      setSyncState("synced");
      window.setTimeout(() => setSyncState("idle"), 1_500);
      return;
    }
    setSyncState("syncing");
    try {
      const current = snapshotRef.current;
      await callTool("monster_expedition_sync", {
        commandId: commandId("sync"),
        expectedRevision: current.revision,
      });
      setSyncState("synced");
      window.setTimeout(() => setSyncState("idle"), 1_500);
    } catch {
      setSyncState("failed");
    }
  }, [callTool]);

  useEffect(() => {
    if (!app || !hostReady) return;
    void syncGame();
  }, [app, hostReady, syncGame]);

  const optimisticAct = useCallback(<T extends Record<string, unknown>>(
    action: T,
    update: (current: GameSnapshot) => GameSnapshot,
  ) => {
    const current = snapshotRef.current;
    const next = update(current);
    next.revision = current.revision + 1;
    commitSnapshot(next);
    void callTool("monster_expedition_act", {
      commandId: commandId(String(action.type ?? "action")),
      expectedRevision: current.revision,
      action,
    }).catch(() => setSyncState("failed"));
  }, [callTool, commitSnapshot]);

  const updatePreferences = useCallback((preferences: Partial<GamePreferences> & { codexLinkState?: CodexLinkState; codexLinkAction?: "authorize" | "disconnect" }) => {
    const current = snapshotRef.current;
    const { codexLinkState, codexLinkAction, ...nextPreferences } = preferences;
    const next: GameSnapshot = {
      ...current,
      revision: current.revision + 1,
      locale: nextPreferences.locale ?? current.locale,
      preferences: { ...current.preferences, ...nextPreferences },
      codexLink: codexLinkState ? { state: codexLinkState } : codexLinkAction === "authorize" ? { state: "restart-required" } : current.codexLink,
    };
    commitSnapshot(next);
    void callTool("monster_expedition_preferences", {
      commandId: commandId("preferences"),
      expectedRevision: current.revision,
      preferences: {
        ...nextPreferences,
        ...(codexLinkState ? { codexLinkState } : {}),
        ...(codexLinkAction ? { codexLinkAction } : {}),
      },
    }).catch(() => setSyncState("failed"));
  }, [callTool, commitSnapshot]);

  const requestMode = useCallback(async (mode: DisplayMode) => {
    if (!availableModes.includes(mode) && appRef.current) return;
    if (!appRef.current) {
      modeRef.current = mode;
      setCurrentMode(mode);
      return;
    }
    try {
      const result = await appRef.current.requestDisplayMode({ mode });
      const granted = result.mode as DisplayMode;
      modeRef.current = granted;
      setCurrentMode(granted);
      updatePreferences({ displayMode: granted });
    } catch {
      setSyncState("failed");
    }
  }, [availableModes, updatePreferences]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key.toLowerCase() !== "f" || target?.matches("input, textarea, button, select")) return;
      event.preventDefault();
      void requestMode(modeRef.current === "fullscreen" ? "inline" : "fullscreen");
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [requestMode]);

  const renderGameToText = useCallback(() => {
    const current = snapshotRef.current;
    const pending = current.pendingChoices[0];
    return JSON.stringify({
      coordinateSystem: "Pixi expedition stage uses a 960x420 logical canvas; origin is top-left, x increases right, y increases down.",
      displayMode: modeRef.current,
      activeTab: tabRef.current,
      locale: current.locale,
      expedition: {
        route: current.expedition.routeId,
        progress: Number(current.expedition.progress.toFixed(4)),
        status: current.expedition.status,
        elapsedEffectiveMs: current.elapsed.effectiveMs,
      },
      team: {
        activeMonsterIds: current.team.activeMonsterIds,
        leadMonsterId: current.team.leadMonsterId,
        synergy: current.team.synergy,
      },
      trainer: {
        level: current.trainer.level,
        unspentSkillPoints: current.trainer.unspentSkillPoints,
        unlockedNodeIds: current.trainer.unlockedNodeIds,
      },
      resources: current.resources,
      gear: {
        inventoryIds: current.gear.inventory.map((item) => item.id),
        equipped: current.gear.equipped,
      },
      camp: {
        unlockedNodeIds: current.camp.unlockedNodeIds,
        spentGold: current.camp.spentGold,
      },
      bond: current.bond,
      codexLink: current.codexLink.state,
      preferences: current.preferences,
      pendingReward: pending ? { id: pending.id, optionIds: pending.options.map((option) => option.id), open: rewardOpen } : null,
      availableActions: [
        "open_fullscreen",
        "choose_reward",
        "switch_leader",
        "unlock_skill",
        "build_camp",
        "toggle_preferences",
      ],
    });
  }, [availableModes, rewardOpen]);

  useEffect(() => {
    window.render_game_to_text = () => renderGameToText();
    window.advanceTime = (ms: number) => {
      const safeMs = Math.max(0, Math.min(Number.isFinite(ms) ? ms : 0, 12 * 60 * 60_000));
      const current = snapshotRef.current;
      const nextProgress = Math.min(0.985, current.expedition.progress + safeMs / (24 * 60 * 60_000));
      const next: GameSnapshot = {
        ...current,
        revision: current.revision + 1,
        lastSimulatedAt: new Date(Date.now() + safeMs).toISOString(),
        elapsed: {
          realMs: current.elapsed.realMs + safeMs,
          effectiveMs: current.elapsed.effectiveMs + safeMs * 0.8,
        },
        expedition: { ...current.expedition, progress: nextProgress },
        demoClockMs: current.demoClockMs + safeMs,
      };
      commitSnapshot(next);
      return renderGameToText();
    };
    return () => {
      delete window.render_game_to_text;
      delete window.advanceTime;
    };
  }, [commitSnapshot, renderGameToText]);

  const setLeader = useCallback((monsterId: string) => {
    optimisticAct(
      { type: "set_team", monsterIds: snapshotRef.current.team.activeMonsterIds, leadMonsterId: monsterId },
      (current) => ({ ...current, team: { ...current.team, leadMonsterId: monsterId } }),
    );
  }, [optimisticAct]);

  const attemptBefriend = useCallback((encounterId: string) => {
    optimisticAct({ type: "attempt_befriend", encounterId }, (current) => ({
      ...current,
      pendingEncounters: current.pendingEncounters.filter((entry) => !isRecord(entry) || entry.id !== encounterId),
    }));
  }, [optimisticAct]);

  const unlockSkill = useCallback((nodeId: string) => {
    if (snapshotRef.current.trainer.unspentSkillPoints < 1) return;
    optimisticAct({ type: "unlock_trainer_node", nodeId }, (current) => ({
      ...current,
      trainer: {
        ...current.trainer,
        unspentSkillPoints: current.trainer.unspentSkillPoints - 1,
        unlockedNodeIds: [...current.trainer.unlockedNodeIds, nodeId],
      },
    }));
  }, [optimisticAct]);

  const unlockCamp = useCallback((nodeId: string, cost: number) => {
    if (snapshotRef.current.resources.gold < cost) return;
    optimisticAct({ type: "unlock_camp_node", nodeId }, (current) => ({
      ...current,
      resources: { ...current.resources, gold: current.resources.gold - cost },
      camp: {
        ...current.camp,
        unlockedNodeIds: [...current.camp.unlockedNodeIds, nodeId],
        spentGold: current.camp.spentGold + cost,
      },
    }));
  }, [optimisticAct]);

  const upgradeGear = useCallback((gearId: string) => {
    if (snapshotRef.current.resources.gearMaterials < 5) return;
    optimisticAct({ type: "upgrade_gear", gearId }, (current) => ({
      ...current,
      resources: { ...current.resources, gearMaterials: current.resources.gearMaterials - 5 },
      gear: {
        ...current.gear,
        inventory: current.gear.inventory.map((item) => item.id === gearId ? { ...item, quality: item.quality === "common" ? "refined" : "legendary", power: item.power + 10 } : item),
      },
    }));
  }, [optimisticAct]);

  const toggleGearLock = useCallback((gearId: string, locked: boolean) => {
    optimisticAct({ type: "lock_gear", gearId, locked }, (current) => ({
      ...current,
      gear: {
        ...current.gear,
        inventory: current.gear.inventory.map((item) => item.id === gearId ? { ...item, locked } : item),
      },
    }));
  }, [optimisticAct]);

  const chooseReward = useCallback((item: GearItem) => {
    const choice = snapshotRef.current.pendingChoices[0];
    if (!choice) return;
    optimisticAct({ type: "choose_reward", choiceId: choice.id, optionId: item.id }, (current) => ({
      ...current,
      gear: { ...current.gear, inventory: [...current.gear.inventory, item] },
      pendingChoices: current.pendingChoices.filter((candidate) => candidate.id !== choice.id),
    }));
    setRewardOpen(false);
    setToast("app.selected");
    window.setTimeout(() => setToast(null), 2_000);
  }, [optimisticAct, t]);

  const resetDemo = useCallback(() => {
    const next = makeDemoSnapshot();
    next.locale = snapshotRef.current.locale;
    next.preferences.locale = next.locale;
    commitSnapshot(next);
    setActiveTab("expedition");
    setRewardOpen(false);
  }, [commitSnapshot]);

  const changeLocale = useCallback((locale: Locale) => updatePreferences({ locale }), [updatePreferences]);
  const toggleLocale = useCallback(() => changeLocale(snapshotRef.current.locale === "en" ? "zh-CN" : "en"), [changeLocale]);
  const effectiveReducedMotion = snapshot.preferences.reducedMotion || systemReducedMotion;
  const effectiveSnapshot = useMemo(() => effectiveReducedMotion === snapshot.preferences.reducedMotion ? snapshot : {
    ...snapshot,
    preferences: { ...snapshot.preferences, reducedMotion: true },
  }, [effectiveReducedMotion, snapshot]);

  const pendingChoice = snapshot.pendingChoices[0] ?? null;
  const panelProps: GamePanelProps = {
    snapshot: effectiveSnapshot,
    t,
    onLeader: setLeader,
    onBefriend: attemptBefriend,
    onSkill: unlockSkill,
    onCamp: unlockCamp,
    onUpgrade: upgradeGear,
    onToggleLock: toggleGearLock,
    onPreference: updatePreferences,
    onLocale: changeLocale,
    onReset: resetDemo,
  };

  const activePanel = (() => {
    switch (activeTab) {
      case "team": return <TeamPanel {...panelProps} />;
      case "gear": return <GearPanel {...panelProps} />;
      case "trainer": return <TrainerPanel {...panelProps} />;
      case "camp": return <CampPanel {...panelProps} />;
      case "journal": return <JournalPanel {...panelProps} />;
      case "codex": return <CodexPanel {...panelProps} />;
      case "settings": return <SettingsPanel {...panelProps} />;
      default: return <ExpeditionPanel {...panelProps} />;
    }
  })();

  if (!hostReady) return <main className="loading-page"><span className="loading-crest" aria-hidden="true" /><strong>{translate(readInitialLocale(), "app.syncing")}</strong></main>;
  if (currentMode === "inline") return <InlineLauncher snapshot={effectiveSnapshot} t={t} locale={snapshot.locale} onLocale={toggleLocale} onMode={(mode) => void requestMode(mode)} />;

  const number = new Intl.NumberFormat(snapshot.locale);
  return (
    <main className="game-shell">
      <header className="game-header">
        <div className="brand-lockup"><div className="brand-crest" aria-hidden="true"><i /></div><div><span>{t("app.chapterKicker")}</span><strong>{t("app.title")}</strong><small>{t("app.subtitle")}</small></div></div>
        <div className="resource-row">
          <ResourcePill tone="gold" label={t("resource.gold")} value={number.format(snapshot.resources.gold)} />
          <ResourcePill tone="green" label={t("resource.materials")} value={number.format(snapshot.resources.gearMaterials)} />
          <ResourcePill tone="blue" label={t("resource.observation")} value={number.format(snapshot.resources.speciesObservation)} />
        </div>
        <div className="header-actions">
          <button className={`sync-button state-${syncState}`} onClick={() => void syncGame()}><span aria-hidden="true" />{syncState === "syncing" ? t("app.syncing") : syncState === "synced" ? t("app.synced") : syncState === "failed" ? t("app.syncFailed") : t("app.sync")}</button>
          {pendingChoice && <button className="reward-button" onClick={() => setRewardOpen(true)}><span aria-hidden="true" />{t("app.claim")}</button>}
          <button className="language-pill" onClick={toggleLocale}>{t("locale.switch")}</button>
          {availableModes.includes("inline") && <button className="icon-action inline-action" onClick={() => void requestMode("inline")} aria-label={t("app.returnInline")}><span aria-hidden="true" /></button>}
        </div>
      </header>

      <section className="stage-frame">
        <ExpeditionStage ariaLabel={t("stage.aria")} demoClockMs={snapshot.demoClockMs} reducedMotion={effectiveReducedMotion} />
        <div className="stage-vignette" aria-hidden="true" />
        <div className="chapter-plaque"><span>{t("stage.traveling")}</span><strong>{t("stage.route")}</strong><small>{t("stage.time")}</small></div>
        <button className="bond-stage-button" onClick={() => setActiveTab("codex")}><BondRing snapshot={snapshot} t={t} /></button>
        <StageParty snapshot={snapshot} t={t} />
        <div className="encounter-flag"><span aria-hidden="true" /><div><small>{t("stage.next")}</small><strong>{t("stage.nextValue")}</strong></div></div>
        {pendingChoice && <button className="stage-treasure" onClick={() => setRewardOpen(true)}><i aria-hidden="true" /><span>{t("bond.pending")}</span></button>}
        <div className="stage-route-progress"><span style={{ width: `${snapshot.expedition.progress * 100}%` }} /><i style={{ left: `${snapshot.expedition.progress * 100}%` }} /></div>
      </section>

      <nav className="journal-tabs" aria-label={t("app.title")}>
        {TABS.map((tab) => <button key={tab} className={activeTab === tab ? "is-active" : ""} aria-current={activeTab === tab ? "page" : undefined} onClick={() => setActiveTab(tab)}><TabGlyph tab={tab} /><span>{t(`nav.${tab}` as MessageKey)}</span>{tab === "gear" && pendingChoice && <i className="tab-alert" />}</button>)}
      </nav>
      <section className="field-journal">{activePanel}</section>
      {pendingChoice && rewardOpen && <RewardOverlay choice={pendingChoice} t={t} onClose={() => setRewardOpen(false)} onChoose={chooseReward} />}
      {toast && <div className="game-toast" role="status"><span aria-hidden="true">✓</span>{t(toast)}</div>}
      {error && browserPreview && <span className="preview-badge">{t("app.preview")}</span>}
    </main>
  );
}
