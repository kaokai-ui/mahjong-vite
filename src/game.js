import { normalizeGameState } from "./game-state.js";
import { cloneGame, failure, success } from "./game-internal-utils.js";
import { GAME_COMMAND_HANDLERS } from "./game-command-handlers.js";
import { createStartedGame } from "./game-setup.js";

export {
  DEFAULT_DRAW_REVEAL_SECONDS,
  normalizeRoundPlayer,
  normalizeDrawRevealSeconds,
  normalizeGameState,
} from "./game-state.js";
export { getPlayerClientState } from "./game-client-state.js";
export { createWaitingGame, createStartedGame } from "./game-setup.js";

export function applyGameCommand(gameState, command) {
  const game = cloneGame(normalizeGameState(gameState));
  const { playerSeat, type, payload = {} } = command;

  if (!game || !["playing", "finished"].includes(game.status)) {
    return failure("牌局尚未開始。");
  }

  if (type === "restartGame") {
    if (game.status !== "finished") {
      return failure("本局尚未結束，不能重新開局。");
    }
    return success(createStartedGame(payload.rulesetId || game.rulesetId, game));
  }

  if (game.status !== "playing") {
    return failure("本局已結束，請重新開局。");
  }

  const handler = GAME_COMMAND_HANDLERS[type];
  if (!handler) {
    return failure("未知的操作。");
  }

  return handler(game, playerSeat, payload);
}
