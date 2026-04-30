import { buildGamePanelContext as buildBaseGamePanelContext } from "./game-panel-context";
import type { AutoDrawContext, DrawRevealContext, DrawRevealSnapshot, GameRuntimeState } from "./game-runtime-state";
import type { AppGameLike, AppGamePanelContext, AppRoomLike, AppState, ControllerLike } from "./runtime-shell-types";

export type GamePanelRuntimeContext = (AppGamePanelContext & {
  drawReveal?: DrawRevealSnapshot | null;
  game?: (AppGameLike & { drawRevealSeconds?: number }) | null;
}) | null;

type CreateGamePanelRuntimeDeps = {
  getController: () => ControllerLike;
  getDrawRevealState: (state: GameRuntimeState, context: DrawRevealContext) => DrawRevealSnapshot | null;
  render: () => void;
  runtimeState: GameRuntimeState;
  triggerAutoDrawIfNeeded?: (state: GameRuntimeState, context: AutoDrawContext) => void;
};

export function renderGamePanelReactShell(appState: AppState, deps: CreateGamePanelRuntimeDeps) {
  const context = getGamePanelContext(appState, deps);
  if (!context || !context.currentPlayer || typeof context.seat !== "number" || !context.clientState) {
    return;
  }

  const { game, seat, clientState } = context;
  if (!deps.triggerAutoDrawIfNeeded) {
    return;
  }
  deps.triggerAutoDrawIfNeeded(deps.runtimeState, {
    roomId: getRoomId(appState.room),
    game,
    playerSeat: seat,
    clientState,
    sendGameCommand: (command: string, payload?: unknown) => deps.getController().sendGameCommand(command, payload),
    onError: (error: unknown) => {
      appState.error = getErrorMessage(error);
      deps.render();
    },
  });
}

export function getGamePanelContext(
  appState: AppState,
  deps: CreateGamePanelRuntimeDeps,
  room: AppRoomLike | null = appState.room,
): GamePanelRuntimeContext {
  const { playerId } = deps.getController().getIdentity();
  const baseContext = buildBaseGamePanelContext({
    room,
    playerId,
  });
  if (!baseContext || !baseContext.currentPlayer) {
    return baseContext;
  }
  if (typeof baseContext.seat !== "number") {
    return {
      ...baseContext,
      drawReveal: null,
    };
  }

  return {
    ...baseContext,
    drawReveal: deps.getDrawRevealState(deps.runtimeState, {
      roomId: getRoomId(room),
      game: baseContext.game,
      playerSeat: baseContext.seat,
      playerRoundState: baseContext.selfRoundState,
      drawRevealSeconds: baseContext.game && baseContext.game.drawRevealSeconds,
      scheduleRender: deps.render,
    }),
  };
}

function getRoomId(room: AppRoomLike | null) {
  return typeof room?.roomId === "string" ? room.roomId : "";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
