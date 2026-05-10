import { createAppBridgeStore } from "./app-bridge-store";
import type { LobbyBridgeActions, LobbyBridgeSnapshot } from "./react-shell/useAppBridge";

type AppBridgeSnapshotPatch = Partial<LobbyBridgeSnapshot> & {
  lobby?: Partial<LobbyBridgeSnapshot["lobby"]>;
  roomPanel?: Partial<LobbyBridgeSnapshot["roomPanel"]>;
  gamePanel?: Partial<LobbyBridgeSnapshot["gamePanel"]>;
};

const initialSnapshot = {
  ready: false,
  page: {
    gameFocusActive: false,
  },
  lobby: {
    mode: "solo-bot",
    playerName: "",
    createRoomCode: "",
    joinRoomCode: "",
    rulesetId: "full136",
    drawRevealSeconds: "3",
    soloDifficulty: "hard",
    soloPlayerCount: "2",
    scoringEnabled: "true",
    createDisabled: false,
    joinDisabled: false,
    noticeBanner: null,
    firebaseStatus: {
      tone: "ready",
      title: "單人本機模式",
      description: "不需要 Firebase、房號或 App Check，電腦玩家會在這台裝置上運行。",
      pills: ["模式：單人對電腦", "人數：2 人局", "難度：困難"],
      detail: "",
    },
    createFeedback: null,
    joinFeedback: null,
  },
  roomPanel: {
    hasRoom: false,
    title: "單人設定",
    description: "",
    emptyStateText: "",
    canCopyLink: false,
    canEditRuleset: false,
    roomRulesetId: "full136",
    startLabel: "開始對局",
    startDisabled: true,
    phaseCopy: "",
    seats: [],
    pills: [],
  },
  gamePanel: {
    title: "牌桌",
    description: "開始單人遊戲後會顯示牌桌。",
    pills: [],
    focusNote: "",
    showFocusControls: false,
    tableStage: {
      seatCount: 0,
      visible: false,
      hasResult: false,
      latestDiscard: null,
      latestDiscardPlaceholder: "目前沒有",
      discardRows: [],
      actions: {
        buttons: [],
        placeholderText: "等待對手操作",
      },
      opponentSection: {
        title: "等待中",
        scoreBadge: "",
        subtitle: "等待對手加入",
        hiddenTileCount: 0,
        revealHand: false,
        handTiles: [],
        melds: [],
      },
      leftSection: {
        title: "等待中",
        scoreBadge: "",
        subtitle: "等待牌列",
        hiddenTileCount: 0,
        revealHand: false,
        handTiles: [],
        melds: [],
      },
      rightSection: {
        title: "等待中",
        scoreBadge: "",
        subtitle: "等待牌列",
        hiddenTileCount: 0,
        revealHand: false,
        handTiles: [],
        melds: [],
      },
      selfSection: {
        title: "",
        scoreBadge: "",
        statusText: "等待中",
        handTiles: [],
        drawnTile: null,
        melds: [],
      },
      resultOverlay: {
        visible: false,
        eyebrow: "",
        title: "",
        kindLabel: "",
        detail: "",
        winningTile: null,
        handTitle: "",
        handGroups: [],
        scoringSummary: null,
        primaryActionLabel: "繼續遊戲",
        secondaryActionLabel: "離開遊戲",
      },
    },
  },
} satisfies LobbyBridgeSnapshot;

const initialActions: LobbyBridgeActions = {
  setMode: (_value: string) => {},
  setPlayerName: (_value: string) => {},
  setCreateRoomCode: (_value: string) => {},
  setJoinRoomCode: (_value: string) => {},
  setRulesetId: (_value: string) => {},
  setDrawRevealSeconds: (_value: string) => {},
  setSoloDifficulty: (_value: string) => {},
  setSoloPlayerCount: (_value: string) => {},
  setScoringEnabled: (_value: string) => {},
  generateCreateRoomCode: () => {},
  submitCreate: async () => {},
  submitJoin: async () => {},
  setRoomRulesetId: (_value: string) => {},
  copyShareLink: async () => {},
  startGame: async () => {},
  runGameCommand: async (_command: string, _payload) => {},
  toggleFullscreen: async () => {},
  leaveRoom: async () => {},
};

const appBridgeStore = createAppBridgeStore({
  initialSnapshot,
  initialActions,
  mergeSnapshot: mergeAppBridgeSnapshot,
});

export function getAppBridgeStore() {
  return appBridgeStore;
}

export function subscribeAppBridge(listener: () => void) {
  return appBridgeStore.subscribe(listener);
}

export function getAppBridgeSnapshot(): LobbyBridgeSnapshot {
  return appBridgeStore.getSnapshot();
}

export function getAppBridgeActions(): LobbyBridgeActions {
  return appBridgeStore.getActions();
}

export function updateAppBridgeSnapshot(patch: AppBridgeSnapshotPatch = {}) {
  appBridgeStore.updateSnapshot(patch);
}

export function setAppBridgeActions(nextActions: Partial<LobbyBridgeActions>) {
  appBridgeStore.setActions(nextActions);
}

function mergeAppBridgeSnapshot(
  snapshot: LobbyBridgeSnapshot,
  patch: AppBridgeSnapshotPatch = {},
): LobbyBridgeSnapshot {
  return {
    ...snapshot,
    ...patch,
    lobby: patch.lobby
      ? {
          ...snapshot.lobby,
          ...patch.lobby,
        }
      : snapshot.lobby,
    roomPanel: patch.roomPanel
      ? {
          ...snapshot.roomPanel,
          ...patch.roomPanel,
        }
      : snapshot.roomPanel,
    gamePanel: patch.gamePanel
      ? {
          ...snapshot.gamePanel,
          ...patch.gamePanel,
        }
      : snapshot.gamePanel,
  };
}
