import {
  canClaimDiscardKong,
  canClaimPung,
  evaluateWinningHand,
  getChowCombos,
} from "./rules.js";
import { getPlayer } from "./game-internal-utils.js";

export function buildDiscardClaimState(game, targetSeat) {
  const player = getPlayer(game, targetSeat);
  const tileId = game.latestDiscard.tileId;
  const options = [];
  const chowCombos = getChowCombos(player.hand, tileId);

  if (
    evaluateWinningHand({
      handTileIds: player.hand,
      melds: player.melds,
      additionalTileId: tileId,
    }).canWin
  ) {
    options.push("win");
  }

  if (canClaimPung(player.hand, tileId)) {
    options.push("pung");
  }

  if (canClaimDiscardKong(player.hand, tileId)) {
    options.push("kong");
  }

  if (chowCombos.length > 0) {
    options.push("chow");
  }

  return {
    kind: "discard",
    fromSeat: game.latestDiscard.seat,
    toSeat: targetSeat,
    discardId: game.latestDiscard.id,
    tileId,
    options,
    chowCombos,
  };
}

export function markDiscardClaimed(game, discardId) {
  for (const player of game.players) {
    const discard = player.discards.find((item) => item.id === discardId);
    if (discard) {
      discard.claimed = true;
      return;
    }
  }
}
