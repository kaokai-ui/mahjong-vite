import { createAppBridgeRuntime } from "./app-bridge-runtime";
import { createAppModeRuntime } from "./app-mode-runtime";
import { createAppRenderRuntime } from "./app-render-runtime";
import {
  DEFAULT_RULESET_ID,
  GAME_MODE_ONLINE,
  GAME_MODE_SOLO,
  GAME_MODE_STORAGE_KEY,
  SCORING_ENABLED_STORAGE_KEY,
  SOLO_DIFFICULTY_STORAGE_KEY,
  SOLO_PLAYER_COUNT_STORAGE_KEY,
  normalizeGameMode,
  normalizeRulesetId,
} from "./app-bootstrap-state";
import { createRandomFirebaseRoomId, normalizeFirebaseRoomId } from "./firebase-rules-contract.js";
import {
  syncModeSpecificInputs,
  syncRoomPanelRulesetState,
  writeLocalSetting,
} from "./app-shell-state";
import {
  type GameRuntimeState,
  getDrawRevealState,
  normalizeDrawRevealSecondsValue,
  resetGameRuntimeState,
  triggerAutoDrawIfNeeded,
} from "./game-runtime-state";
import { normalizeScoringEnabled } from "./scoring.js";
import { normalizeSoloDifficulty, normalizeSoloPlayerCount } from "./solo-controller.js";
import type {
  AppState,
  BootstrapRuntimes,
  BridgeRuntime,
  ModeRuntime,
  RenderRuntime,
} from "./runtime-shell-types";

export function createBootstrapRuntimes(appState: AppState, runtimeState: GameRuntimeState): BootstrapRuntimes {
  let bridgeRuntime: BridgeRuntime | null = null;
  let renderRuntime: RenderRuntime | null = null;

  const modeRuntime = createAppModeRuntime(appState, {
    createRandomRoomId: createRandomFirebaseRoomId,
    gameModeStorageKey: GAME_MODE_STORAGE_KEY,
    normalizeRulesetId,
    render: () => renderRuntime!.render(),
    resetGameRuntimeState: () => resetGameRuntimeState(runtimeState),
    soloModeValue: GAME_MODE_SOLO,
    syncBridgeSnapshot: () => bridgeRuntime!.syncBridgeSnapshot(),
    syncModeSpecificInputs,
    syncRoomPanelRulesetState,
    writeLocalSetting,
  }) as ModeRuntime;

  bridgeRuntime = createAppBridgeRuntime(appState, {
    createRandomRoomId: createRandomFirebaseRoomId,
    defaultRulesetId: DEFAULT_RULESET_ID,
    getController: modeRuntime.getController,
    getDrawRevealState,
    handleUiAction: (action: string) => renderRuntime!.runUiAction(action),
    normalizeDrawRevealSecondsValue,
    normalizeGameMode,
    normalizeRoomId: normalizeFirebaseRoomId,
    normalizeRulesetId,
    normalizeScoringEnabled,
    normalizeSoloDifficulty,
    normalizeSoloPlayerCount,
    onlineModeValue: GAME_MODE_ONLINE,
    render: () => renderRuntime!.render(),
    runtimeState,
    scoringEnabledStorageKey: SCORING_ENABLED_STORAGE_KEY,
    soloDifficultyStorageKey: SOLO_DIFFICULTY_STORAGE_KEY,
    soloPlayerCountStorageKey: SOLO_PLAYER_COUNT_STORAGE_KEY,
    soloModeValue: GAME_MODE_SOLO,
    switchMode: modeRuntime.switchMode,
    writeLocalSetting,
  }) as BridgeRuntime;

  renderRuntime = createAppRenderRuntime(appState, {
    getController: modeRuntime.getController,
    getDrawRevealState,
    resetGameRuntimeState: () => resetGameRuntimeState(runtimeState),
    runtimeState,
    syncBridgeSnapshot: () => bridgeRuntime!.syncBridgeSnapshot(),
    triggerAutoDrawIfNeeded,
  }) as RenderRuntime;

  return {
    bridgeRuntime,
    modeRuntime,
    renderRuntime,
  };
}
