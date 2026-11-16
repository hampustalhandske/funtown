# Changelog

One line per change, newest first.

- 2026-11-16 15:35 · Letters: a session's end-of-turn message and each subagent's result show in its panel as rendered Markdown (12 lines, then Show all), with a reply box for background sessions; a lead whose agents still run shows "waiting on N agents", not "turn ended". CI also runs on main.
- 2026-11-16 15:10 · The page offers a reload after Funtown restarts (its terminals failed silently before), and a session Claude lists as failed shows stuck.
- 2026-11-16 15:02 · Pull requests run the lint, unit and browser tests on GitHub Actions (macOS, fake `claude`, no secrets).
- 2026-11-16 15:00 · `npm start` reinstalls the hooks (following CLAUDE_CONFIG_DIR); README and CLAUDE.md now say what stays local and what Funtown touches.
- 2026-11-16 14:50 · A session whose turn ended shows "turn ended", not "thinking", while its background commands still run.
- 2026-11-16 14:20 · Added the Needs you list: oldest first, ⌥N to jump, a sound per project, mute, toasts, system notifications and stuck agents.
- 2026-11-16 08:56 · Added a README and the MIT license.
- 2026-11-16 08:50 · Started this changelog; planning notes no longer live in the repo.
