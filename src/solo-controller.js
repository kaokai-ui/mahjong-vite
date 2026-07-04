import {
  DEFAULT_DRAW_REVEAL_SECONDS,
  applyGameCommand,
  createStartedGame,
  createWaitingGame,
  normalizeDrawRevealSeconds,
  normalizeGameState,
} from "./game.js";
import { DEFAULT_RULESET } from "./rules.js";
import { DEFAULT_SCORING_ENABLED, normalizeScoringEnabled } from "./scoring.js";
import {
  DEFAULT_SOLO_DIFFICULTY,
  SOLO_DIFFICULTY_LABELS,
  decideBotAction,
  normalizeSoloDifficulty,
} from "./bot-ai.js";
import { SOLO_STORAGE_KEYS } from "./solo-storage-keys.js";

const PLAYER_NAME_KEY = SOLO_STORAGE_KEYS.playerName;
const SOLO_DIFFICULTY_STORAGE_KEY = SOLO_STORAGE_KEYS.soloDifficulty;
const SOLO_PLAYER_COUNT_STORAGE_KEY = SOLO_STORAGE_KEYS.soloPlayerCount;
const HUMAN_PLAYER_ID = "solo-human";
const HUMAN_BROWSER_ID = "solo-human-browser";
const SOLO_ROOM_ID = "SOLO";
const BOT_NAME_PREFIX = "電腦玩家";
const DEFAULT_SOLO_PLAYER_COUNT = 2;
const MAX_SOLO_PLAYER_COUNT = 4;
const MAX_BOT_ACTION_RETRIES = 3;
const SOLO_FOUR_PLAYER_BOT_PROFILES = [
  { name: "夏曉蘭", difficulty: "god" },
  { name: "楊貴妃", difficulty: "normal" },
  { name: "李善德", difficulty: "hard" },
];

export {
  DEFAULT_SOLO_DIFFICULTY,
  SOLO_DIFFICULTY_LABELS,
  normalizeSoloDifficulty,
  DEFAULT_SOLO_PLAYER_COUNT,
  MAX_SOLO_PLAYER_COUNT,
  normalizeSoloPlayerCount,
  SOLO_FOUR_PLAYER_BOT_PROFILES,
  getSoloBotProfile,
};

function normalizeSoloPlayerCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SOLO_PLAYER_COUNT;
  }

  return Math.min(MAX_SOLO_PLAYER_COUNT, Math.max(DEFAULT_SOLO_PLAYER_COUNT, Math.round(parsed)));
}

export class SoloController {
  constructor({ onRoomChange, onInfo, onError, onStatusChange }) {
    this.onRoomChange = onRoomChange;
    this.onInfo = onInfo;
    this.onError = onError;
    this.onStatusChange = typeof onStatusChange === "function" ? onStatusChange : () => {};
    this.room = null;
    this.botTimer = 0;
    this.botActionFailureCount = 0;
    this.setupState = {
      configured: true,
      appCheckConfigured: false,
      initializing: false,
      ready: true,
      authReady: true,
      uid: HUMAN_PLAYER_ID,
      appCheckEnabled: false,
      appCheckReady: false,
      appCheckProvider: "",
      appCheckDebug: false,
      appCheckMessage: "單人模式不需要 Firebase。",
      error: "",
    };
  }

  async init() {
    this.emitStatus();
    return true;
  }

  getIdentity() {
    return {
      playerId: HUMAN_PLAYER_ID,
      browserId: HUMAN_BROWSER_ID,
      playerName: readStorage(PLAYER_NAME_KEY) || "",
    };
  }

  getSetupState() {
    return { ...this.setupState };
  }

  getSoloSettings() {
    return {
      difficulty: normalizeSoloDifficulty(readStorage(SOLO_DIFFICULTY_STORAGE_KEY) || DEFAULT_SOLO_DIFFICULTY),
      playerCount: getStoredSoloPlayerCount(),
    };
  }

  setPlayerName(playerName) {
    const trimmed = String(playerName || "").trim();
    if (!trimmed) {
      throw new Error("請先輸入玩家名稱。");
    }

    writeStorage(PLAYER_NAME_KEY, trimmed);
    return trimmed;
  }

  setSoloPlayerCount(playerCount) {
    const normalizedPlayerCount = normalizeSoloPlayerCount(playerCount);
    writeStorage(SOLO_PLAYER_COUNT_STORAGE_KEY, String(normalizedPlayerCount));
    return normalizedPlayerCount;
  }

