import { startBootstrapFlow } from "./app-bootstrap-flow";
import { createBootstrapRuntimes } from "./app-bootstrap-runtimes";
import { createInitializedAppState } from "./app-bootstrap-state";
import { createGameRuntimeState } from "./game-runtime-state";
import type { BootstrapElements } from "./runtime-shell-types";

export function bootstrapLegacyApp(elements: BootstrapElements) {
  const appState = createInitializedAppState();
  const runtimeState = createGameRuntimeState();
  const runtimes = createBootstrapRuntimes(appState, runtimeState);
  startBootstrapFlow(elements, appState, runtimes);
}
