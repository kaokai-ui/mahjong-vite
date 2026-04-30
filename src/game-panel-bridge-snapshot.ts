import { getEmptyGameTableStageSnapshot } from "./game-panel-snapshot";
import { describeGamePhase, getSeatLabelText, getTurnBadge, isScoringEnabled } from "./bridge-view-helpers";
import type { GamePanelRuntimeContext } from "./app-game-panel-runtime";
import type { LobbyBridgeSnapshot } from "./react-shell/useAppBridge";
import type { AppGameMode, AppRoomLike } from "./runtime-shell-types";

type BuildGamePanelBridgeSnapshotContext = {
  room: AppRoomLike | null;
  selectedMode: AppGameMode;
  soloModeValue: AppGameMode;
  gameContext: GamePanelRuntimeContext;
  tableStage: LobbyBridgeSnapshot["gamePanel"]["tableStage"] | null;
  fullscreenSupported: boolean;
};

export function buildGamePanelBridgeSnapshot(
  context: BuildGamePanelBridgeSnapshotContext,
): LobbyBridgeSnapshot["gamePanel"] {
  const {
    room,
    selectedMode,
    soloModeValue,
    gameContext,
    tableStage,
    fullscreenSupported,
  } = context;

  if (!room) {
    return {
      title: "牌桌",
      description: selectedMode === soloModeValue ? "開始單人遊戲後會顯示牌桌。" : "加入房間後會顯示牌桌。",
      pills: [],
      focusNote: "",
      showFocusControls: false,
      tableStage: getEmptyGameTableStageSnapshot(),
    };
  }

  if (!gameContext || !gameContext.currentPlayer) {
    return {
      title: "牌桌",
      description: "正在等待這台裝置加入房間。",
      pills: [],
      focusNote: "",
      showFocusControls: false,
      tableStage: getEmptyGameTableStageSnapshot(),
    };
  }

  const { game, room: activeRoom, seat } = gameContext;

  return {
    title: "牌桌",
    description: describeGamePhase(game, seat, activeRoom),
    pills: [
      `你的位置：${getSeatLabelText(game, seat)}`,
      `莊家：${getSeatLabelText(game, game ? game.dealerSeat : null)}`,
      getTurnBadge(game, seat),
      isScoringEnabled(game) ? "統計：胡牌數（分數）" : "",
    ].filter(Boolean),
    focusNote: fullscreenSupported ? "牌桌可切換成全螢幕。" : "這個瀏覽器目前不支援全螢幕。",
    showFocusControls: true,
    tableStage: tableStage || getEmptyGameTableStageSnapshot(),
  };
}
