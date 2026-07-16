# Install the demo

1. Download the signed `Monster Expedition.dmg` from the GitHub Release.
2. Drag `Monster Expedition.app` into `/Applications` and open it once. This starts the floating companion only; it intentionally has no ordinary game window.
3. In current Codex Desktop preview builds, enable **MCP Apps** in the developer feature settings, then fully restart Codex. Without this host feature, the game tool can run but Codex shows only its text response instead of the battle UI.
4. Add the Monster Expedition GitHub Marketplace in Codex, then install the plugin.
5. Start a **new Codex task** and ask: `Open Monster Expedition`. Codex renders the playable auto-battle panel beside the task; this is where monsters fight, level up, and rewards are chosen.
6. Optional: open **Codex Link** and choose **Connect Codex**. Review the local change, then restart Codex once.

The DMG contains the small native Helper and a prebuilt panel; players do not need Node, a database installation, or another game launcher. The game works without step 5. The Helper is an accessory process: it has no Dock icon and should not take keyboard focus.

Opening the `.app` alone cannot open a Codex side panel—the Codex host opens that panel only after the installed plugin calls its MCP App resource. If only the Pet is visible, complete steps 3–5 rather than looking for a game window in the app.

If Gatekeeper blocks the DMG, stop and verify that the Release is signed and notarized. Do not bypass Gatekeeper for an unsigned build.
