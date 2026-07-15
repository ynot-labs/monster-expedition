# Monster Expedition / 怪兽远征

Monster Expedition is a local-first, English-first monster companion idle game for macOS Codex Desktop. Your party travels from Windmill Plains to Ridge Market while you work; the leading monster can also appear as a small non-activating desktop Pet.

`100,000 new Codex Tokens → 1 Bond Burst → next elite/boss phase wins → extra gear choice.`

The game has no agent lore, cloud account, analytics, transcript reader, or network service. Codex is only the host and—when a player explicitly connects it—a local numerical input for Bond Burst.

## What is included

- React 19 + PixiJS 8 Codex App panel: a live auto-battle lane with waves, enemy health, visible attacks, loot ticks, party levels, and English-default instant `中文` / `EN` switching.
- A deterministic 20–24 hour idle route with four monsters, two active slots, a four-signal synergy ring, Trainer skills, Camp upgrades, gear upgrading, offline progress, failure protection, and a three-stage final boss.
- A Swift AppKit + SpriteKit accessory Helper: no Dock icon, no normal window, no focus stealing, drag-safe desktop Pet, reduced-motion support, a 0600 local socket, and content-free Codex work-state feedback.
- The distributed app is native-only: it contains the Helper and a prebuilt static panel, with no embedded Node runtime and no player-side Node requirement.
- A local-only OTel receiver that accepts only `codex.sse_event` `response.completed` token totals; it never persists prompts, replies, code, tool data, model names, session IDs, or raw event payloads.
- A public-marketplace manifest, build scripts, CI, release checklist, privacy notice, and uninstall instructions.

## Development

Requirements: macOS 14+, Node 24+, npm, and Swift 5.10+ (Swift 6 recommended). Full Xcode and an Apple Developer ID are needed only for a signed public DMG.

```sh
npm install
npm run check
```

For the panel preview:

```sh
npm run dev:widget
```

For the native Pet:

```sh
npm run build:native
native/.build/release/MonsterExpeditionHelper
```

The Helper is the complete local game authority. The plugin launcher starts it without activating it, then uses its stdio MCP endpoint. The Helper owns the SQLite snapshot and exposes it to both the Codex panel and the desktop Pet, so both surfaces reflect the same leader, battle state, Bond reward, language, and content-free Codex activity.

## Token connection and privacy

The game runs fully without Codex Link. Selecting **Connect Codex** is an explicit opt-in. It creates a time-stamped backup of `~/.codex/config.toml` and appends only its marked OTel block with `log_user_prompt = false` and a `127.0.0.1` endpoint. Existing OTel configuration is never overwritten; the Link instead reports a conflict and the game keeps running.

Only `response.completed` integer token totals are converted to HMAC-deduplicated local game events. The receiver immediately drops all other fields. Disconnect removes only the marked block and local queue.

See [Privacy](docs/PRIVACY.md), [installation](docs/INSTALL.md), and [uninstall](docs/UNINSTALL.md).

## Public release status

The demo source is ready for a public GitHub Marketplace repository. A polished public binary still requires the owner to provide a Developer ID Application certificate, notarization credentials, and full Xcode; these are intentional Apple-side release gates, not bypassed by the project.

Run `npm run package:app` to build an ad-hoc local `.app`; run the release workflow with signing secrets to generate the notarized DMG.
