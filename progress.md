Original prompt: Implement the approved “Monster Expedition / 怪兽远征：公开 Demo 新方案” in this project, including the Codex panel, Swift floating pet, 24-hour idle-game depth, local Token-driven Bond Burst, bilingual UI, packaging, and release validation.

## 2026-07-15

- Audited the existing project: it is a working Node/TypeScript MCP App carrier probe with React UI, two probe tests, and no native helper.
- Confirmed local tooling: Node 24, npm 11, Swift 6.2 and Swift Package Manager are present; only Command Line Tools are selected, no valid Developer ID identity is installed.
- Replaced the obsolete PiP hard-gate direction with three parallel implementation tracks:
  - deterministic game core + MCP tools;
  - React/Pixi Codex panel;
  - Swift/AppKit/SpriteKit helper.
- Public signing/notarization remains externally blocked by the missing Apple Developer identity and full Xcode installation; the repository will still include reproducible release scripts and CI.

## Working constraints

- Do not modify sibling prototypes outside `monster-expedition`.
- English is the default; every player-visible string must have `zh-CN` coverage.
- No analytics, prompt/session reading, cloud save, payments, or public network service.
- `window.render_game_to_text` and `window.advanceTime(ms)` are required in the browser panel for deterministic playtests.

## Pending

- Add the public GitHub remote and publish the first source commit.
- Configure Apple Developer ID / notarization secrets before attempting a signed public DMG.
- Run a developer 24-hour canary and an actual Codex-host OTel connection after the plugin is installed.

## 2026-07-15 implementation update

- Replaced the obsolete carrier probe with the deterministic 24-hour game core and five MCP tools. The core includes the four-monster signal ring, second-slot Trainer root, capture guarantees, gear upgrade choices, Camp tree, offline cap, boss insight, exact 100,000-token Bond Burst charges, and idempotent command/revision handling.
- Implemented the English-first React/Pixi Codex panel with a storybook-cel stage, responsive control panels, reward selection, team lead switching, localised UI, reduced motion, `render_game_to_text`, and `advanceTime`.
- Fixed the MCP delivery build so Pixi is bundled into one self-contained `ui://` HTML resource; no dynamic renderer chunk is required at runtime.
- Implemented the Swift AppKit/SpriteKit accessory Pet. It has no Dock icon or focus activation, uses a draggable transparent panel, and now changes visuals for Hammerpaw, Swiftwing, Mosshide, and Bellhorn when the game leader changes. Bond, elite, burst, reward, training, offline, and link-unavailable state animations are present.
- Added a narrow local Pet bridge. It carries only gameplay display fields from the Node MCP snapshot to the native Pet; it contains no conversation or telemetry content.
- Added opt-in-only Codex Link configuration with a marked reversible OTel block, config backup, conflict protection, loopback-only receiver, HMAC deduplication, and strict `response.completed` integer-token parsing. It deliberately rejects unknown schemas and preserves an existing user exporter.
- Added docs, GitHub Pages source, CI, signed-app/DMG/notarization scripts, public marketplace rendering, privacy/terms/install/uninstall notes, and a local ad-hoc app package.
- Verification completed: TypeScript typecheck, 8 Node tests, MCP integration test, 6 Swift tests, plugin validators, `npm run check`, `npm run package:app`, `codesign --verify`, browser interaction checks, and visual inspection of English and Chinese Pixi screenshots.
