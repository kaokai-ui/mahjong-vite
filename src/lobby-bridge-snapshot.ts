import { DEFAULT_SOLO_DIFFICULTY, SOLO_DIFFICULTY_LABELS } from "./solo-controller.js";
import { getPlayerById } from "./bridge-view-helpers";
import type { BridgeMessageSnapshot, BridgeStatusCardSnapshot, LobbyBridgeSnapshot } from "./react-shell/useAppBridge";

type RoomLike = {
  activePlayers?: Array<{
    id: string;
    name?: string;
    seat: number;
    type?: string;
  }>;
  players?: Record<
    string,
    | {
        id: string;
        name?: string;
        seat: number;
        type?: string;
      }
    | undefined
  >;
  meta?: {
    gameMode?: string;
    botThinking?: boolean;
  } | null;
  gameMode?: string;
  game?: {
    status?: string;
    result?: unknown;
  } | null;
  lastError?: {
    playerId?: string;
    message?: string;
  } | null;
};

type SetupStateLike = {
  ready?: boolean;
  authReady?: boolean;
  configured?: boolean;
  appCheckConfigured?: boolean;
  appCheckEnabled?: boolean;
  appCheckDebug?: boolean;
  appCheckMessage?: string;
} | null;

type BuildLobbyBridgeSnapshotContext = {
  setupState: SetupStateLike;
  selectedMode: LobbyBridgeSnapshot["lobby"]["mode"];
  soloModeValue: LobbyBridgeSnapshot["lobby"]["mode"];
  playerName: string;
  createRoomCode: string;
  joinRoomCode: string;
  rulesetId: string;
  drawRevealSeconds: number;
  soloDifficulty: LobbyBridgeSnapshot["lobby"]["soloDifficulty"];
  soloPlayerCount: LobbyBridgeSnapshot["lobby"]["soloPlayerCount"];
  scoringEnabled: boolean;
  room: RoomLike | null;
  playerId: string;
  error: string;
  message: string;
  lastLobbyAction: string;
  roomPanel: LobbyBridgeSnapshot["roomPanel"];
  gamePanel: LobbyBridgeSnapshot["gamePanel"];
};

type LobbyFeedbackAction = "create" | "join";

export function buildLobbyBridgeSnapshot(context: BuildLobbyBridgeSnapshotContext): LobbyBridgeSnapshot {
  const {
    setupState,
    selectedMode,
    soloModeValue,
    playerName,
    createRoomCode,
    joinRoomCode,
    rulesetId,
    drawRevealSeconds,
    soloDifficulty,
    soloPlayerCount,
    scoringEnabled,
    room,
    playerId,
    error,
    message,
    lastLobbyAction,
    roomPanel,
    gamePanel,
  } = context;

  const onlineReady = Boolean(setupState && setupState.ready && setupState.authReady);
  const isSoloMode = selectedMode === soloModeValue;

  return {
    ready: true,
    page: {
      gameFocusActive: Boolean(room && room.game && ["playing", "finished"].includes(room.game.status || "")),
    },
    lobby: {
      mode: selectedMode,
      playerName,
      createRoomCode,
      joinRoomCode,
      rulesetId,
      drawRevealSeconds: String(drawRevealSeconds),
      soloDifficulty,
      soloPlayerCount,
      scoringEnabled: String(scoringEnabled) as LobbyBridgeSnapshot["lobby"]["scoringEnabled"],
      createDisabled: isSoloMode ? false : !onlineReady,
      joinDisabled: isSoloMode ? true : !onlineReady,
      noticeBanner: buildNoticeBanner({ room, playerId, error, message }),
      firebaseStatus: buildFirebaseStatus({ setupState, isSoloMode, soloDifficulty, soloPlayerCount }),
      createFeedback: buildFormFeedback({ room, lastLobbyAction, error, message, action: "create" }),
      joinFeedback: buildFormFeedback({ room, lastLobbyAction, error, message, action: "join" }),
    },
    roomPanel,
    gamePanel,
  };
}

