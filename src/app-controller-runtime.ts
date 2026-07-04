import { ONLINE_MULTIPLAYER_ENABLED } from "./app-variant";
import type {
  AppGameMode,
  AppRoomLike,
  AppState,
  ControllerLike,
  ControllerRuntimeState,
} from "./runtime-shell-types";

type SyncRoomPanelRulesetState = (
  appState: AppState,
  context: { normalizeRulesetId: (value?: string) => string; room: AppRoomLike | null },
) => void;

type SyncPlayerNameFromControllerFn = (controller: ControllerLike | null) => void;

type InitializeControllerRuntimeContext = {
  appState: AppState;
  normalizeRulesetId: (value?: string) => string;
  render: () => void;
  resetGameRuntimeState: () => void;
  soloModeValue: AppGameMode;
  syncPlayerNameFromController: SyncPlayerNameFromControllerFn;
  syncRoomPanelRulesetState: SyncRoomPanelRulesetState;
};

type ControllerCallbacks = {
  onError: (message: string) => void;
  onInfo: (message: string) => void;
  onRoomChange: (room: AppRoomLike) => void;
  onStatusChange: () => void;
};

export function createControllerRuntime(): ControllerRuntimeState {
  return {
    controller: null,
    initToken: 0,
  };
}

export function getActiveController(runtime: ControllerRuntimeState): ControllerLike {
  return runtime.controller as ControllerLike;
}

export async function initializeControllerRuntime(
  runtime: ControllerRuntimeState,
  mode: AppGameMode,
  context: InitializeControllerRuntimeContext,
) {
  const {
    appState,
    soloModeValue,
    syncRoomPanelRulesetState,
    normalizeRulesetId,
    resetGameRuntimeState,
    render,
    syncPlayerNameFromController,
  } = context;
  const token = ++runtime.initToken;

  if (runtime.controller) {
    runtime.controller.leaveRoom();
  }

  const controller = await buildController(mode, {
    appState,
    soloModeValue,
    syncRoomPanelRulesetState,
    normalizeRulesetId,
    render,
  });

  // A newer initialization may have started while we awaited buildController.
  // If so, discard the controller we just built and bail out, mirroring the
  // stale-token checks used after init() below.
  if (token !== runtime.initToken) {
    controller.leaveRoom();
    return;
  }

  runtime.controller = controller;
  appState.room = null;
  appState.message = "";
  appState.error = "";
  appState.lastLobbyAction = "";
  syncRoomPanelRulesetState(appState, { room: null, normalizeRulesetId });
  resetGameRuntimeState();
  render();

  try {
    await runtime.controller.init();
    if (token !== runtime.initToken) {
      return;
    }
    syncPlayerNameFromController(runtime.controller);
    render();
  } catch (error) {
    if (token !== runtime.initToken) {
      return;
    }
    appState.error = getErrorMessage(error);
    render();
  }
}

export function syncPlayerNameFromController(
  controller: ControllerLike | null,
  appState: AppState,
  syncBridgeSnapshot: () => void,
) {
  if (!controller) {
    return;
  }

  const identity = controller.getIdentity();
  if (identity && identity.playerName && !appState.playerName) {
    appState.playerName = identity.playerName;
    syncBridgeSnapshot();
  }
}

async function buildController(
  mode: AppGameMode,
  context: Omit<InitializeControllerRuntimeContext, "resetGameRuntimeState" | "syncPlayerNameFromController">,
): Promise<ControllerLike> {
  const { appState, soloModeValue, syncRoomPanelRulesetState, normalizeRulesetId, render } = context;
  const callbacks: ControllerCallbacks = {
    onRoomChange: (room) => {
      if (room?.meta?.gameMode && room.meta.gameMode !== soloModeValue) {
        appState.selectedMode = room.meta.gameMode as AppGameMode;
      }
      appState.room = room;
      syncRoomPanelRulesetState(appState, { room, normalizeRulesetId });
      render();
    },
    onInfo: (message) => {
      appState.message = message;
      render();
    },
    onError: (message) => {
      appState.error = message;
      render();
    },
    onStatusChange: () => {
      render();
    },
  };

  if (mode === soloModeValue || !ONLINE_MULTIPLAYER_ENABLED) {
    const { SoloController } = await import("./solo-controller.js");
    return new SoloController(callbacks) as ControllerLike;
  }

  const { NetworkController } = await import("@network-controller-entry");
  return new NetworkController(callbacks) as ControllerLike;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
