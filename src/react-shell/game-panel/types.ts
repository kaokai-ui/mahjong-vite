import type {
  BridgeDiscardSnapshot,
  BridgeGameActionSnapshot,
  BridgeMeldSnapshot,
  BridgeOpponentSectionSnapshot,
  BridgeSelfSectionSnapshot,
  BridgeTileActionSnapshot,
  BridgeTileSnapshot,
  GameResultOverlaySnapshot,
  LobbyBridgeActions,
  LobbyBridgeSnapshot,
} from "../useAppBridge";

export type {
  BridgeDiscardSnapshot,
  BridgeGameActionSnapshot,
  BridgeMeldSnapshot,
  BridgeOpponentSectionSnapshot,
  BridgeSelfSectionSnapshot,
  BridgeTileActionSnapshot,
  BridgeTileSnapshot,
  GameResultOverlaySnapshot,
  LobbyBridgeActions,
  LobbyBridgeSnapshot,
};

export type TableStageSnapshot = LobbyBridgeSnapshot["gamePanel"]["tableStage"];
export type TableActionState = TableStageSnapshot["actions"];
export type DiscardRowSnapshot = TableStageSnapshot["discardRows"][number];
