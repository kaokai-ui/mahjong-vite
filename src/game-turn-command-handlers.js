import { getTileLabel, sortTileIds } from "./rules.js";
import { buildDiscardResponseState } from "./game-claim-state.js";
import {
  appendLog,
  failure,
  getNextSeat,
  getPlayer,
  removeExactTile,
  seatLabel,
  success,
} from "./game-internal-utils.js";
import { drawTurnTile } from "./game-turn-flow.js";

function handleDrawTile(game, playerSeat) {
  if (game.phase !== "draw" || game.turnSeat !== playerSeat) {
    return failure("It is not this player's draw step.");
  }

  drawTurnTile(game, playerSeat, "drew a tile", "live");
  return success(game);
}

function handleDiscardTile(game, playerSeat, payload = {}) {
  if (game.phase !== "discard" || game.turnSeat !== playerSeat) {
    return failure("It is not this player's discard step.");
  }

  const player = getPlayer(game, playerSeat);
  const tileId = payload.tileId;
  if (!player.hand.includes(tileId)) {
    return failure("The selected tile is not in the player's hand.");
  }

  removeExactTile(player.hand, tileId);
  player.hand = sortTileIds(player.hand);

  const discardRecord = {
    id: game.nextDiscardId,
    tileId,
    claimed: false,
  };
  game.nextDiscardId += 1;
  player.discards.push(discardRecord);
  game.latestDiscard = {
    id: discardRecord.id,
    tileId,
    seat: playerSeat,
  };
  game.lastDraw = null;

  appendLog(game, `${seatLabel(playerSeat)} discarded ${getTileLabel(tileId)}.`);

  const pendingClaim = buildDiscardResponseState(game);
  if (pendingClaim) {
    game.phase = "response";
    game.pendingClaim = pendingClaim;
    return success(game);
  }

  game.pendingClaim = null;
  drawTurnTile(game, getNextSeat(playerSeat, game), "drew a tile", "live");
  return success(game);
}

export const GAME_TURN_COMMAND_HANDLERS = {
  drawTile: (game, playerSeat) => handleDrawTile(game, playerSeat),
  discardTile: (game, playerSeat, payload) => handleDiscardTile(game, playerSeat, payload),
};
