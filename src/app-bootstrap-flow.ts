import type { AppState, BootstrapElements, BootstrapRuntimes } from "./runtime-shell-types";

export function startBootstrapFlow(elements: BootstrapElements, appState: AppState, runtimes: BootstrapRuntimes) {
  const { bridgeRuntime, modeRuntime, renderRuntime } = runtimes;

  modeRuntime.initializeMode(appState.selectedMode);
  modeRuntime.syncActiveControllerPlayerName();

  bridgeRuntime.registerBridgeActions();
  renderRuntime.render();
}
