import { useEffect, useState } from "react";
import {
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
  useEffect(() => {
    const body = document.body;
    if (!body) {
      return;
    }

    body.classList.toggle("app-solo-mode", snapshot.lobby.mode === "solo-bot");
    body.classList.toggle("app-game-focus", snapshot.page.gameFocusActive);
    body.classList.toggle("app-native-fullscreen", fullscreenActive);
  }, [fullscreenActive, snapshot]);
}

function useGameFocusHeightLock(gameFocusActive: boolean) {
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
      const shouldRefresh =
        force || !previousWidth || Math.abs(metrics.width - previousWidth) >= GAME_FOCUS_WIDTH_REFRESH_THRESHOLD;

      if (!shouldRefresh) {
        return;
      }

      root.dataset.gameFocusViewportWidth = String(metrics.width);
      root.style.setProperty("--app-game-focus-height", `${metrics.height}px`);
    };

    applyStableHeight(true);

    const handleResize = () => {
      applyStableHeight(false);
    };

    window.addEventListener("resize", handleResize);
    window.visualViewport?.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
      clearGameFocusHeightLock(root);
    };
  }, [gameFocusActive]);
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
  useGameFocusHeightLock(snapshot.page.gameFocusActive);
  usePageModeCleanup();

  return {
    fullscreenActive,
    fullscreenSupported,
    requestGameFullscreen: requestFullscreenFromGesture,
  };
}
