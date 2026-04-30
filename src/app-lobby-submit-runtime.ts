import type { AppGameMode, AppRoomLike, AppState, ControllerLike } from "./runtime-shell-types";

type LobbyControllerLike = ControllerLike & {
  createRoom?: (payload: {
    drawRevealSeconds: number;
    playerName: string;
    roomId: string;
    rulesetId: string;
    scoringEnabled: boolean;
  }) => Promise<unknown>;
  createSoloGame?: (payload: {
    difficulty: string;
    drawRevealSeconds: number;
    playerName: string;
    rulesetId: string;
    scoringEnabled: boolean;
  }) => Promise<unknown>;
  joinRoom?: (payload: {
    playerName: string;
    roomId: string;
  }) => Promise<unknown>;
};

type SubmitCreateRoomDeps = {
  clearShareLink: () => void;
  defaultRulesetId: string;
  getController: () => LobbyControllerLike;
  normalizeDrawRevealSecondsValue: (value: unknown) => number;
  normalizeScoringEnabled: (value: unknown) => boolean;
  render: () => void;
  soloModeValue: AppGameMode;
  updateShareLink: (room: AppRoomLike | null) => void;
};

type SubmitJoinRoomDeps = {
  getController: () => LobbyControllerLike;
  onlineModeValue: AppGameMode;
  render: () => void;
  updateShareLink: (room: AppRoomLike | null) => void;
};

export async function submitCreateRoom(appState: AppState, deps: SubmitCreateRoomDeps) {
  appState.error = "";
  appState.lastLobbyAction = "create";

  try {
    if (appState.selectedMode === deps.soloModeValue) {
      const controller = deps.getController();
      if (!controller.createSoloGame) {
        throw new Error("Solo controller is missing createSoloGame().");
      }
      await controller.createSoloGame({
        playerName: appState.playerName,
        rulesetId: appState.selectedRulesetId || deps.defaultRulesetId,
        drawRevealSeconds: readCreateDrawRevealSeconds(appState, deps.normalizeDrawRevealSecondsValue),
        difficulty: appState.selectedSoloDifficulty,
        scoringEnabled: readCreateScoringEnabled(appState, deps.normalizeScoringEnabled),
      });
      appState.message = "已開始單人對局。";
      appState.lastLobbyAction = "";
      deps.clearShareLink();
      deps.render();
      return;
    }

    const controller = deps.getController();
    if (!controller.createRoom) {
      throw new Error("Online controller is missing createRoom().");
    }
    await controller.createRoom({
      roomId: appState.createRoomCode,
      playerName: appState.playerName,
      rulesetId: appState.selectedRulesetId || deps.defaultRulesetId,
      drawRevealSeconds: readCreateDrawRevealSeconds(appState, deps.normalizeDrawRevealSecondsValue),
      scoringEnabled: readCreateScoringEnabled(appState, deps.normalizeScoringEnabled),
    });
    appState.message = "已建立房間。";
    appState.lastLobbyAction = "";
    deps.updateShareLink(appState.room);
    deps.render();
  } catch (error) {
    appState.error = getErrorMessage(error);
    deps.render();
  }
}

export async function submitJoinRoom(appState: AppState, deps: SubmitJoinRoomDeps) {
  appState.error = "";
  appState.lastLobbyAction = "join";

  try {
    if (appState.selectedMode !== deps.onlineModeValue) {
      throw new Error("單人模式不需要加入房間。");
    }

    const controller = deps.getController();
    if (!controller.joinRoom) {
      throw new Error("Online controller is missing joinRoom().");
    }
    await controller.joinRoom({
      roomId: appState.joinRoomCode,
      playerName: appState.playerName,
    });
    appState.message = "已加入房間。";
    appState.lastLobbyAction = "";
    deps.updateShareLink(appState.room);
    deps.render();
  } catch (error) {
    appState.error = getErrorMessage(error);
    deps.render();
  }
}

function readCreateDrawRevealSeconds(appState: AppState, normalizeDrawRevealSecondsValue: (value: unknown) => number) {
  return normalizeDrawRevealSecondsValue(appState.selectedDrawRevealSeconds);
}

function readCreateScoringEnabled(appState: AppState, normalizeScoringEnabled: (value: unknown) => boolean) {
  return normalizeScoringEnabled(appState.selectedScoringEnabled);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
