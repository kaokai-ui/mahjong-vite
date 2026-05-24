import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { bootstrapLegacyApp } from "../app-bootstrap-runtime";
import { getAppBridgeStore } from "../app-bridge";

export type BridgeTileSnapshot = {
  tileId: string;
  tileType: string;
  label: string;
  themeClass: string;
};

export type BridgeMessageSnapshot = {
  tone: "error" | "info";
  message: string;
};

export type BridgeStatusCardSnapshot = {
  tone: "ready" | "warn";
  title: string;
  description: string;
  pills: string[];
  detail: string;
};

export type BridgeDiscardSnapshot = {
  claimed: boolean;
  tile: BridgeTileSnapshot;
};

export type BridgeGameCommandPayload = {
  tileId?: string;
  tileType?: string;
  meldId?: number;
  neededTypes?: string[];
  rulesetId?: string;
};

export type BridgeGameActionSnapshot = {
  label: string;
  command: string;
  emphasis: boolean;
  payload: BridgeGameCommandPayload;
};

export type BridgeTileActionSnapshot = {
  tile: BridgeTileSnapshot;
  command: string;
  ariaLabel: string;
  disabled: boolean;
  payload: BridgeGameCommandPayload;
};

export type BridgeMeldSnapshot = {
  label: string;
  tiles: BridgeTileSnapshot[];
};

export type BridgeOpponentSectionSnapshot = {
  title: string;
  scoreBadge: string;
  subtitle: string;
  hiddenTileCount: number;
  revealHand: boolean;
  handTiles: BridgeTileSnapshot[];
  melds: BridgeMeldSnapshot[];
};

export type BridgeSelfSectionSnapshot = {
  title: string;
  scoreBadge: string;
  statusText: string;
  handTiles: BridgeTileActionSnapshot[];
  drawnTile: {
    button: BridgeTileActionSnapshot;
    countdownLabel: string;
    isGracePeriod: boolean;
  } | null;
  melds: BridgeMeldSnapshot[];
};

export type GameResultOverlaySnapshot = {
  visible: boolean;
  eyebrow: string;
  title: string;
  kindLabel: string;
  sourceLabel: string;
  detail: string;
  winningTile: BridgeTileSnapshot | null;
  handTitle: string;
  handGroups: Array<{
    label: string;
    tiles: BridgeTileSnapshot[];
  }>;
  scoringSummary: {
    label: string;
    rows: Array<{
      label: string;
      valueLabel: string;
    }>;
    totalTaiLabel: string;
    totalScoreLabel: string;
  } | null;
  primaryActionLabel: string;
  secondaryActionLabel: string;
};

export type LobbyBridgeSnapshot = {
  ready: boolean;
  page: {
    gameFocusActive: boolean;
  };
  lobby: {
    mode: "online-2p" | "online-4p" | "solo-bot";
    playerName: string;
    createRoomCode: string;
    joinRoomCode: string;
    rulesetId: string;
    drawRevealSeconds: string;
    soloDifficulty: "easy" | "normal" | "hard" | "god";
    soloPlayerCount: "2" | "4";
    scoringEnabled: "false" | "true";
    createDisabled: boolean;
    joinDisabled: boolean;
    noticeBanner: BridgeMessageSnapshot | null;
    firebaseStatus: BridgeStatusCardSnapshot;
    createFeedback: BridgeMessageSnapshot | null;
    joinFeedback: BridgeMessageSnapshot | null;
  };
  roomPanel: {
    hasRoom: boolean;
    title: string;
    description: string;
    emptyStateText: string;
    canCopyLink: boolean;
    canEditRuleset: boolean;
    roomRulesetId: string;
    startLabel: string;
    startDisabled: boolean;
    phaseCopy: string;
    seats: Array<{
      seat: number;
      empty: boolean;
      title: string;
      subtitle: string;
      badges: string[];
      scoreBadge: string;
    }>;
    pills: string[];
  };
  gamePanel: {
    title: string;
    description: string;
    pills: string[];
    focusNote: string;
    showFocusControls: boolean;
    tableStage: {
      seatCount: number;
      visible: boolean;
      hasResult: boolean;
      latestDiscard: BridgeTileSnapshot | null;
      latestDiscardPlaceholder: string;
      discardRows: Array<{
        label: string;
        placeholderText: string;
        tiles: BridgeDiscardSnapshot[];
      }>;
      actions: {
        buttons: BridgeGameActionSnapshot[];
        placeholderText: string;
      };
      opponentSection: BridgeOpponentSectionSnapshot;
      leftSection: BridgeOpponentSectionSnapshot;
      rightSection: BridgeOpponentSectionSnapshot;
      selfSection: BridgeSelfSectionSnapshot;
      resultOverlay: GameResultOverlaySnapshot;
    };
  };
};

export type LobbyBridgeActions = {
  setMode: (value: string) => void;
  setPlayerName: (value: string) => void;
  setCreateRoomCode: (value: string) => void;
  setJoinRoomCode: (value: string) => void;
  setRulesetId: (value: string) => void;
  setDrawRevealSeconds: (value: string) => void;
  setSoloDifficulty: (value: string) => void;
  setSoloPlayerCount: (value: string) => void;
  setScoringEnabled: (value: string) => void;
  generateCreateRoomCode: () => void;
  submitCreate: () => Promise<void>;
  submitJoin: () => Promise<void>;
  setRoomRulesetId: (value: string) => void;
  copyShareLink: () => Promise<void>;
  startGame: () => Promise<void>;
  runGameCommand: (command: string, payload?: BridgeGameCommandPayload) => Promise<void>;
  toggleFullscreen: () => Promise<void>;
  leaveRoom: () => Promise<void>;
};

type AppBridgeContextValue = {
  snapshot: LobbyBridgeSnapshot;
  actions: LobbyBridgeActions;
};

const AppBridgeContext = createContext<AppBridgeContextValue | null>(null);
const appBridgeStore = getAppBridgeStore();

let runtimeBootPromise: Promise<void> | null = null;

function ensureAppRuntimeBooted() {
  if (!runtimeBootPromise) {
    runtimeBootPromise = Promise.resolve().then(() => {
      const gamePanel = document.querySelector("#game-panel");
      if (!gamePanel) {
        throw new Error("Missing #game-panel container for app runtime bootstrap.");
      }

      bootstrapLegacyApp({ gamePanel });
    });
  }

  return runtimeBootPromise;
}

export function AppBridgeProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(
    appBridgeStore.subscribe,
    appBridgeStore.getSnapshot,
    appBridgeStore.getSnapshot,
  ) as LobbyBridgeSnapshot;

  useEffect(() => {
    void ensureAppRuntimeBooted().catch((error) => {
      console.error("Failed to bootstrap app runtime:", error);
    });
  }, []);

  return (
    <AppBridgeContext.Provider
      value={{
        snapshot,
        actions: appBridgeStore.getActions() as LobbyBridgeActions,
      }}
    >
      {children}
    </AppBridgeContext.Provider>
  );
}

export function useAppBridge() {
  const context = useContext(AppBridgeContext);
  if (!context) {
    throw new Error("useAppBridge must be used within AppBridgeProvider.");
  }

  return context;
}
