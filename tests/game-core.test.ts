import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceGame,
  applyGameCommand,
  applySyncCommand,
  applyTokenEvents,
  createInitialSnapshot,
} from "../server/game-core.js";
import { HOUR_MS, MINUTE_MS } from "../server/game-content.js";
import { toPetBridgeSnapshot } from "../server/pet-bridge.js";

test("token counters create at most two Bond Bursts and deduplicate OTel batches", () => {
  const initial = createInitialSnapshot(new Date("2026-07-15T00:00:00.000Z"));
  const charged = applyTokenEvents(initial, [
    { id: "response-1", totalTokens: 100_000 },
    { id: "response-1", totalTokens: 100_000 },
    { id: "response-2", totalTokens: 150_000 },
  ]);
  assert.equal(charged.bond.charges, 2);
  assert.equal(charged.bond.currentTokens, 0);
  assert.equal(charged.bond.totalAcceptedTokens, 200_000);
  assert.equal(charged.pendingEvents.filter((event) => event.kind === "bond-ready").length, 2);
});

test("tutorial route grants the second monster slot, then guarantees Swiftwing on the second approach", () => {
  const startedAt = new Date("2026-07-15T00:00:00.000Z");
  let snapshot = createInitialSnapshot(startedAt);
  snapshot = advanceGame(snapshot, new Date(startedAt.getTime() + 13 * MINUTE_MS), { efficiency: 1 });
  const firstEncounter = snapshot.pendingEncounters.find((entry) => entry.speciesId === "swiftwing");
  assert.ok(firstEncounter);
  snapshot = applyGameCommand(snapshot, {
    commandId: "befriend-swiftwing-first",
    expectedRevision: snapshot.revision,
    action: { type: "attempt_befriend", encounterId: firstEncounter.id },
  }).snapshot;
  assert.equal(snapshot.monsters.swiftwing.befriended, false);

  snapshot = advanceGame(snapshot, new Date(startedAt.getTime() + 26 * MINUTE_MS), { efficiency: 1 });
  assert.ok(snapshot.trainer.unspentSkillPoints >= 1);
  snapshot = applyGameCommand(snapshot, {
    commandId: "unlock-dual-command",
    expectedRevision: snapshot.revision,
    action: { type: "unlock_trainer_node", nodeId: "dual-command" },
  }).snapshot;
  assert.equal(snapshot.team.maxSlots, 2);
  const secondEncounter = snapshot.pendingEncounters.find((entry) => entry.speciesId === "swiftwing");
  assert.ok(secondEncounter);
  snapshot = applyGameCommand(snapshot, {
    commandId: "befriend-swiftwing-second",
    expectedRevision: snapshot.revision,
    action: { type: "attempt_befriend", encounterId: secondEncounter.id },
  }).snapshot;
  assert.equal(snapshot.monsters.swiftwing.befriended, true);
  assert.deepEqual(snapshot.team.activeMonsterIds, ["hammerpaw", "swiftwing"]);
});

test("a Bond Burst makes the next elite win and leaves a separate bonus gear choice", () => {
  const startedAt = new Date("2026-07-15T00:00:00.000Z");
  let snapshot = createInitialSnapshot(startedAt);
  snapshot = applyTokenEvents(snapshot, [{ id: "response-full", totalTokens: 100_000 }]);
  snapshot = advanceGame(snapshot, new Date(startedAt.getTime() + 50 * MINUTE_MS), { efficiency: 1 });
  assert.equal(snapshot.bond.charges, 0);
  assert.equal(snapshot.expedition.activeChallenge, null);
  assert.ok(snapshot.pendingEvents.some((event) => event.kind === "bond-burst"));
  assert.equal(snapshot.pendingChoices.filter((choice) => choice.kind === "bonus-gear").length, 1);
  assert.equal(snapshot.pendingChoices.filter((choice) => choice.kind === "regular-gear").length, 1);
  assert.equal(toPetBridgeSnapshot(snapshot).petState, "bursting");
});

test("offline simulation is capped at twelve hours and segmented simulation is deterministic", () => {
  const startedAt = new Date("2026-07-15T00:00:00.000Z");
  const initial = createInitialSnapshot(startedAt);
  const capped = advanceGame(initial, new Date(startedAt.getTime() + 24 * HOUR_MS));
  assert.equal(capped.elapsed.realMs, 12 * HOUR_MS);
  const once = advanceGame(initial, new Date(startedAt.getTime() + 3 * HOUR_MS), { efficiency: 0.8 });
  const firstPart = advanceGame(initial, new Date(startedAt.getTime() + HOUR_MS), { efficiency: 0.8 });
  const segmented = advanceGame(firstPart, new Date(startedAt.getTime() + 3 * HOUR_MS), { efficiency: 0.8 });
  assert.equal(segmented.elapsed.effectiveMs, once.elapsed.effectiveMs);
  assert.equal(segmented.resources.gold, once.resources.gold);
});

test("commands reject stale revisions but replay safely with their command id", () => {
  const snapshot = createInitialSnapshot(new Date("2026-07-15T00:00:00.000Z"));
  const applied = applySyncCommand(snapshot, {
    commandId: "sync-command",
    expectedRevision: 0,
    tokenEvents: [],
  }, new Date("2026-07-15T00:00:00.000Z"));
  assert.equal(applied.snapshot.revision, 1);
  const replay = applySyncCommand(applied.snapshot, {
    commandId: "sync-command",
    expectedRevision: 0,
    tokenEvents: [],
  }, new Date("2026-07-15T00:01:00.000Z"));
  assert.equal(replay.duplicate, true);
  assert.equal(replay.snapshot.revision, 1);
  assert.throws(() => applyGameCommand(applied.snapshot, {
    commandId: "stale-action",
    expectedRevision: 0,
    action: { type: "rename_trainer", name: "Aster" },
  }));
});
