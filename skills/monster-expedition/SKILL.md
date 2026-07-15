---
name: monster-expedition
description: Open, sync, manage, or diagnose Monster Expedition, a local bilingual monster companion idle game for Codex. Use when the user asks to start the expedition, see the floating pet, manage monsters or gear, check Bond progress, switch language, or export local diagnostics.
---

# Monster Expedition

Monster Expedition is English-first, local-only, and playable without a Token connection. Its floating lead monster is rendered by the optional signed macOS Helper; its management interface opens as an MCP App in Codex.

## Open the experience

1. Call `monster_expedition_open`.
2. Present the returned widget and let the user click **Open Expedition** to request Codex's larger panel mode.
3. If the Helper is missing, explain that the game still opens in development mode but the programmable floating Pet requires the signed macOS Helper.

The host owns display mode. Never claim the panel is permanent, and never describe Inline mode as a floating Pet.

## Sync and actions

- Call `monster_expedition_sync` before reporting current progress after a long absence.
- Use `monster_expedition_act` for reward choices, leader changes, team changes, gear upgrades, Trainer skills, Camp nodes, and naming.
- Use `monster_expedition_preferences` for `en` / `zh-CN`, sound, reduced motion, Pet visibility, and Codex Link setup state.
- Every write must preserve the widget-provided `commandId` and `expectedRevision`. If a revision is stale, reopen or sync instead of guessing.
- `Bond Burst` is earned every 100,000 newly received local Codex Tokens, stores at most two charges, triggers only on the next elite or boss phase, and grants an extra one-of-three gear choice.

## Setup

If the user explicitly asks to set up the public demo:

1. Check whether `/Applications/Monster Expedition.app` or `~/Applications/Monster Expedition.app` exists.
2. If it is missing, point to the release instructions rather than silently downloading or installing code.
3. Token connection is optional. The Helper must show the exact local Codex configuration diff and receive explicit confirmation before changing it.
4. If an existing Codex OpenTelemetry exporter is configured, do not replace it; report `Codex Link unavailable` while keeping the expedition playable.

## Privacy

The game does not read transcript files and does not collect analytics. A connected Helper only accepts local `response.completed` token totals on loopback, discards the rest of the event in memory, and stores no prompts, replies, code, model names, conversation identifiers, or raw OpenTelemetry payloads. `monster_expedition_export_diagnostics` returns a redacted local summary and never uploads it.
