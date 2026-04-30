import { isAppCheckConfigured, isFirebaseConfigured } from "./firebase-config.js";
import {
  ensureFirebaseReady,
  getFirebaseSetupState,
  setFirebaseSetupState,
} from "./network-firebase-runtime.js";
import {
  PLAYER_NAME_KEY,
  getOrCreateBrowserId,
  readStorage,
  writeStorage,
} from "./network-storage.js";

export async function initNetworkController(controller) {
  if (!isFirebaseConfigured()) {
    setFirebaseSetupState({
      configured: false,
      ready: false,
      initializing: false,
      authReady: false,
      uid: "",
      error: "",
      appCheckConfigured: isAppCheckConfigured(),
      appCheckEnabled: false,
      appCheckReady: false,
      appCheckProvider: "",
      appCheckMessage: "請先填寫 Firebase 設定",
    });
    emitNetworkStatus(controller);
    controller.onInfo(
      "請先檢查 src/firebase-config.js 內的 Firebase 正式設定；本機 override 請放在 local-admin/firebase-config.local.js。",
    );
    return false;
  }

  await ensureFirebaseReady((message) => {
    controller.onError(message);
  });
  emitNetworkStatus(controller);
  return true;
}

export function getNetworkIdentity() {
  const setupState = getFirebaseSetupState();
  return {
    playerId: setupState.uid || "",
    browserId: getOrCreateBrowserId(),
    playerName: readStorage(PLAYER_NAME_KEY) || "",
  };
}

export function getNetworkSetupState() {
  return getFirebaseSetupState();
}

export function setNetworkPlayerName(playerName) {
  const trimmed = String(playerName || "").trim();
  if (!trimmed) {
    throw new Error("請先輸入玩家名稱。");
  }

  writeStorage(PLAYER_NAME_KEY, trimmed);
  return trimmed;
}

export async function ensureNetworkControllerReady(controller) {
  await controller.init();
  const setupState = getFirebaseSetupState();
  if (!setupState.ready || !setupState.authReady || !setupState.uid) {
    throw new Error("Firebase 尚未完成匿名登入，請稍候再試。");
  }
}

export function emitNetworkStatus(controller) {
  controller.onStatusChange(getNetworkSetupState());
}

export function isNetworkControllerHost(controller) {
  const identity = controller.getIdentity();
  return Boolean(controller.room && controller.room.hostPlayerId === identity.playerId);
}
