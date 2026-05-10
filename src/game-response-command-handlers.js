import { GAME_DISCARD_CLAIM_COMMAND_HANDLERS } from "./game-discard-claim-command-handlers.js";
import { advancePendingClaim } from "./game-claim-state.js";
import {
  appendLog,
  failure,
  seatLabel,
  success,
} from "./game-internal-utils.js";
import {
  drawTurnTile,
  finalizeAddedKong,
} from "./game-turn-flow.js";

function handlePassClaim(game, playerSeat) {
  const claim = game.pendingClaim;
  if (!claim || claim.toSeat !== playerSeat) {
    return failure("There is no active claim to pass.");
  }

  appendLog(game, `${seatLabel(playerSeat)} passed.`);

  const advancedClaim = advancePendingClaim(game);
  if (advancedClaim) {
    return success(game);
  }

  if (claim.kind === "discard") {
    drawTurnTile(game, claim.nextTurnSeat, "drew a tile", "live");
    return success(game);
  }

  if (claim.kind === "robKong") {
    finalizeAddedKong(game, claim.playerSeat, claim.meldId, claim.tileId);
    return success(game);
  }

  return failure("Unknown claim state.");
}

export const GAME_RESPONSE_COMMAND_HANDLERS = {
  passClaim: (game, playerSeat) => handlePassClaim(game, playerSeat),
  ...GAME_DISCARD_CLAIM_COMMAND_HANDLERS,
};
