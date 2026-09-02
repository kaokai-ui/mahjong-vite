# Multiplayer Architecture

- Model: Firebase RTDB with SDK-first normal writes and immediate host processing.
- Room authority: project-specific room state and local admin/network helpers.
- Presence: verify with local network sanity checks.

## Before Editing

Read:

- `AGENTS.md`
- `local-admin/DEVELOPMENT_NOTES.md`
- `local-admin/NETWORK_MULTIPLAYER_SANITY_CHECKS.md`
- `D:\Game\firebase-project-architecture.md`
- `D:\Game\firebase-development-notes.md`

## Rules

- Run the integrity checker before browser/network tests.
- Verify create/join/action/reconnect/presence for multiplayer changes.
- For PWA changes, verify online and solo install scopes are intentionally shared or separated.

## Online 4P Table Layout

- `雙人遊戲 4P` is a four-seat table with two human seats and two bot seats.
- The React table uses the live `tableStage.seatCount` as the authoritative layout signal, so online 4P cannot fall back to the two-seat shell during the first snapshot.
- Online 4P and solo 4P share the same `table-shell-four` / `table-center-four` layout: opponent at the top, 上家 on the left, 下家 on the right, and the local player at the bottom.
- All four discard rows stay in the center board and use one shared horizontal scroll viewport. Side seat cards fill the same grid row as the center board so their top and bottom edges remain aligned in normal and native-fullscreen viewports.
- Validate both desktop and iPad-like geometry with:
  - `node local-admin/scripts/network-live-dual-client-smoke.mjs --game-mode=online-4p --scenario=layout --viewport=1440x900 --app-check-mode=off`
  - `node local-admin/scripts/network-live-dual-client-smoke.mjs --game-mode=online-4p --scenario=layout --viewport=1024x768 --touch --app-check-mode=off`
