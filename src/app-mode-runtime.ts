import {
  createControllerRuntime,
  getActiveController,
  initializeControllerRuntime,
  syncPlayerNameFromController,
} from "./app-controller-runtime";
import { clearShareLink } from "./app-ui-runtime";
import type { AppGameMode, AppRoomLike, AppState, ControllerLike, ModeRuntime } from "./runtime-shell-types";

type CreateRandomRoomId = () => string;
type WriteLocalSetting = (key: string, value: string) => void;
type NormalizeRulesetId = (value?: string) => string;
type SyncModeSpecificInputs = (
  appState: AppState,
  context: { createRandomRoomId: CreateRandomRoomId; soloModeValue: AppGameMode },
) => void;
type SyncRoomPanelRulesetState = (
  appState: AppState,
  context: { normalizeRulesetId: NormalizeRulesetId; room: AppRoomLike | null },
) => void;

type CreateAppModeRuntimeDeps = {
  createRandomRoomId: CreateRandomRoomId;
  gameModeStorageKey: string;
  normalizeRulesetId: NormalizeRulesetId;
  render: () => void;
  resetGameRuntimeState: () => void;
  soloModeValue: AppGameMode;
  syncBridgeSnapshot: () => void;
  syncModeSpecificInputs: SyncModeSpecificInputs;
  syncRoomPanelRulesetState: SyncRoomPanelRulesetState;
  writeLocalSetting: WriteLocalSetting;
};

export function createAppModeRuntime(appState: AppState, deps: CreateAppModeRuntimeDeps): ModeRuntime {
  const controllerRuntime = createControllerRuntime();

  const syncControllerPlayerName = (controller: ControllerLike | null) =>
    syncPlayerNameFromController(controller, appState, deps.syncBridgeSnapshot);

  const getController = () => getActiveController(controllerRuntime);

  const initializeMode = (mode: AppGameMode = appState.selectedMode) => {
    initializeControllerRuntime(controllerRuntime, mode, {
      appState,
      soloModeValue: deps.soloModeValue,
      syncRoomPanelRulesetState: deps.syncRoomPanelRulesetState,
      normalizeRulesetId: deps.normalizeRulesetId,
      resetGameRuntimeState: deps.resetGameRuntimeState,
      render: deps.render,
      syncPlayerNameFromController: syncControllerPlayerName,
    });
  };

  const syncActiveControllerPlayerName = () => {
    syncControllerPlayerName(getActiveController(controllerRuntime));
  };

  const switchMode = (mode: AppGameMode) => {
    appState.selectedMode = mode;
    deps.writeLocalSetting(deps.gameModeStorageKey, mode);
    clearShareLink();
    deps.syncModeSpecificInputs(appState, {
      createRandomRoomId: deps.createRandomRoomId,
      soloModeValue: deps.soloModeValue,
    });
    initializeMode(mode);
    deps.syncBridgeSnapshot();
  };

  return {
    getController,
    initializeMode,
    syncActiveControllerPlayerName,
    switchMode,
  };
}
