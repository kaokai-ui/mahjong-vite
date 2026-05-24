import { decideBotAction, DEFAULT_SOLO_DIFFICULTY } from "./bot-ai.js";
import { normalizeGameState } from "./game.js";
import { getActivePlayers, getRoomTablePlayerCount } from "./network-room-helpers.js";
import { getSoloBotProfile } from "./solo-controller.js";

export function createPendingNetworkBotEntry(room) {
  if (!room || !room.game) {
    return null;
  }

  const game = normalizeGameState(room.game);
  if (!game || game.status !== "playing") {
    return null;
  }

  const pendingClaim = game.pendingClaim || null;
  const botSeat = resolvePendingBotSeat(room, game, pendingClaim);
  if (botSeat == null) {
    return null;
  }

  const botPlayer = getSeatPlayer(room, botSeat);
  if (!botPlayer || botPlayer.type !== "bot") {
    return null;
  }

  const difficulty = getBotDifficultyForSeat(room, botSeat);
  const action = decideBotAction(game, botSeat, difficulty);
  if (!action) {
    return null;
  }

  return {
    key: null,
    command: {
      type: action.type,
      fromPlayerId: botPlayer.id,
      createdAt: Date.now(),
      payload: action.payload || {},
    },
  };
}

function getSeatPlayer(room, seat) {
  return getActivePlayers(room).find((player) => player && player.seat === seat) || null;
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

function getBotDifficultyForSeat(room, seat) {
  return (
    room?.meta?.botDifficulties?.[String(seat)] ||
    getSoloBotProfile(seat, getRoomTablePlayerCount(room), DEFAULT_SOLO_DIFFICULTY).difficulty
  );
}
