export const GAME_FOCUS_WIDTH_REFRESH_THRESHOLD = 80;
export const GAME_FOCUS_HEIGHT_REFRESH_THRESHOLD = 48;

export function readFullscreenSupport() {
  if (typeof document === "undefined") {
    return false;
  }

  const root = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: (() => Promise<void> | void) | undefined;
  };
  return typeof root.requestFullscreen === "function" || typeof root.webkitRequestFullscreen === "function";
}

export function readFullscreenState() {
  if (typeof document === "undefined") {
    return false;
  }

  const fullscreenDocument = document as Document & {
    webkitFullscreenElement?: Element | null;
  };
  return Boolean(document.fullscreenElement || fullscreenDocument.webkitFullscreenElement);
}

export async function requestFullscreenFromGesture() {
  if (typeof document === "undefined") {
    return;
  }

  if (readFullscreenState()) {
    return;
  }

  const root = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: (() => Promise<void> | void) | undefined;
  };
  const requestFullscreen =
    (typeof root.requestFullscreen === "function" ? root.requestFullscreen.bind(root) : null) ||
    (typeof root.webkitRequestFullscreen === "function" ? root.webkitRequestFullscreen.bind(root) : null);

  if (!requestFullscreen) {
    return;
  }

  try {
    await requestFullscreen();
  } catch {
    // Browsers may reject fullscreen even during user gestures; ignore and continue.
  }
}

export function readStableViewportMetrics() {
  if (typeof window === "undefined") {
    return null;
  }

  const viewport = window.visualViewport;
  const width = Math.round(viewport?.width || window.innerWidth || document.documentElement.clientWidth || 0);
  const height = Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 0);

  if (!width || !height) {
    return null;
  }

  return { width, height };
}

export function shouldLockGameFocusHeight() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const platform = String(navigator.platform || "");
  const userAgent = String(navigator.userAgent || "");
  const maxTouchPoints = Number(navigator.maxTouchPoints || 0);
  const isIOSDevice = /iPad|iPhone|iPod/.test(platform) || /iPad|iPhone|iPod/.test(userAgent);
  const isTouchMac = platform === "MacIntel" && maxTouchPoints > 1;

  return isIOSDevice || isTouchMac;
}

export function clearGameFocusHeightLock(root: HTMLElement) {
  delete root.dataset.gameFocusViewportWidth;
  delete root.dataset.gameFocusViewportHeight;
  root.style.removeProperty("--app-game-focus-height");
}
