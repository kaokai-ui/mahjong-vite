export function getPlayer(game, seat) {
  if (!game || !Array.isArray(game.players)) {
    return null;
  }
  return game.players.find((player) => player && player.seat === seat) || null;
}

export function getOpponentSeat(seat) {
  return seat === 0 ? 1 : 0;
}

export function removeExactTile(tileIds, tileId) {
  const index = tileIds.indexOf(tileId);
  if (index >= 0) {
    tileIds.splice(index, 1);
  }
}

export function removeTiles(tileIds, usedTileIds) {
  for (const tileId of usedTileIds) {
    removeExactTile(tileIds, tileId);
  }
}

export function appendLog(game, message) {
  game.actionLog = [message, ...game.actionLog].slice(0, 20);
}

export function seatLabel(seat) {
  return `玩家 ${seat + 1}`;
}

export function cloneGame(game) {
  return JSON.parse(JSON.stringify(game));
}

export function success(game) {
  return {
    ok: true,
    game,
  };
}

export function failure(message) {
  return {
    ok: false,
    message,
  };
}
