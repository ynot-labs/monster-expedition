# Privacy / 隐私

Monster Expedition is local-only.

- Game save: local to this Mac.
- Desktop Pet bridge: local to this Mac, contains only gameplay display fields.
- Diagnostics: generated locally and never uploaded.
- Analytics: none.
- Accounts, cloud saves, ads, payments, and trackers: none.

If the player explicitly enables Codex Link, the game adds a clearly marked, reversible OpenTelemetry configuration block with `log_user_prompt = false`. It receives only local `response.completed` token totals over `127.0.0.1`. The receiver ignores prompt text, replies, code, files, tool arguments, model names, conversation IDs, and raw OTel payloads; none are written to the database or sent to the developer.

Codex Link is optional and never increases base idle speed or unlocks required content.
