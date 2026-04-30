import type { AppRoomLike, AppState } from "./runtime-shell-types";

type HandleUiActionDeps = {
  leaveRoom: () => void;
  render: () => void;
  resetGameRuntimeState: () => void;
};

type FullscreenDocument = Document & {
  webkitExitFullscreen?: (() => Promise<void>) | (() => void);
  webkitFullscreenElement?: Element | null;
};

type FullscreenRoot = HTMLElement & {
  webkitRequestFullscreen?: (() => Promise<void>) | (() => void);
};

function getFullscreenDocument(): FullscreenDocument {
  return document as FullscreenDocument;
}

function getFullscreenRoot(): FullscreenRoot {
  return document.documentElement as FullscreenRoot;
}

function getRoomId(room: AppRoomLike | null | undefined) {
  return typeof room?.roomId === "string" ? room.roomId : "";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function isFullscreenActive() {
  const fullscreenDocument = getFullscreenDocument();
  return Boolean(fullscreenDocument.fullscreenElement || fullscreenDocument.webkitFullscreenElement);
}

export function canUseFullscreenApi() {
  const root = getFullscreenRoot();
  return typeof root.requestFullscreen === "function" || typeof root.webkitRequestFullscreen === "function";
}

export async function handleUiAction(appState: AppState, action: string, deps: HandleUiActionDeps) {
  appState.error = "";

  try {
    if (action === "toggle-fullscreen") {
      await toggleFullscreenMode(appState);
    }
    if (action === "leave-room") {
      appState.message = "已離開遊戲。";
      deps.resetGameRuntimeState();
      deps.leaveRoom();
      clearShareLink();
      return;
    }
    deps.render();
  } catch (error) {
    appState.error = getErrorMessage(error);
    deps.render();
  }
}

export function updateShareLink(room: AppRoomLike | null | undefined) {
  const roomId = getRoomId(room);
  if (!roomId) {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  history.replaceState(null, "", url.toString());
}

export function clearShareLink() {
  const url = new URL(window.location.href);
  url.searchParams.delete("room");
  history.replaceState(null, "", url.toString());
}

export function buildShareUrl(room: AppRoomLike | null | undefined) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", getRoomId(room));
  return url.toString();
}

async function toggleFullscreenMode(appState: AppState) {
  if (isFullscreenActive()) {
    const fullscreenDocument = getFullscreenDocument();
    const exitFullscreen =
      (typeof fullscreenDocument.exitFullscreen === "function" ? fullscreenDocument.exitFullscreen.bind(fullscreenDocument) : null) ||
      (typeof fullscreenDocument.webkitExitFullscreen === "function" ? fullscreenDocument.webkitExitFullscreen.bind(fullscreenDocument) : null);
    if (exitFullscreen) {
      await exitFullscreen();
      appState.message = "已離開全螢幕。";
      return;
    }
  }

  const root = getFullscreenRoot();
  const requestFullscreen =
    (typeof root.requestFullscreen === "function" ? root.requestFullscreen.bind(root) : null) ||
    (typeof root.webkitRequestFullscreen === "function" ? root.webkitRequestFullscreen.bind(root) : null);

  if (requestFullscreen) {
    await requestFullscreen();
    appState.message = "已進入全螢幕。";
    return;
  }

  appState.message = "這台裝置不支援原生全螢幕，已使用牌桌專注模式。";
}
