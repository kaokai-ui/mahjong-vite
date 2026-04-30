import { getTileLabel, sortTileIds } from "./rules.js";
import {
  appendLog,
  getPlayer,
  removeExactTile,
  seatLabel,
} from "./game-internal-utils.js";
import { finishAsDraw } from "./game-resolution.js";

export function drawTurnTile(game, playerSeat, reason, source) {
  const tileId = game.wall.shift();
  if (!tileId) {
    finishAsDraw(game, "牌牆已摸完，流局。");
    return;
  }

  const player = getPlayer(game, playerSeat);
  player.hand = sortTileIds([...player.hand, tileId]);
  game.phase = "discard";
  game.turnSeat = playerSeat;
  game.lastDraw = {
    seat: playerSeat,
    tileId,
    source,
  };
  appendLog(game, `${seatLabel(playerSeat)}${reason}。`);
}

export function drawSupplementTile(game, playerSeat, reason) {
  const tileId = game.wall.pop();
  if (!tileId) {
    finishAsDraw(game, "補牌時牌牆已空，流局。");
    return;
  }

  const player = getPlayer(game, playerSeat);
  player.hand = sortTileIds([...player.hand, tileId]);
  game.phase = "discard";
  game.turnSeat = playerSeat;
  game.lastDraw = {
    seat: playerSeat,
    tileId,
    source: "supplement",
  };
  game.pendingClaim = null;
  game.latestDiscard = null;
  appendLog(game, `${seatLabel(playerSeat)}${reason}。`);
}

export function finalizeAddedKong(game, playerSeat, meldId, tileId) {
  const player = getPlayer(game, playerSeat);
  const meld = player.melds.find((candidate) => candidate.id === meldId);
  if (!meld) {
    return;
  }

  removeExactTile(player.hand, tileId);
  meld.type = "kong";
  meld.tiles = sortTileIds([...meld.tiles, tileId]);
  player.hand = sortTileIds(player.hand);
  game.pendingClaim = null;
  game.latestDiscard = null;
  appendLog(game, `${seatLabel(playerSeat)}補槓 ${getTileLabel(tileId)}。`);
  drawSupplementTile(game, playerSeat, "補槓補牌");
}
