import { DEFAULT_DRAW_REVEAL_SECONDS } from "./game.js";

const DRAW_REVEAL_FINAL_STEP_MS = 100;
const DRAW_REVEAL_GRACE_MS = 350;

type LastDrawLike = {
  initial?: boolean;
  seat?: number;
  tileId?: string;
  source?: string;
} | null;

type GameLike = {
  wall?: unknown[];
  roundNumber?: number | null;
  lastDraw?: LastDrawLike;
  phase?: string;
} | null | undefined;

type ClientStateLike = {
  canDraw?: boolean;
};

type PlayerRoundStateLike = {
  hand?: string[];
} | null | undefined;

type RoomLike = {
  gameMode?: string;
  meta?: {
    gameMode?: string;
  } | null;
} | null | undefined;

const ONLINE_WATCHDOG_TICK_MS = 1000;

export type GameRuntimeState = {
  drawRevealKey: string;
  drawRevealCompletedKey: string;
  drawRevealEndsAt: number;
  countdownTimer: number;
  autoDrawKey: string;
  onlineWatchdogTimer: number;
};

export type AutoDrawContext = {
  roomId: string;
  game: GameLike;
  playerSeat: number;
  clientState: ClientStateLike;
  sendGameCommand: (command: string, payload?: Record<string, unknown>) => Promise<unknown>;
  onError: (error: unknown) => void;
};

export type DrawRevealContext = {
  roomId: string;
  game: GameLike;
  playerSeat: number;
  playerRoundState: PlayerRoundStateLike;
  drawRevealSeconds: unknown;
  scheduleRender: () => void;
};

export type DrawRevealSnapshot = {
  tileId: string;
  countdownLabel: string;
  isGracePeriod: boolean;
};

export function createGameRuntimeState(): GameRuntimeState {
  return {
    drawRevealKey: "",
    drawRevealCompletedKey: "",
    drawRevealEndsAt: 0,
    countdownTimer: 0,
    autoDrawKey: "",
    onlineWatchdogTimer: 0,
  };
}

export function resetGameRuntimeState(state: GameRuntimeState) {
  state.autoDrawKey = "";
  state.drawRevealCompletedKey = "";
  clearDrawRevealState(state);
  clearOnlineWatchdogTimer(state);
}

export function triggerAutoDrawIfNeeded(state: GameRuntimeState, context: AutoDrawContext) {
  const { roomId, game, playerSeat, clientState, sendGameCommand, onError } = context;
  if (!game || !clientState.canDraw) {
    return;
  }

  const wallCount = game.wall ? game.wall.length : 0;
  const key = `${roomId}:${game.roundNumber}:${playerSeat}:${wallCount}`;
  if (state.autoDrawKey === key) {
    return;
  }

  state.autoDrawKey = key;
  window.setTimeout(async () => {
    try {
      await sendGameCommand("drawTile", {});
    } catch (error) {
      onError(error);
    }
  }, 0);
}

export function getDrawRevealState(
  state: GameRuntimeState,
  context: DrawRevealContext,
): DrawRevealSnapshot | null {
  const { roomId, game, playerSeat, playerRoundState, drawRevealSeconds, scheduleRender } = context;
  const lastDraw = game && game.lastDraw ? game.lastDraw : null;
  const hand = playerRoundState && Array.isArray(playerRoundState.hand) ? playerRoundState.hand : [];
  const normalizedDrawRevealSeconds = normalizeDrawRevealSecondsValue(drawRevealSeconds);

  if (
    !lastDraw ||
    lastDraw.initial ||
    lastDraw.seat !== playerSeat ||
    !lastDraw.tileId ||
    !hand.includes(lastDraw.tileId) ||
    !game ||
    game.phase !== "discard" ||
    normalizedDrawRevealSeconds <= 0
  ) {
    clearDrawRevealState(state);
    return null;
  }

  const key = `${roomId}:${game.roundNumber}:${lastDraw.seat}:${lastDraw.tileId}:${lastDraw.source || ""}`;
  const now = Date.now();

  if (state.drawRevealCompletedKey === key) {
    return null;
  }

  if (state.drawRevealKey !== key) {
    state.drawRevealKey = key;
    state.drawRevealEndsAt = now + normalizedDrawRevealSeconds * 1000;
  }

  const remainingMs = state.drawRevealEndsAt - now;
  if (remainingMs <= -DRAW_REVEAL_GRACE_MS) {
    state.drawRevealCompletedKey = key;
    clearDrawRevealState(state);
    return null;
  }

  const visibleRemainingMs = Math.max(0, remainingMs);
  scheduleCountdownRender(state, getNextDrawRevealRenderDelay(remainingMs), scheduleRender);

  return {
    tileId: lastDraw.tileId,
    countdownLabel: formatDrawRevealCountdown(visibleRemainingMs),
    isGracePeriod: remainingMs <= 0,
  };
}

export function normalizeDrawRevealSecondsValue(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_DRAW_REVEAL_SECONDS;
  }

  return Math.min(6, Math.max(0, Math.round(parsed)));
}

export function syncOnlineWatchdogRenderTimer(
  state: GameRuntimeState,
  room: RoomLike,
  scheduleRender: () => void,
) {
  if (!shouldWatchOnlineRoom(room)) {
    clearOnlineWatchdogTimer(state);
    return;
  }

  if (state.onlineWatchdogTimer) {
    return;
  }

  state.onlineWatchdogTimer = window.setTimeout(() => {
    state.onlineWatchdogTimer = 0;
    scheduleRender();
  }, ONLINE_WATCHDOG_TICK_MS);
}

function clearDrawRevealState(state: GameRuntimeState) {
  state.drawRevealKey = "";
  state.drawRevealEndsAt = 0;
  if (state.countdownTimer) {
    window.clearTimeout(state.countdownTimer);
    state.countdownTimer = 0;
  }
}

function clearOnlineWatchdogTimer(state: GameRuntimeState) {
  if (state.onlineWatchdogTimer) {
    window.clearTimeout(state.onlineWatchdogTimer);
    state.onlineWatchdogTimer = 0;
  }
}

function scheduleCountdownRender(state: GameRuntimeState, delay: number, scheduleRender: () => void) {
  if (state.countdownTimer) {
    window.clearTimeout(state.countdownTimer);
  }

  state.countdownTimer = window.setTimeout(() => {
    state.countdownTimer = 0;
    scheduleRender();
  }, Math.max(16, delay));
}

function getNextDrawRevealRenderDelay(remainingMs: number): number {
  if (remainingMs <= 0) {
    return DRAW_REVEAL_GRACE_MS + remainingMs;
  }

  if (remainingMs > 1000) {
    const currentSecond = Math.ceil(remainingMs / 1000);
    return remainingMs - (currentSecond - 1) * 1000;
  }

  const currentTenth = Math.max(1, Math.floor(remainingMs / DRAW_REVEAL_FINAL_STEP_MS));
  return remainingMs - (currentTenth * DRAW_REVEAL_FINAL_STEP_MS - 1);
}

function formatDrawRevealCountdown(remainingMs: number): string {
  if (remainingMs <= 0) {
    return "";
  }

  if (remainingMs > 1000) {
    return String(Math.ceil(remainingMs / 1000));
  }

  const tenths = Math.max(1, Math.floor(remainingMs / DRAW_REVEAL_FINAL_STEP_MS));
  return (tenths / 10).toFixed(1);
}

function shouldWatchOnlineRoom(room: RoomLike) {
  const gameMode = String(room?.meta?.gameMode || room?.gameMode || "").trim();
  return gameMode === "online-2p" || gameMode === "online-4p";
}
