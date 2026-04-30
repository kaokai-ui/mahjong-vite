import { getPlayerClientState } from "./game.js";
import { getTileLabel } from "./rules.js";
import {
  DEFAULT_SOLO_DIFFICULTY,
  SOLO_DIFFICULTY_LABELS,
  getDifficultyProfile,
  normalizeSoloDifficulty,
} from "./bot-ai-profile.js";
import { decideClaimAction, decideKongAction } from "./bot-ai-claim-kong.js";
import { chooseDiscardDecision } from "./bot-ai-discard-decisions.js";

export {
  DEFAULT_SOLO_DIFFICULTY,
  SOLO_DIFFICULTY_LABELS,
  normalizeSoloDifficulty,
} from "./bot-ai-profile.js";

export function decideBotAction(game, playerSeat, difficulty = DEFAULT_SOLO_DIFFICULTY) {
  const normalizedDifficulty = normalizeSoloDifficulty(difficulty);
  const profile = getDifficultyProfile(normalizedDifficulty);
  const clientState = getPlayerClientState(game, playerSeat);
  const player = game && Array.isArray(game.players) ? game.players[playerSeat] : null;

  if (!player) {
    return null;
  }

  if (clientState.canDraw) {
    return {
      type: "drawTile",
      delayMs: getBotDelay(),
      infoMessage: "電腦摸牌中...",
    };
  }

  if (clientState.canSelfDraw) {
    return {
      type: "declareSelfDraw",
      delayMs: getBotDelay(),
      infoMessage: "電腦正在判斷是否自摸...",
      resultMessage: "電腦自摸。",
    };
  }

  const claimDecision = decideClaimAction(game, playerSeat, clientState, profile);
  if (claimDecision) {
    return claimDecision;
  }

  const kongDecision = decideKongAction(game, playerSeat, player, clientState, profile);
  if (kongDecision) {
    return kongDecision;
  }

  if (clientState.canDiscard) {
    const discardDecision = chooseDiscardDecision(game, playerSeat, player, profile);
    return {
      type: "discardTile",
      payload: { tileId: discardDecision.tileId },
      delayMs: getBotDelay(),
      infoMessage: "電腦思考出牌中...",
      resultMessage: `電腦打出 ${getTileLabel(discardDecision.tileId)}。`,
      debugSummary: discardDecision.debugSummary,
    };
  }

  return null;
}

function getBotDelay(min = 800, max = 1500) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
