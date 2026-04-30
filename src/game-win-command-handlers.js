import { evaluateWinningHand } from "./rules.js";
import { markDiscardClaimed } from "./game-claim-state.js";
import { finishWithWinner } from "./game-resolution.js";
import {
  failure,
  getOpponentSeat,
  getPlayer,
  success,
} from "./game-internal-utils.js";

function handleDeclareSelfDraw(game, playerSeat) {
  if (game.phase !== "discard" || game.turnSeat !== playerSeat) {
    return failure("現在不能自摸。");
  }

  const player = getPlayer(game, playerSeat);
  const evaluation = evaluateWinningHand({
    handTileIds: player.hand,
    melds: player.melds,
  });
  if (!evaluation.canWin) {
    return failure("目前手牌尚未成胡。");
  }

  finishWithWinner(game, {
    winnerSeat: playerSeat,
    loserSeat: getOpponentSeat(playerSeat),
    winKind: "selfDraw",
    winningTileId: game.lastDraw ? game.lastDraw.tileId : null,
    patterns: [...evaluation.patterns, "自摸"],
  });
  return success(game);
}

function handleClaimWin(game, playerSeat) {
  const claim = game.pendingClaim;
  if (!claim || claim.toSeat !== playerSeat) {
    return failure("目前沒有可胡的牌。");
  }

  if (claim.kind === "discard") {
    const player = getPlayer(game, playerSeat);
    const evaluation = evaluateWinningHand({
      handTileIds: player.hand,
      melds: player.melds,
      additionalTileId: claim.tileId,
    });
    if (!evaluation.canWin) {
      return failure("這張牌不能讓你胡牌。");
    }

    markDiscardClaimed(game, claim.discardId);
    finishWithWinner(game, {
      winnerSeat: playerSeat,
      loserSeat: claim.fromSeat,
      winKind: "discardWin",
      winningTileId: claim.tileId,
      patterns: evaluation.patterns,
    });
    return success(game);
  }

  if (claim.kind === "robKong") {
    const player = getPlayer(game, playerSeat);
    const evaluation = evaluateWinningHand({
      handTileIds: player.hand,
      melds: player.melds,
      additionalTileType: claim.tileType,
    });
    if (!evaluation.canWin) {
      return failure("目前不能搶槓胡。");
    }

    finishWithWinner(game, {
      winnerSeat: playerSeat,
      loserSeat: claim.playerSeat,
      winKind: "robKong",
      winningTileId: claim.tileId,
      patterns: [...evaluation.patterns, "搶槓"],
    });
    return success(game);
  }

  return failure("這個胡牌動作無效。");
}

export const GAME_WIN_COMMAND_HANDLERS = {
  declareSelfDraw: (game, playerSeat) => handleDeclareSelfDraw(game, playerSeat),
  claimWin: (game, playerSeat) => handleClaimWin(game, playerSeat),
};