  async createSoloGame({
    playerName,
    rulesetId = DEFAULT_RULESET,
    drawRevealSeconds = DEFAULT_DRAW_REVEAL_SECONDS,
    difficulty = DEFAULT_SOLO_DIFFICULTY,
    scoringEnabled = DEFAULT_SCORING_ENABLED,
    playerCount = getStoredSoloPlayerCount(),
  }) {
    this.clearBotTimer();

    const trimmedName = this.setPlayerName(playerName);
    const normalizedDifficulty = normalizeSoloDifficulty(difficulty);
    const normalizedDrawRevealSeconds = normalizeDrawRevealSeconds(drawRevealSeconds);
    const normalizedScoringEnabled = normalizeScoringEnabled(scoringEnabled);
    const normalizedPlayerCount = normalizeSoloPlayerCount(playerCount);
    writeStorage(SOLO_DIFFICULTY_STORAGE_KEY, normalizedDifficulty);
    writeStorage(SOLO_PLAYER_COUNT_STORAGE_KEY, String(normalizedPlayerCount));

    const now = Date.now();
    const waitingGame = createWaitingGame(rulesetId, {
      drawRevealSeconds: normalizedDrawRevealSeconds,
      scoringEnabled: normalizedScoringEnabled,
      playerCount: normalizedPlayerCount,
    });
    const startedGame = createStartedGame(rulesetId, waitingGame, {
      drawRevealSeconds: normalizedDrawRevealSeconds,
      scoringEnabled: normalizedScoringEnabled,
      playerCount: normalizedPlayerCount,
    });

    this.room = createSoloRoom({
      humanName: trimmedName,
      createdAt: now,
      updatedAt: now,
      rulesetId,
      difficulty: normalizedDifficulty,
      scoringEnabled: normalizedScoringEnabled,
      playerCount: normalizedPlayerCount,
      game: startedGame,
      botThinking: false,
      botThinkingSeat: null,
    });
    this.emitRoom();
    this.queueBotTurnIfNeeded();
  }

  async sendGameCommand(type, payload = {}) {
    if (!this.room || !this.room.game) {
      throw new Error("單人對局尚未開始。");
    }

    const result = applyGameCommand(this.room.game, {
      playerSeat: 0,
      type,
      payload,
    });

    if (!result.ok) {
      throw new Error(result.message);
    }

    this.updateRoomGame(result.game);
    this.queueBotTurnIfNeeded();
  }

  leaveRoom() {
    this.clearBotTimer();
    this.room = null;
    this.onRoomChange(null);
  }

  isHost() {
    return true;
  }

  queueBotTurnIfNeeded() {
    this.clearBotTimer();

    const action = this.getPendingBotAction();
    if (!action) {
      this.setBotThinking(false, null);
      return;
    }

    this.setBotThinking(true, action.playerSeat);
    this.onInfo(action.infoMessage || "電腦思考中...");

    this.botTimer = window.setTimeout(() => {
      this.botTimer = 0;
      this.setBotThinking(false, null);
      this.runBotAction(action);
    }, action.delayMs || 900);
  }

  getPendingBotAction() {
    if (!this.room || !this.room.game || this.room.game.status !== "playing") {
      return null;
    }

    // room.game is already normalized by createSoloRoom, so no re-normalize here.
    const game = this.room.game;
    const pendingClaim = game.pendingClaim || null;
    const botSeat = resolvePendingBotSeat(this.room, game, pendingClaim);
    if (botSeat === null) {
      return null;
    }

    // resolvePendingBotSeat already narrowed the phase (draw/discard -> turnSeat,
    // response/robKong -> pendingClaim.toSeat), so the seat is the one to act.
    const action = decideBotAction(game, botSeat, getBotDifficultyForSeat(this.room, botSeat));
    if (!action) {
      // A bot is on turn but produced no action: surface it instead of hanging silently.
      const message = `電腦玩家（座位 ${botSeat}）無法決定動作，對局可能卡住。`;
      console.warn("[SOLO] bot has no available action", { seat: botSeat, phase: game.phase });
      this.onError(message);
      return null;
    }

    return { ...action, playerSeat: botSeat };
  }

