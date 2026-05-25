import { renderGamePanelReactShell } from "./app-game-panel-runtime";
import { handleUiAction } from "./app-ui-runtime";
import type { AutoDrawContext, DrawRevealContext, DrawRevealSnapshot, GameRuntimeState } from "./game-runtime-state";
import type { AppState, ControllerLike, RenderRuntime } from "./runtime-shell-types";

type CreateAppRenderRuntimeDeps = {
  getController: () => ControllerLike;
  getDrawRevealState: (state: GameRuntimeState, context: DrawRevealContext) => DrawRevealSnapshot | null;
  resetGameRuntimeState: () => void;
  runtimeState: GameRuntimeState;
  syncBridgeSnapshot: () => void;
  syncOnlineWatchdogRenderTimer: (state: GameRuntimeState, room: AppState["room"], scheduleRender: () => void) => void;
  triggerAutoDrawIfNeeded: (state: GameRuntimeState, context: AutoDrawContext) => void;
};

export function createAppRenderRuntime(appState: AppState, deps: CreateAppRenderRuntimeDeps): RenderRuntime {
  const render = () => {
    renderGamePanelReactShell(appState, {
      runtimeState: deps.runtimeState,
      triggerAutoDrawIfNeeded: deps.triggerAutoDrawIfNeeded,
      getDrawRevealState: deps.getDrawRevealState,
      getController: deps.getController,
      render,
    });
    deps.syncOnlineWatchdogRenderTimer(deps.runtimeState, appState.room, render);
    deps.syncBridgeSnapshot();
  };

  const runUiAction = (action: string) =>
    Promise.resolve(
      handleUiAction(appState, action, {
        render,
        resetGameRuntimeState: deps.resetGameRuntimeState,
        leaveRoom: () => deps.getController().leaveRoom(),
      }),
    );

  return {
    render,
    runUiAction,
  };
}