function buildNoticeBanner({
  room,
  playerId,
  error,
  message,
}: {
  room: RoomLike | null;
  playerId: string;
  error: string;
  message: string;
}): BridgeMessageSnapshot | null {
  const currentPlayer = room ? getPlayerById(room, playerId) : null;
  const roomScopedError =
    room && room.lastError && room.lastError.playerId === (currentPlayer?.id ?? "") ? room.lastError.message || "" : "";
  const hasResultOverlay = Boolean(room && room.game && room.game.result);
  const messages = hasResultOverlay
    ? [error, roomScopedError].filter(isNonEmptyString)
    : [error, roomScopedError, message].filter(isNonEmptyString);
  const [firstMessage] = messages;

  if (!firstMessage) {
    return null;
  }

  return {
    tone: error || roomScopedError ? "error" : "info",
    message: firstMessage,
  };
}

function buildFormFeedback({
  room,
  lastLobbyAction,
  error,
  message,
  action,
}: {
  room: RoomLike | null;
  lastLobbyAction: string;
  error: string;
  message: string;
  action: LobbyFeedbackAction;
}): BridgeMessageSnapshot | null {
  if (room || lastLobbyAction !== action) {
    return null;
  }

  const feedbackMessage = error || message || "";
  if (!feedbackMessage) {
    return null;
  }

  return {
    tone: error ? "error" : "info",
    message: feedbackMessage,
  };
}

function buildFirebaseStatus({
  setupState,
  isSoloMode,
  soloDifficulty,
  soloPlayerCount,
}: {
  setupState: SetupStateLike;
  isSoloMode: boolean;
  soloDifficulty: LobbyBridgeSnapshot["lobby"]["soloDifficulty"];
  soloPlayerCount: LobbyBridgeSnapshot["lobby"]["soloPlayerCount"];
}): BridgeStatusCardSnapshot {
  if (isSoloMode) {
    return {
      tone: "ready",
      title: "單人本機模式",
      description: "不需要 Firebase、房號或 App Check，電腦玩家會在這台裝置上運行。",
      pills: [
        "模式：單人對電腦",
        `人數：${soloPlayerCount === "4" ? "4 人局" : "2 人局"}`,
        `難度：${SOLO_DIFFICULTY_LABELS[soloDifficulty || DEFAULT_SOLO_DIFFICULTY] || SOLO_DIFFICULTY_LABELS[DEFAULT_SOLO_DIFFICULTY]}`,
      ],
      detail: "",
    };
  }

  const status = setupState || { configured: false, authReady: false, appCheckMessage: "尚未設定" };
  const ready = Boolean(status.ready && status.authReady);
  return {
    tone: ready ? "ready" : "warn",
    title: !status.configured ? "Firebase 尚未設定" : ready ? "Firebase 已連線" : "Firebase 連線中",
    description: !status.configured
      ? "請先檢查 src/firebase-config.js；若要本機 Debug Token，請使用 local-admin/firebase-config.local.js。"
      : ready
        ? "已啟用匿名登入與房間即時同步。"
        : "正在建立匿名登入與資料庫連線。",
    pills: [status.authReady ? "匿名登入：已就緒" : "匿名登入：連線中", getAppCheckStatusLabel(status)],
    detail: status.configured ? status.appCheckMessage || "App Check 尚未設定。" : "",
  };
}

function getAppCheckStatusLabel(status: SetupStateLike): string {
  if (!status || !status.configured) {
    return "App Check：待設定";
  }

  if (!status.appCheckConfigured) {
    return "App Check：未填 site key";
  }

  if (status.appCheckEnabled) {
    return status.appCheckDebug ? "App Check：Debug Token" : "App Check：已啟用";
  }

  return "App Check：尚未啟用";
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return Boolean(value);
}
