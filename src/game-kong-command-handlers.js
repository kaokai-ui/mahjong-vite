import { evaluateWinningHand, getTileLabel, getTileType, getTilesByType } from "./rules.js";
import {
  appendLog,
  failure,
  getOpponentSeat,
  getPlayer,
  removeTiles,
  seatLabel,
  success,
} from "./game-internal-utils.js";
import { drawSupplementTile, finalizeAddedKong } from "./game-turn-flow.js";

function handleConcealedKong(game, playerSeat, payload = {}) {
  if (game.phase !== "discard" || game.turnSeat !== playerSeat) {
    return failure("現在不能暗槓。");
  }

  const player = getPlayer(game, playerSeat);
  const tileType = payload.tileType;
  const usedTileIds = getTilesByType(player.hand, tileType, 4);
  if (usedTileIds.length !== 4) {
    return failure("沒有可暗槓的四張同牌。");
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
  appendLog(game, `${seatLabel(playerSeat)}暗槓 ${getTileLabel(tileType)}。`);
  drawSupplementTile(game, playerSeat, "暗槓補牌");
  return success(game);
}

function handleAddedKong(game, playerSeat, payload = {}) {
  if (game.phase !== "discard" || game.turnSeat !== playerSeat) {
    return failure("現在不能補槓。");
  }

  const player = getPlayer(game, playerSeat);
  const meldId = payload.meldId;
  const tileId = payload.tileId;
  const meld = player.melds.find((candidate) => candidate.id === meldId);
  if (!meld || meld.type !== "pung" || meld.concealed) {
    return failure("這副牌不能補槓。");
  }

  if (!player.hand.includes(tileId) || getTileType(tileId) !== meld.tileType) {
    return failure("缺少補槓需要的牌。");
  }

  const targetSeat = getOpponentSeat(playerSeat);
  const opponent = getPlayer(game, targetSeat);
  const robWin = evaluateWinningHand({
    handTileIds: opponent.hand,
    melds: opponent.melds,
    additionalTileType: meld.tileType,
  });

  if (robWin.canWin) {
    game.phase = "robKong";
    game.pendingClaim = {
      kind: "robKong",
      playerSeat,
      toSeat: targetSeat,
      meldId,
      tileId,
      tileType: meld.tileType,
    };
    appendLog(game, `${seatLabel(playerSeat)}宣告補槓，等待 ${seatLabel(targetSeat)} 是否搶槓。`);
    return success(game);
  }

  finalizeAddedKong(game, playerSeat, meldId, tileId);
  return success(game);
}

export const GAME_KONG_COMMAND_HANDLERS = {
  concealedKong: (game, playerSeat, payload) => handleConcealedKong(game, playerSeat, payload),
  addedKong: (game, playerSeat, payload) => handleAddedKong(game, playerSeat, payload),
};
