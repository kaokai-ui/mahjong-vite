import { getTileLabel, getTileType, getTilesByType } from "./rules.js";
import { buildRobKongResponseState } from "./game-claim-state.js";
import {
  appendLog,
  failure,
  getPlayer,
  removeTiles,
  seatLabel,
  success,
} from "./game-internal-utils.js";
import { drawSupplementTile, finalizeAddedKong } from "./game-turn-flow.js";

function handleConcealedKong(game, playerSeat, payload = {}) {
  if (game.phase !== "discard" || game.turnSeat !== playerSeat) {
    return failure("It is not this player's discard step.");
  }

  const player = getPlayer(game, playerSeat);
  const tileType = payload.tileType;
  const usedTileIds = getTilesByType(player.hand, tileType, 4);
  if (usedTileIds.length !== 4) {
    return failure("The player does not have four matching tiles for a concealed kong.");
  }

  removeTiles(player.hand, usedTileIds);
  player.melds.push({
    id: game.nextMeldId,
    type: "kong",
    concealed: true,
    tileType,
    tiles: usedTileIds,
    fromSeat: playerSeat,
  });
  game.nextMeldId += 1;
  appendLog(game, `${seatLabel(playerSeat)} declared a concealed kong of ${getTileLabel(tileType)}.`);
  drawSupplementTile(game, playerSeat, "drew a supplement tile after the concealed kong");
  return success(game);
}

function handleAddedKong(game, playerSeat, payload = {}) {
  if (game.phase !== "discard" || game.turnSeat !== playerSeat) {
    return failure("It is not this player's discard step.");
  }

  const player = getPlayer(game, playerSeat);
  const meldId = payload.meldId;
  const tileId = payload.tileId;
  const meld = player.melds.find((candidate) => candidate.id === meldId);
  if (!meld || meld.type !== "pung" || meld.concealed) {
    return failure("The selected meld cannot be promoted to a kong.");
  }

  if (!player.hand.includes(tileId) || getTileType(tileId) !== meld.tileType) {
    return failure("The selected tile cannot complete the added kong.");
  }

  const robKongClaim = buildRobKongResponseState(game, playerSeat, {
    meldId,
    tileId,
    tileType: meld.tileType,
  });

  if (robKongClaim) {
    game.phase = "robKong";
    game.pendingClaim = robKongClaim;
    appendLog(game, `${seatLabel(playerSeat)} attempted an added kong. ${seatLabel(robKongClaim.toSeat)} may rob it.`);
    return success(game);
  }

  finalizeAddedKong(game, playerSeat, meldId, tileId);
  return success(game);
}

export const GAME_KONG_COMMAND_HANDLERS = {
  concealedKong: (game, playerSeat, payload) => handleConcealedKong(game, playerSeat, payload),
  addedKong: (game, playerSeat, payload) => handleAddedKong(game, playerSeat, payload),
};
