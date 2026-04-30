import { DEFAULT_DRAW_REVEAL_SECONDS } from "./game.js";
import {
  applyDefaultSettingsMigration,
  readInitialAppSettings,
  syncModeSpecificInputs,
  syncRoomPanelRulesetState,
} from "./app-shell-state";
import { createRandomRoomId, normalizeRoomId } from "./network.js";
import { DEFAULT_RULESET, getRuleset } from "./rules.js";
import { DEFAULT_SCORING_ENABLED, normalizeScoringEnabled } from "./scoring.js";
import { DEFAULT_SOLO_DIFFICULTY, normalizeSoloDifficulty } from "./solo-controller.js";
import type { AppGameMode, AppState } from "./runtime-shell-types";

export const GAME_MODE_STORAGE_KEY = "mahjong-game-mode";
export const PLAYER_NAME_STORAGE_KEY = "mahjong-player-name";
export const SOLO_DIFFICULTY_STORAGE_KEY = "mahjong-solo-difficulty";
export const SCORING_ENABLED_STORAGE_KEY = "mahjong-scoring-enabled";
export const DEFAULTS_VERSION_STORAGE_KEY = "mahjong-defaults-version";
export const GAME_MODE_ONLINE = "online";
export const GAME_MODE_SOLO = "solo-bot";
export const DEFAULTS_VERSION = "20260428-solo-hard-scoring-on";
export const DEFAULT_RULESET_ID = DEFAULT_RULESET;

export function createInitializedAppState(): AppState {
  const appState = createDefaultAppState();
  const queryRoom = new URL(window.location.href).searchParams.get("room");

  applyDefaultSettingsMigration({
    queryRoom,
    defaultsVersionStorageKey: DEFAULTS_VERSION_STORAGE_KEY,
    defaultsVersion: DEFAULTS_VERSION,
    gameModeStorageKey: GAME_MODE_STORAGE_KEY,
    soloDifficultyStorageKey: SOLO_DIFFICULTY_STORAGE_KEY,
    scoringEnabledStorageKey: SCORING_ENABLED_STORAGE_KEY,
    soloModeValue: GAME_MODE_SOLO,
    onlineModeValue: GAME_MODE_ONLINE,
    defaultSoloDifficulty: DEFAULT_SOLO_DIFFICULTY,
    defaultScoringEnabled: DEFAULT_SCORING_ENABLED,
    normalizeGameMode,
    normalizeSoloDifficulty,
    normalizeScoringEnabled,
  });

  Object.assign(
    appState,
    readInitialAppSettings({
      queryRoom,
      gameModeStorageKey: GAME_MODE_STORAGE_KEY,
      playerNameStorageKey: PLAYER_NAME_STORAGE_KEY,
      soloDifficultyStorageKey: SOLO_DIFFICULTY_STORAGE_KEY,
      scoringEnabledStorageKey: SCORING_ENABLED_STORAGE_KEY,
      soloModeValue: GAME_MODE_SOLO,
      onlineModeValue: GAME_MODE_ONLINE,
      normalizeGameMode,
      normalizeRoomId,
      normalizeSoloDifficulty,
      normalizeScoringEnabled,
      createRandomRoomId,
    }),
  );

  syncModeSpecificInputs(appState, { createRandomRoomId, soloModeValue: GAME_MODE_SOLO });
  syncRoomPanelRulesetState(appState, { room: null, normalizeRulesetId });

  return appState;
}

export function normalizeGameMode(value: unknown): AppGameMode {
  return value === GAME_MODE_SOLO ? GAME_MODE_SOLO : GAME_MODE_ONLINE;
}

export function normalizeRulesetId(value?: string) {
  return getRuleset(value || DEFAULT_RULESET).id;
}

function createDefaultAppState(): AppState {
  return {
    room: null,
    message: "",
    error: "",
    lastLobbyAction: "",
    selectedMode: GAME_MODE_SOLO,
    playerName: "",
    createRoomCode: "",
    joinRoomCode: "",
    selectedRulesetId: DEFAULT_RULESET,
    selectedDrawRevealSeconds: DEFAULT_DRAW_REVEAL_SECONDS,
    selectedSoloDifficulty: DEFAULT_SOLO_DIFFICULTY,
    selectedScoringEnabled: DEFAULT_SCORING_ENABLED,
    roomPanelRulesetId: DEFAULT_RULESET,
    roomPanelRulesetDirty: false,
    roomPanelRoomId: "",
  };
}