  runBotAction(action) {
    if (!this.room || !this.room.game) {
      return;
    }

    if (action && action.debugSummary) {
      const difficulty = getBotDifficultyForSeat(this.room, action.playerSeat);
      console.debug(
        `[BOT ${action.playerSeat} / ${SOLO_DIFFICULTY_LABELS[difficulty] || difficulty}]`,
        action.debugSummary,
      );
    }

    const result = applyGameCommand(this.room.game, {
      playerSeat: action.playerSeat,
      type: action.type,
      payload: action.payload || {},
    });

    if (!result.ok) {
      // Bot command rejected: recover to an operable state instead of freezing.
      // Clear the thinking indicator, surface the error, and bounded-retry so a
      // transient state change can resolve without an infinite retry loop.
      this.setBotThinking(false, null);
      this.onError(result.message);
      this.botActionFailureCount += 1;

      if (this.botActionFailureCount <= MAX_BOT_ACTION_RETRIES) {
        console.warn(
          `[SOLO] bot action rejected, retrying (${this.botActionFailureCount}/${MAX_BOT_ACTION_RETRIES})`,
          result.message,
        );
        this.queueBotTurnIfNeeded();
      } else {
        console.error("[SOLO] bot action repeatedly rejected, aborting bot turn", result.message);
        this.botActionFailureCount = 0;
      }
      return;
    }

    this.updateRoomGame(result.game);
    if (action.resultMessage) {
      this.onInfo(action.resultMessage);
    }
    this.queueBotTurnIfNeeded();
  }

  updateRoomGame(game) {
    if (!this.room) {
      return;
    }

    // A command applied successfully, so clear any accumulated bot-failure state.
    this.botActionFailureCount = 0;

    const updatedAt = Date.now();
    this.room = createSoloRoom({
      humanName: getHumanPlayer(this.room).name,
      createdAt: this.room.createdAt,
      updatedAt,
      rulesetId: game.rulesetId || this.room.rulesetId,
      difficulty: this.room.meta.soloDifficulty,
      scoringEnabled: normalizeScoringEnabled(
        game && Object.prototype.hasOwnProperty.call(game, "scoringEnabled")
          ? game.scoringEnabled
          : this.room.meta.scoringEnabled,
      ),
      playerCount: this.room.meta.soloPlayerCount || this.room.meta.playerCount || DEFAULT_SOLO_PLAYER_COUNT,
      game,
      botThinking: false,
      botThinkingSeat: null,
    });
    this.emitRoom();
  }

  setBotThinking(botThinking, botThinkingSeat) {
    if (
      !this.room ||
      (
        Boolean(this.room.meta.botThinking) === Boolean(botThinking) &&
        (this.room.meta.botThinkingSeat ?? null) === (botThinkingSeat ?? null)
      )
    ) {
      return;
    }

    this.room = {
      ...this.room,
      meta: {
        ...this.room.meta,
        botThinking: Boolean(botThinking),
        botThinkingSeat: botThinking ? botThinkingSeat : null,
      },
    };
    this.emitRoom();
  }

  emitRoom() {
    this.onRoomChange(this.room);
  }

  emitStatus() {
    this.onStatusChange(this.getSetupState());
  }

  clearBotTimer() {
    if (this.botTimer) {
      window.clearTimeout(this.botTimer);
      this.botTimer = 0;
    }
  }
}

function createSoloRoom({
  humanName,
  createdAt,
  updatedAt,
  rulesetId,
  difficulty,
  scoringEnabled,
  playerCount,
  game,
  botThinking,
  botThinkingSeat,
}) {
  const normalizedGame = normalizeGameState(game);
  const normalizedPlayerCount = normalizeSoloPlayerCount(
    playerCount || (normalizedGame && normalizedGame.playerCount),
  );
  const botDifficulties = getBotDifficultiesBySeat(normalizedPlayerCount, difficulty);
  const players = buildSoloPlayers({
    humanName,
    createdAt,
    playerCount: normalizedPlayerCount,
    fallbackDifficulty: difficulty,
  });
  const activePlayers = Object.values(players).sort((left, right) => left.seat - right.seat);
  const participants = Object.fromEntries(activePlayers.map((player) => [player.id, true]));
  const seats = Object.fromEntries(activePlayers.map((player) => [player.seat, player.id]));
  const seatBrowserIds = Object.fromEntries(activePlayers.map((player) => [player.seat, getBrowserIdForPlayer(player)]));

  return {
    roomId: SOLO_ROOM_ID,
    hostPlayerId: HUMAN_PLAYER_ID,
    rulesetId,
    createdAt,
    updatedAt,
    lastError: null,
    players,
    activePlayers,
    commands: {},
    gameMode: "solo-bot",
    game: normalizedGame,
    meta: {
      roomId: SOLO_ROOM_ID,
      hostPlayerId: HUMAN_PLAYER_ID,
      hostBrowserId: HUMAN_BROWSER_ID,
      godViewEnabled: false,
      rulesetId,
      createdAt,
      updatedAt,
      playerCount: normalizedPlayerCount,
      soloPlayerCount: normalizedPlayerCount,
      open: false,
      participants,
      seats,
      seatBrowserIds,
      gameMode: "solo-bot",
      soloDifficulty: normalizeSoloDifficulty(difficulty),
      botDifficulties,
      scoringEnabled: normalizeScoringEnabled(scoringEnabled),
      botThinking: Boolean(botThinking),
      botThinkingSeat: botThinking ? botThinkingSeat : null,
    },
  };
}

