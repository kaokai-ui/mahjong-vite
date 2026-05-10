import { setAppBridgeActions, updateAppBridgeSnapshot } from "./app-bridge";
import { buildAppBridgeSnapshot } from "./app-bridge-snapshot";
import { getGamePanelContext } from "./app-game-panel-runtime";
import { submitCreateRoom, submitJoinRoom } from "./app-lobby-submit-runtime";
import { createBridgeActions } from "./bridge-actions";
import {
  buildShareUrl,
  canUseFullscreenApi,
  clearShareLink,
  updateShareLink,
} from "./app-ui-runtime";
import type { DrawRevealContext, DrawRevealSnapshot, GameRuntimeState } from "./game-runtime-state";
import type { AppGameMode, AppState, BridgeRuntime, ControllerLike } from "./runtime-shell-types";

type CreateAppBridgeRuntimeDeps = {
  createRandomRoomId: () => string;
  defaultRulesetId: string;
  getController: () => ControllerLike;
  getDrawRevealState: (state: GameRuntimeState, context: DrawRevealContext) => DrawRevealSnapshot | null;
  handleUiAction: (action: string) => Promise<void>;
  normalizeDrawRevealSecondsValue: (value: unknown) => number;
  normalizeGameMode: (value: unknown) => AppGameMode;
  normalizeRoomId: (value: unknown) => string;
  normalizeRulesetId: (value?: string) => string;
  normalizeScoringEnabled: (value: unknown) => boolean;
  normalizeSoloDifficulty: (value: unknown) => string;
  normalizeSoloPlayerCount: (value: unknown) => number;
  onlineModeValue: AppGameMode;
  render: () => void;
  runtimeState: GameRuntimeState;
  scoringEnabledStorageKey: string;
  soloDifficultyStorageKey: string;
  soloPlayerCountStorageKey: string;
  soloModeValue: AppGameMode;
  switchMode: (mode: AppGameMode) => void;
  writeLocalSetting: (key: string, value: string) => void;
};

export function createAppBridgeRuntime(appState: AppState, deps: CreateAppBridgeRuntimeDeps): BridgeRuntime {
  const syncBridgeSnapshot = () => {
    updateAppBridgeSnapshot(
      buildAppBridgeSnapshot({
        appState,
        controller: deps.getController(),
        soloModeValue: deps.soloModeValue,
        gameContext: appState.room
          ? getGamePanelContext(
              appState,
              {
                runtimeState: deps.runtimeState,
                getDrawRevealState: deps.getDrawRevealState,
                getController: deps.getController,
                render: deps.render,
              },
              appState.room,
            )
          : null,
        fullscreenSupported: canUseFullscreenApi(),
      }),
    );
  };

  const registerBridgeActions = () => {
    setAppBridgeActions(
      createBridgeActions(appState, {
        buildShareUrl: () => buildShareUrl(appState.room),
        copyText: (text: string) => navigator.clipboard.writeText(text),
        createRandomRoomId: deps.createRandomRoomId,
        defaultRulesetId: deps.defaultRulesetId,
        handleCreateRoomSubmit: () =>
          submitCreateRoom(appState, {
            getController: deps.getController,
            soloModeValue: deps.soloModeValue,
            defaultRulesetId: deps.defaultRulesetId,
            normalizeDrawRevealSecondsValue: deps.normalizeDrawRevealSecondsValue,
            normalizeScoringEnabled: deps.normalizeScoringEnabled,
            normalizeSoloPlayerCount: deps.normalizeSoloPlayerCount,
            clearShareLink,
            updateShareLink,
            render: deps.render,
          }),
        handleJoinRoomSubmit: () =>
          submitJoinRoom(appState, {
            getController: deps.getController,
            onlineModeValue: deps.onlineModeValue,
            updateShareLink,
            render: deps.render,
          }),
        handleUiAction: deps.handleUiAction,
        normalizeDrawRevealSecondsValue: deps.normalizeDrawRevealSecondsValue,
        normalizeGameMode: deps.normalizeGameMode,
        normalizeRoomId: deps.normalizeRoomId,
        normalizeRulesetId: deps.normalizeRulesetId,
        normalizeScoringEnabled: deps.normalizeScoringEnabled,
        normalizeSoloDifficulty: deps.normalizeSoloDifficulty,
        normalizeSoloPlayerCount: deps.normalizeSoloPlayerCount,
        render: deps.render,
        scoringEnabledStorageKey: deps.scoringEnabledStorageKey,
        sendGameCommand: (command: string, payload?: unknown) =>
          deps.getController().sendGameCommand(command, payload),
        soloDifficultyStorageKey: deps.soloDifficultyStorageKey,
        soloPlayerCountStorageKey: deps.soloPlayerCountStorageKey,
        switchMode: deps.switchMode,
        syncBridgeSnapshot,
        writeLocalSetting: deps.writeLocalSetting,
      }),
    );
  };

  return {
    registerBridgeActions,
    syncBridgeSnapshot,
  };
}
