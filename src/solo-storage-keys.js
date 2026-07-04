// Single source of truth for localStorage keys shared across the solo/app shell.
// Kept as a plain .js module so it can be imported from both the node-run
// solo-controller.js tests and the TypeScript app shell modules.
export const SOLO_STORAGE_KEYS = Object.freeze({
  gameMode: "mahjong-game-mode",
  playerName: "mahjong-player-name",
  soloDifficulty: "mahjong-solo-difficulty",
  soloPlayerCount: "mahjong-solo-player-count",
  scoringEnabled: "mahjong-scoring-enabled",
  defaultsVersion: "mahjong-defaults-version",
});
