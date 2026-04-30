import { sortTileIds } from "./rules.js";
import { markDiscardClaimed } from "./game-claim-state.js";
import { failure, getPlayer, removeTiles } from "./game-internal-utils.js";

export function getDiscardResponseClaim(game, playerSeat, option, message) {
  const claim = game.pendingClaim;
  if (
    !claim ||
    claim.kind !== "discard" ||
    game.phase !== "response" ||
    claim.toSeat !== playerSeat ||
    !claim.options.includes(option)
  ) {
    return {
      claim: null,
      error: failure(message),
    };
  }

  return {
    claim,
    error: null,
  };
}

export function applyDiscardClaimMeld(
  game,
  {
    playerSeat,
    claim,
    meldType,
    meldTileType,
    usedTileIds,
  },
) {
  const player = getPlayer(game, playerSeat);
  removeTiles(player.hand, usedTileIds);
  markDiscardClaimed(game, claim.discardId);
  player.melds.push({
    id: game.nextMeldId,
    type: meldType,
    concealed: false,
    tileType: meldTileType,
    tiles: sortTileIds([...usedTileIds, claim.tileId]),
    fromSeat: claim.fromSeat,
  });
  game.nextMeldId += 1;
  player.hand = sortTileIds(player.hand);
  game.latestDiscard = null;
  game.pendingClaim = null;
  game.phase = "discard";
  game.turnSeat = playerSeat;

  return player;
}
