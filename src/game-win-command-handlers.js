import { evaluateWinningHand } from "./rules.js";
import { markDiscardClaimed } from "./game-claim-state.js";
import { finishWithWinner } from "./game-resolution.js";
import {
  failure,
  getOtherSeats,
  getPlayer,
  success,
} from "./game-internal-utils.js";

function handleDeclareSelfDraw(game, playerSeat) {
  if (game.phase !== "discard" || game.turnSeat !== playerSeat) {
    return failure("It is not this player's discard step.");
  }

  const player = getPlayer(game, playerSeat);
  const evaluation = evaluateWinningHand({
    handTileIds: player.hand,
    melds: player.melds,
  });
  if (!evaluation.canWin) {
    return failure("The hand is not a valid self-draw win.");
  }

  finishWithWinner(game, {
    winnerSeat: playerSeat,
    loserSeat: getOtherSeats(game, playerSeat),
    winKind: "selfDraw",
    winningTileId: game.lastDraw ? game.lastDraw.tileId : null,
    patterns: [...evaluation.patterns, "Self Draw"],
  });
  return success(game);
}

function handleClaimWin(game, playerSeat) {
  const claim = game.pendingClaim;
  if (!claim || claim.toSeat !== playerSeat) {
    return failure("There is no active win claim for this player.");
  }

  if (claim.kind === "discard") {
    const player = getPlayer(game, playerSeat);
    const evaluation = evaluateWinningHand({
      handTileIds: player.hand,
      melds: player.melds,
      additionalTileId: claim.tileId,
    });
    if (!evaluation.canWin) {
      return failure("The discard does not complete a winning hand.");
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
      return failure("The added kong cannot be robbed by this hand.");
    }

    finishWithWinner(game, {
      winnerSeat: playerSeat,
      loserSeat: claim.playerSeat,
      winKind: "robKong",
      winningTileId: claim.tileId,
      patterns: [...evaluation.patterns, "Rob Kong"],
    });
    return success(game);
  }

  return failure("Unknown win claim state.");
}

export const GAME_WIN_COMMAND_HANDLERS = {
  declareSelfDraw: (game, playerSeat) => handleDeclareSelfDraw(game, playerSeat),
  claimWin: (game, playerSeat) => handleClaimWin(game, playerSeat),
};