function buildSoloPlayers({ humanName, createdAt, playerCount, fallbackDifficulty }) {
  const players = {
    [HUMAN_PLAYER_ID]: {
      id: HUMAN_PLAYER_ID,
      name: humanName,
      seat: 0,
      joinedAt: createdAt,
      type: "human",
    },
  };

  for (let seat = 1; seat < playerCount; seat += 1) {
    const playerId = createBotPlayerId(seat);
    const botProfile = getSoloBotProfile(seat, playerCount, fallbackDifficulty);
    players[playerId] = {
      id: playerId,
      name: botProfile.name,
      seat,
      joinedAt: createdAt,
      type: "bot",
    };
  }

  return players;
}

function createBotPlayerId(seat) {
  return `solo-bot-${seat}`;
}

function getBotDifficultiesBySeat(playerCount, fallbackDifficulty = DEFAULT_SOLO_DIFFICULTY) {
  const difficulties = {};
  for (let seat = 1; seat < playerCount; seat += 1) {
    difficulties[seat] = getSoloBotProfile(seat, playerCount, fallbackDifficulty).difficulty;
  }
  return difficulties;
}

function getBotDifficultyForSeat(room, seat) {
  const mappedDifficulty = room?.meta?.botDifficulties?.[seat];
  return normalizeSoloDifficulty(mappedDifficulty || room?.meta?.soloDifficulty);
}

function getSoloBotProfile(seat, playerCount = DEFAULT_SOLO_PLAYER_COUNT, fallbackDifficulty = DEFAULT_SOLO_DIFFICULTY) {
  const normalizedSeat = Number(seat);
  const normalizedPlayerCount = normalizeSoloPlayerCount(playerCount);
  const fallback = normalizeSoloDifficulty(fallbackDifficulty);

  if (normalizedSeat < 1) {
    return {
      name: BOT_NAME_PREFIX,
      difficulty: fallback,
    };
  }

  const configuredProfile = SOLO_FOUR_PLAYER_BOT_PROFILES[normalizedSeat - 1];
  if (normalizedPlayerCount >= 4 && configuredProfile) {
    return configuredProfile;
  }

  if (configuredProfile) {
    return {
      name: configuredProfile.name,
      difficulty: fallback,
    };
  }

  return {
    name: `${BOT_NAME_PREFIX} ${normalizedSeat}`,
    difficulty: fallback,
  };
}

function getBrowserIdForPlayer(player) {
  if (player.type === "human") {
    return HUMAN_BROWSER_ID;
  }

  return `solo-bot-browser-${player.seat}`;
}

function getSeatPlayer(room, seat) {
  return room && Array.isArray(room.activePlayers)
    ? room.activePlayers.find((player) => player && player.seat === seat) || null
    : null;
}

function resolvePendingBotSeat(room, game, pendingClaim) {
  if ((game.phase === "draw" || game.phase === "discard") && typeof game.turnSeat === "number") {
    const currentPlayer = getSeatPlayer(room, game.turnSeat);
    return currentPlayer && currentPlayer.type === "bot" ? currentPlayer.seat : null;
  }

  if (
    ["response", "robKong"].includes(game.phase) &&
    pendingClaim &&
    typeof pendingClaim.toSeat === "number"
  ) {
    const currentPlayer = getSeatPlayer(room, pendingClaim.toSeat);
    return currentPlayer && currentPlayer.type === "bot" ? currentPlayer.seat : null;
  }

  return null;
}

function getHumanPlayer(room) {
  return room && room.players && room.players[HUMAN_PLAYER_ID]
    ? room.players[HUMAN_PLAYER_ID]
    : { name: "你" };
}

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function getStoredSoloPlayerCount() {
  return normalizeSoloPlayerCount(readStorage(SOLO_PLAYER_COUNT_STORAGE_KEY));
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // Ignore Safari private mode write failures.
  }
}
