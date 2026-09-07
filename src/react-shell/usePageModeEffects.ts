import { useEffect, useState } from "react";
import {
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

    const applyStableHeight = () => {
      const metrics = readStableViewportMetrics();
      if (!metrics) {
        return;
      }

      // Safari fires visualViewport resize events while its address bar
      // collapses or reappears. Keep the height captured when entering the
      // table; only the explicit orientation/fullscreen handlers below call
      // this function again.
      root.dataset.gameFocusViewportWidth = String(metrics.width);
      root.dataset.gameFocusViewportHeight = String(metrics.height);
      root.style.setProperty("--app-game-focus-height", `${metrics.height}px`);
    };

    applyStableHeight();

    const handleOrientationChange = () => {
      applyStableHeight();
    };

    const handleFullscreenChange = () => {
      applyStableHeight();
    };

    window.addEventListener("orientationchange", handleOrientationChange);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    return () => {
      window.removeEventListener("orientationchange", handleOrientationChange);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
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
