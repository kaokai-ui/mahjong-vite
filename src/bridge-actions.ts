import type { AppGameMode, AppState } from "./runtime-shell-types";
import type { BridgeGameCommandPayload, LobbyBridgeActions } from "./react-shell/useAppBridge";

type CreateBridgeActionsDeps = {
  buildShareUrl: () => string;
  copyText: (text: string) => Promise<void>;
  createRandomRoomId: () => string;
  defaultRulesetId: string;
  handleCreateRoomSubmit: () => Promise<void>;
  handleJoinRoomSubmit: () => Promise<void>;
  handleUiAction: (action: string) => Promise<void>;
  normalizeDrawRevealSecondsValue: (value: unknown) => number;
  normalizeGameMode: (value: unknown) => AppGameMode;
  normalizeRoomId: (value: unknown) => string;
  normalizeRulesetId: (value?: string) => string;
  normalizeScoringEnabled: (value: unknown) => boolean;
  normalizeSoloDifficulty: (value: unknown) => string;
  normalizeSoloPlayerCount: (value: unknown) => number;
  render: () => void;
  scoringEnabledStorageKey: string;
  sendGameCommand: (command: string, payload?: BridgeGameCommandPayload) => Promise<void>;
  soloDifficultyStorageKey: string;
  soloPlayerCountStorageKey: string;
  switchMode: (mode: AppGameMode) => void;
  syncBridgeSnapshot: () => void;
  writeLocalSetting: (key: string, value: string) => void;
};

export function createBridgeActions(appState: AppState, deps: CreateBridgeActionsDeps): LobbyBridgeActions {
  return {
    setMode: (value: string) => {
      const nextMode = deps.normalizeGameMode(value);
      if (nextMode === appState.selectedMode) {
        return;
      }
      deps.switchMode(nextMode);
    },
    setPlayerName: (value: string) => {
      appState.playerName = String(value || "");
      deps.syncBridgeSnapshot();
    },
    setCreateRoomCode: (value: string) => {
      appState.createRoomCode = deps.normalizeRoomId(value);
      deps.syncBridgeSnapshot();
    },
    setJoinRoomCode: (value: string) => {
      appState.joinRoomCode = deps.normalizeRoomId(value);
      deps.syncBridgeSnapshot();
    },
    setRulesetId: (value: string) => {
      appState.selectedRulesetId = value || deps.defaultRulesetId;
      deps.syncBridgeSnapshot();
    },
    setDrawRevealSeconds: (value: string) => {
      appState.selectedDrawRevealSeconds = deps.normalizeDrawRevealSecondsValue(value);
      deps.syncBridgeSnapshot();
    },
    setSoloDifficulty: (value: string) => {
      appState.selectedSoloDifficulty = deps.normalizeSoloDifficulty(value);
      deps.writeLocalSetting(deps.soloDifficultyStorageKey, appState.selectedSoloDifficulty);
      deps.render();
    },
    setSoloPlayerCount: (value: string) => {
      appState.selectedSoloPlayerCount = deps.normalizeSoloPlayerCount(value);
      deps.writeLocalSetting(deps.soloPlayerCountStorageKey, String(appState.selectedSoloPlayerCount));
      deps.syncBridgeSnapshot();
    },
    setScoringEnabled: (value: string) => {
      appState.selectedScoringEnabled = deps.normalizeScoringEnabled(value);
      deps.writeLocalSetting(deps.scoringEnabledStorageKey, String(appState.selectedScoringEnabled));
      deps.render();
    },
    generateCreateRoomCode: () => {
      appState.createRoomCode = deps.createRandomRoomId();
      appState.message = "已產生新的房號。";
      deps.render();
    },
    submitCreate: async () => {
      await deps.handleCreateRoomSubmit();
    },
    submitJoin: async () => {
      await deps.handleJoinRoomSubmit();
    },
    setRoomRulesetId: (value) => {
      appState.roomPanelRulesetId = deps.normalizeRulesetId(value);
      appState.roomPanelRulesetDirty = true;
      deps.syncBridgeSnapshot();
    },
    copyShareLink: async () => {
      appState.error = "";
      try {
        await deps.copyText(deps.buildShareUrl());
        appState.message = "已複製邀請連結。";
      } catch (error: unknown) {
        appState.error = getErrorMessage(error);
      }
      deps.render();
    },
    startGame: async () => {
      appState.error = "";
      try {
        await deps.sendGameCommand("startGame", {
          rulesetId: deps.normalizeRulesetId(appState.roomPanelRulesetId),
        });
        appState.message = "已送出開局指令。";
      } catch (error: unknown) {
        appState.error = getErrorMessage(error);
      }
      deps.render();
    },
    runGameCommand: async (command: string, payload: BridgeGameCommandPayload = {}) => {
      appState.error = "";
      try {
        await deps.sendGameCommand(command, payload);
        appState.message = "已送出操作。";
      } catch (error: unknown) {
        appState.error = getErrorMessage(error);
      }
      deps.render();
    },
    toggleFullscreen: async () => {
      await deps.handleUiAction("toggle-fullscreen");
    },
    leaveRoom: async () => {
      await deps.handleUiAction("leave-room");
    },
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
