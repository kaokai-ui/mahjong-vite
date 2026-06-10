export function getPlayer(game, seat) {
  if (!game || !Array.isArray(game.players)) {
    return null;
  }
  return game.players.find((player) => player && player.seat === seat) || null;
}

export function getPlayerCount(gameOrCount) {
  if (typeof gameOrCount === "number") {
    return Number.isFinite(gameOrCount) && gameOrCount >= 2 ? Math.round(gameOrCount) : 2;
  }

  if (gameOrCount && Array.isArray(gameOrCount.players) && gameOrCount.players.length >= 2) {
    return gameOrCount.players.length;
  }

  return Number.isFinite(gameOrCount && gameOrCount.playerCount) && gameOrCount.playerCount >= 2
    ? Math.round(gameOrCount.playerCount)
    : 2;
}

export function getSeatRange(gameOrCount) {
  const playerCount = getPlayerCount(gameOrCount);
  return Array.from({ length: playerCount }, (_, seat) => seat);
}

function getTurnOrderDirection(gameOrCount) {
  return getPlayerCount(gameOrCount) >= 4 ? -1 : 1;
}

export function getNextSeat(seat, gameOrCount, step = 1) {
  const playerCount = getPlayerCount(gameOrCount);
  const normalizedSeat = ((Number(seat) % playerCount) + playerCount) % playerCount;
  const normalizedStep = Number.isFinite(step) ? Math.round(step) : 1;
  return (
    ((normalizedSeat + normalizedStep * getTurnOrderDirection(gameOrCount)) % playerCount + playerCount) % playerCount
  );
}

export function getOtherSeats(gameOrCount, seat) {
  return getSeatRange(gameOrCount).filter((candidateSeat) => candidateSeat !== seat);
}

export function getSeatDistance(fromSeat, toSeat, gameOrCount) {
  const playerCount = getPlayerCount(gameOrCount);
  const normalizedFrom = ((Number(fromSeat) % playerCount) + playerCount) % playerCount;
  const normalizedTo = ((Number(toSeat) % playerCount) + playerCount) % playerCount;
  return (
    (((normalizedTo - normalizedFrom) * getTurnOrderDirection(gameOrCount)) % playerCount + playerCount) % playerCount
  );
}

export function isNextSeat(fromSeat, candidateSeat, gameOrCount) {
  return getNextSeat(fromSeat, gameOrCount) === candidateSeat;
}

export function getOpponentSeat(seat) {
  return getNextSeat(seat, 2);
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
  return `P${seat + 1}`;
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
