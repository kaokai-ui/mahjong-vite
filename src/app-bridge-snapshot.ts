import { getPlayerById, getPlayers } from "./bridge-view-helpers";
import type { GamePanelRuntimeContext } from "./app-game-panel-runtime";
import { buildGamePanelBridgeSnapshot } from "./game-panel-bridge-snapshot";
import { buildGameTableStageSnapshot } from "./game-panel-snapshot";
import { buildLobbyBridgeSnapshot } from "./lobby-bridge-snapshot";
import { buildRoomPanelSnapshot } from "./room-panel-snapshot";
import type { AppGameMode, AppState, AppRoomLike, ControllerLike } from "./runtime-shell-types";

type BuildAppBridgeSnapshotContext = {
  appState: AppState;
  controller: ControllerLike | null;
  fullscreenSupported: boolean;
  gameContext: GamePanelRuntimeContext;
  soloModeValue: AppGameMode;
};

export function buildAppBridgeSnapshot(context: BuildAppBridgeSnapshotContext) {
  const {
    appState,
    controller,
    soloModeValue,
    gameContext,
    fullscreenSupported,
  } = context;
  const room: AppRoomLike | null = appState.room;
  const playerId = controller ? controller.getIdentity().playerId : "";
  const roomPanel = buildRoomPanelSnapshot({
    room,
    isSoloSetup: appState.selectedMode === soloModeValue,
    roomPanelRulesetId: appState.roomPanelRulesetId,
    isHost: controller?.isHost?.() ?? false,
    players: room ? getPlayers(room) : [],
    currentPlayer: room ? getPlayerById(room, playerId) : null,
  });
  const gamePanel = buildGamePanelBridgeSnapshot({
    room,
    selectedMode: appState.selectedMode,
    soloModeValue,
    gameContext,
    tableStage: gameContext ? buildGameTableStageSnapshot(gameContext) : null,
    fullscreenSupported,
  });

  return buildLobbyBridgeSnapshot({
    setupState: controller?.getSetupState?.() ?? null,
    selectedMode: appState.selectedMode,
    soloModeValue,
    playerName: appState.playerName,
    createRoomCode: appState.createRoomCode,
    joinRoomCode: appState.joinRoomCode,
    rulesetId: appState.selectedRulesetId,
    drawRevealSeconds: appState.selectedDrawRevealSeconds,
    soloDifficulty: appState.selectedSoloDifficulty as ReturnType<typeof buildLobbyBridgeSnapshot>["lobby"]["soloDifficulty"],
    scoringEnabled: appState.selectedScoringEnabled,
    room,
    playerId,
    error: appState.error,
    message: appState.message,
    lastLobbyAction: appState.lastLobbyAction,
    roomPanel,
    gamePanel,
  });
}
