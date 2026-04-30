import { getTileLabel, sortTileIds } from "./rules.js";
import { buildDiscardClaimState } from "./game-claim-state.js";
import {
  appendLog,
  failure,
  getOpponentSeat,
  getPlayer,
  removeExactTile,
  seatLabel,
  success,
} from "./game-internal-utils.js";
import { drawTurnTile } from "./game-turn-flow.js";

function handleDrawTile(game, playerSeat) {
  if (game.phase !== "draw" || game.turnSeat !== playerSeat) {
    return failure("現在不能摸牌。");
  }

  drawTurnTile(game, playerSeat, "摸牌", "live");
  return success(game);
}

function handleDiscardTile(game, playerSeat, payload = {}) {
  if (game.phase !== "discard" || game.turnSeat !== playerSeat) {
    return failure("現在不能打牌。");
  }

  const player = getPlayer(game, playerSeat);
  const tileId = payload.tileId;
  if (!player.hand.includes(tileId)) {
    return failure("指定的牌不在手牌中。");
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

  appendLog(game, `${seatLabel(playerSeat)}打出 ${getTileLabel(tileId)}。`);

  const targetSeat = getOpponentSeat(playerSeat);
  const claimState = buildDiscardClaimState(game, targetSeat);

  if (claimState.options.length > 0) {
    game.phase = "response";
    game.pendingClaim = claimState;
    return success(game);
  }

  game.pendingClaim = null;
  drawTurnTile(game, targetSeat, "摸牌", "live");
  return success(game);
}

export const GAME_TURN_COMMAND_HANDLERS = {
  drawTile: (game, playerSeat) => handleDrawTile(game, playerSeat),
  discardTile: (game, playerSeat, payload) => handleDiscardTile(game, playerSeat, payload),
};
