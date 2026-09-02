import { useEffect, useState } from "react";
import {
  GAME_FOCUS_HEIGHT_REFRESH_THRESHOLD,
  GAME_FOCUS_WIDTH_REFRESH_THRESHOLD,
  clearGameFocusHeightLock,
  readFullscreenState,
  readFullscreenSupport,
  readStableViewportMetrics,
  requestFullscreenFromGesture,
  shouldLockGameFocusHeight,
} from "./page-mode-support";
import type { LobbyBridgeSnapshot } from "./useAppBridge";

function useFullscreenStateSync(setFullscreenActive: (value: boolean) => void) {
  useEffect(() => {
    const syncFullscreenState = () => {
      setFullscreenActive(readFullscreenState());
    };

    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState);

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenState);
    };
  }, []);
}

function useBootReadyFlag() {
  useEffect(() => {
    document.documentElement.dataset.appReady = "yes";

    const bootWarning = document.querySelector<HTMLElement>("#boot-warning");
    if (bootWarning) {
      bootWarning.hidden = true;
    }
  }, []);
}

function useBodyModeClasses({
  snapshot,
  fullscreenActive,
}: {
  snapshot: LobbyBridgeSnapshot;
  fullscreenActive: boolean;
}) {
  const isSoloMode = snapshot.lobby.mode === "solo-bot";
  const gameFocusActive = snapshot.page.gameFocusActive;

  useEffect(() => {
    const body = document.body;
    if (!body) {
      return;
    }

    body.classList.toggle("app-solo-mode", isSoloMode);
    body.classList.toggle("app-game-focus", gameFocusActive);
    body.classList.toggle("app-native-fullscreen", fullscreenActive);
  }, [fullscreenActive, isSoloMode, gameFocusActive]);
}

function useGameFocusHeightLock(gameFocusActive: boolean, fullscreenActive: boolean) {
  useEffect(() => {
    const root = document.documentElement;
    if (!root) {
      return;
    }

    if (!gameFocusActive || !shouldLockGameFocusHeight()) {
      clearGameFocusHeightLock(root);
      return;
    }

    const applyStableHeight = (force = false) => {
      const metrics = readStableViewportMetrics();
      if (!metrics) {
        return;
      }

      const previousWidth = Number(root.dataset.gameFocusViewportWidth || 0);
      const previousHeight = Number(root.dataset.gameFocusViewportHeight || 0);
      const shouldRefresh =
        force ||
        !previousWidth ||
        !previousHeight ||
        Math.abs(metrics.width - previousWidth) >= GAME_FOCUS_WIDTH_REFRESH_THRESHOLD ||
        Math.abs(metrics.height - previousHeight) >= GAME_FOCUS_HEIGHT_REFRESH_THRESHOLD;

      if (!shouldRefresh) {
        return;
      }

      root.dataset.gameFocusViewportWidth = String(metrics.width);
      root.dataset.gameFocusViewportHeight = String(metrics.height);
      root.style.setProperty("--app-game-focus-height", `${metrics.height}px`);
    };

    applyStableHeight(true);

    const handleResize = () => {
      applyStableHeight(false);
    };

    window.addEventListener("resize", handleResize);
    window.visualViewport?.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    document.addEventListener("fullscreenchange", handleResize);
    document.addEventListener("webkitfullscreenchange", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
      document.removeEventListener("fullscreenchange", handleResize);
      document.removeEventListener("webkitfullscreenchange", handleResize);
      clearGameFocusHeightLock(root);
    };
  }, [fullscreenActive, gameFocusActive]);
}

function usePageModeCleanup() {
  useEffect(() => {
    return () => {
      document.body.classList.remove("app-solo-mode", "app-game-focus", "app-native-fullscreen");
      clearGameFocusHeightLock(document.documentElement);
    };
  }, []);
}

export function usePageModeEffects(snapshot: LobbyBridgeSnapshot) {
  const [fullscreenSupported] = useState(readFullscreenSupport);
  const [fullscreenActive, setFullscreenActive] = useState(readFullscreenState);

  useFullscreenStateSync(setFullscreenActive);
  useBootReadyFlag();
  useBodyModeClasses({
    snapshot,
    fullscreenActive,
  });
  useGameFocusHeightLock(snapshot.page.gameFocusActive, fullscreenActive);
  usePageModeCleanup();

  return {
    fullscreenActive,
    fullscreenSupported,
    requestGameFullscreen: requestFullscreenFromGesture,
  };
}
