import { useEffect, useState } from "react";
import type { LobbyBridgeSnapshot } from "./useAppBridge";

function readFullscreenSupport() {
  if (typeof document === "undefined") {
    return false;
  }

  const root = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: (() => Promise<void> | void) | undefined;
  };
  return typeof root.requestFullscreen === "function" || typeof root.webkitRequestFullscreen === "function";
}

function readFullscreenState() {
  if (typeof document === "undefined") {
    return false;
  }

  const fullscreenDocument = document as Document & {
    webkitFullscreenElement?: Element | null;
  };
  return Boolean(document.fullscreenElement || fullscreenDocument.webkitFullscreenElement);
}

export function usePageModeEffects(snapshot: LobbyBridgeSnapshot) {
  const [fullscreenSupported] = useState(readFullscreenSupport);
  const [fullscreenActive, setFullscreenActive] = useState(readFullscreenState);

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

  useEffect(() => {
    document.documentElement.dataset.appReady = "yes";

    const bootWarning = document.querySelector<HTMLElement>("#boot-warning");
    if (bootWarning) {
      bootWarning.hidden = true;
    }
  }, []);

  useEffect(() => {
    const body = document.body;
    if (!body) {
      return;
    }

    body.classList.toggle("app-solo-mode", snapshot.lobby.mode === "solo-bot");
    body.classList.toggle("app-game-focus", snapshot.page.gameFocusActive);
    body.classList.toggle("app-native-fullscreen", fullscreenActive);
  }, [fullscreenActive, snapshot.lobby.mode, snapshot.page.gameFocusActive]);

  useEffect(() => {
    return () => {
      document.body.classList.remove("app-solo-mode", "app-game-focus", "app-native-fullscreen");
    };
  }, []);

  return {
    fullscreenActive,
    fullscreenSupported,
  };
}
