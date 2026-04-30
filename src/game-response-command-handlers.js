import { GAME_DISCARD_CLAIM_COMMAND_HANDLERS } from "./game-discard-claim-command-handlers.js";
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
    return failure("目前沒有可以放棄的叫牌。");
  }

  if (claim.kind === "discard") {
    game.pendingClaim = null;
    drawTurnTile(game, playerSeat, "摸牌", "live");
    appendLog(game, `${seatLabel(playerSeat)}選擇過牌。`);
    return success(game);
  }

  if (claim.kind === "robKong") {
    finalizeAddedKong(game, claim.playerSeat, claim.meldId, claim.tileId);
    appendLog(game, `${seatLabel(playerSeat)}放棄搶槓。`);
    return success(game);
  }

  return failure("無法處理過牌。");
}

export const GAME_RESPONSE_COMMAND_HANDLERS = {
  passClaim: (game, playerSeat) => handlePassClaim(game, playerSeat),
  ...GAME_DISCARD_CLAIM_COMMAND_HANDLERS,
};
