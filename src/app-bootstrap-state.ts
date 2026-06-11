import { DEFAULT_DRAW_REVEAL_SECONDS } from "./game.js";
import { ONLINE_MULTIPLAYER_ENABLED } from "./app-variant";
import {
  applyDefaultSettingsMigration,
  readInitialAppSettings,
  syncModeSpecificInputs,
  syncRoomPanelRulesetState,
} from "./app-shell-state";
import { createRandomFirebaseRoomId, normalizeFirebaseRoomId } from "./firebase-rules-contract.js";
import {
  GAME_MODE_ONLINE_2P,
  GAME_MODE_SOLO as GAME_MODE_SOLO_VALUE,
  normalizeAppGameMode,
} from "./game-mode.js";
import { getAppShellVariantPreset } from "./page-shell-variant";
import { DEFAULT_RULESET, getRuleset } from "./rules.js";
import { DEFAULT_SCORING_ENABLED, normalizeScoringEnabled } from "./scoring.js";
import {
  DEFAULT_SOLO_DIFFICULTY,
  DEFAULT_SOLO_PLAYER_COUNT,
  normalizeSoloDifficulty,
  normalizeSoloPlayerCount,
} from "./solo-controller.js";
import type { AppGameMode, AppState } from "./runtime-shell-types";

export const GAME_MODE_STORAGE_KEY = "mahjong-game-mode";
export const PLAYER_NAME_STORAGE_KEY = "mahjong-player-name";
export const SOLO_DIFFICULTY_STORAGE_KEY = "mahjong-solo-difficulty";
export const SOLO_PLAYER_COUNT_STORAGE_KEY = "mahjong-solo-player-count";
export const SCORING_ENABLED_STORAGE_KEY = "mahjong-scoring-enabled";
export const DEFAULTS_VERSION_STORAGE_KEY = "mahjong-defaults-version";
export const GAME_MODE_ONLINE = GAME_MODE_ONLINE_2P;
export const GAME_MODE_SOLO = GAME_MODE_SOLO_VALUE;
export const DEFAULTS_VERSION = "20260501-solo-player-count-entry";
export const DEFAULT_RULESET_ID = DEFAULT_RULESET;

export function createInitializedAppState(): AppState {
  const appState = createDefaultAppState();
  const queryRoom = new URL(window.location.href).searchParams.get("room");
  const effectiveQueryRoom = ONLINE_MULTIPLAYER_ENABLED ? queryRoom : null;

  applyDefaultSettingsMigration({
    queryRoom: effectiveQueryRoom,
    defaultsVersionStorageKey: DEFAULTS_VERSION_STORAGE_KEY,
    defaultsVersion: DEFAULTS_VERSION,
    gameModeStorageKey: GAME_MODE_STORAGE_KEY,
    soloDifficultyStorageKey: SOLO_DIFFICULTY_STORAGE_KEY,
    scoringEnabledStorageKey: SCORING_ENABLED_STORAGE_KEY,
    soloPlayerCountStorageKey: SOLO_PLAYER_COUNT_STORAGE_KEY,
    soloModeValue: GAME_MODE_SOLO,
    onlineModeValue: GAME_MODE_ONLINE,
    defaultSoloDifficulty: DEFAULT_SOLO_DIFFICULTY,
    defaultScoringEnabled: DEFAULT_SCORING_ENABLED,
    normalizeGameMode,
    normalizeSoloDifficulty,
    normalizeSoloPlayerCount,
    normalizeScoringEnabled,
  });

  Object.assign(
    appState,
    readInitialAppSettings({
      queryRoom: effectiveQueryRoom,
      gameModeStorageKey: GAME_MODE_STORAGE_KEY,
      playerNameStorageKey: PLAYER_NAME_STORAGE_KEY,
      soloDifficultyStorageKey: SOLO_DIFFICULTY_STORAGE_KEY,
      scoringEnabledStorageKey: SCORING_ENABLED_STORAGE_KEY,
      soloPlayerCountStorageKey: SOLO_PLAYER_COUNT_STORAGE_KEY,
      soloModeValue: GAME_MODE_SOLO,
      onlineModeValue: GAME_MODE_ONLINE,
      normalizeGameMode,
      normalizeRoomId: normalizeFirebaseRoomId,
      normalizeSoloDifficulty,
      normalizeSoloPlayerCount,
      normalizeScoringEnabled,
      createRandomRoomId: createRandomFirebaseRoomId,
    }),
  );

  applyAppShellVariantPreset(appState);
  syncModeSpecificInputs(appState, { createRandomRoomId: createRandomFirebaseRoomId, soloModeValue: GAME_MODE_SOLO });
  syncRoomPanelRulesetState(appState, { room: null, normalizeRulesetId });

  return appState;
}

export function normalizeGameMode(value: unknown): AppGameMode {
  if (!ONLINE_MULTIPLAYER_ENABLED) {
    return GAME_MODE_SOLO;
  }

  return normalizeAppGameMode(value);
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
    selectedSoloPlayerCount: DEFAULT_SOLO_PLAYER_COUNT,
    selectedScoringEnabled: DEFAULT_SCORING_ENABLED,
    roomPanelRulesetId: DEFAULT_RULESET,
    roomPanelRulesetDirty: false,
    roomPanelRoomId: "",
  };
}

function applyAppShellVariantPreset(appState: AppState) {
  const preset = getAppShellVariantPreset();
  if (!preset) {
    return;
  }

  appState.selectedMode = normalizeGameMode(preset.mode);
  appState.selectedRulesetId = normalizeRulesetId(preset.rulesetId);
  appState.selectedDrawRevealSeconds = preset.drawRevealSeconds;
  appState.selectedSoloDifficulty = normalizeSoloDifficulty(preset.soloDifficulty);
  appState.selectedSoloPlayerCount = normalizeSoloPlayerCount(preset.soloPlayerCount);
  appState.selectedScoringEnabled = normalizeScoringEnabled(preset.scoringEnabled);
}
