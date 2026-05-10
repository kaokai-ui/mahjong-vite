import {
  canClaimDiscardKong,
  canClaimPung,
  evaluateWinningHand,
  getChowCombos,
} from "./rules.js";
import {
  getNextSeat,
  getOtherSeats,
  getPlayer,
  getSeatDistance,
  isNextSeat,
} from "./game-internal-utils.js";

const CLAIM_OPTION_PRIORITIES = Object.freeze({
  win: 0,
  pung: 1,
  kong: 1,
  chow: 2,
});

function buildSingleDiscardClaimState(game, targetSeat) {
  const player = getPlayer(game, targetSeat);
  const tileId = game.latestDiscard.tileId;
  const options = [];
  const chowCombos = isNextSeat(game.latestDiscard.seat, targetSeat, game)
    ? getChowCombos(player.hand, tileId)
    : [];

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

function getClaimPriority(options = []) {
  return options.reduce((bestPriority, option) => {
    const optionPriority = Object.prototype.hasOwnProperty.call(CLAIM_OPTION_PRIORITIES, option)
      ? CLAIM_OPTION_PRIORITIES[option]
      : Number.MAX_SAFE_INTEGER;
    return Math.min(bestPriority, optionPriority);
  }, Number.MAX_SAFE_INTEGER);
}

function sortClaimsByPriority(left, right, fromSeat, game) {
  const leftPriority = getClaimPriority(left.options);
  const rightPriority = getClaimPriority(right.options);
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return (
    getSeatDistance(fromSeat, left.toSeat, game) -
    getSeatDistance(fromSeat, right.toSeat, game)
  );
}

export function buildDiscardClaimState(game, targetSeat) {
  return buildSingleDiscardClaimState(game, targetSeat);
}

export function buildDiscardResponseState(game) {
  if (!game || !game.latestDiscard) {
    return null;
  }

  const fromSeat = game.latestDiscard.seat;
  const candidateClaims = getOtherSeats(game, fromSeat)
    .map((targetSeat) => buildSingleDiscardClaimState(game, targetSeat))
    .filter((claim) => claim.options.length > 0)
    .sort((left, right) => sortClaimsByPriority(left, right, fromSeat, game));

  if (candidateClaims.length === 0) {
    return null;
  }

  const nextTurnSeat = getNextSeat(fromSeat, game);
  const currentClaim = candidateClaims[0];

  return {
    kind: "discard",
    fromSeat,
    discardId: game.latestDiscard.id,
    tileId: game.latestDiscard.tileId,
    nextTurnSeat,
    candidateClaims,
    candidateIndex: 0,
    toSeat: currentClaim.toSeat,
    options: currentClaim.options,
    chowCombos: currentClaim.chowCombos,
  };
}

export function buildRobKongResponseState(game, sourceSeat, { meldId, tileId, tileType }) {
  const candidateClaims = getOtherSeats(game, sourceSeat)
    .filter((targetSeat) => {
      const player = getPlayer(game, targetSeat);
      return evaluateWinningHand({
        handTileIds: player.hand,
        melds: player.melds,
        additionalTileType: tileType,
      }).canWin;
    })
    .map((targetSeat) => ({
      kind: "robKong",
      playerSeat: sourceSeat,
      fromSeat: sourceSeat,
      toSeat: targetSeat,
      meldId,
      tileId,
      tileType,
      options: ["win"],
      chowCombos: [],
    }))
    .sort((left, right) => (
      getSeatDistance(sourceSeat, left.toSeat, game) -
      getSeatDistance(sourceSeat, right.toSeat, game)
    ));

  if (candidateClaims.length === 0) {
    return null;
  }

  const currentClaim = candidateClaims[0];
  return {
    kind: "robKong",
    playerSeat: sourceSeat,
    fromSeat: sourceSeat,
    meldId,
    tileId,
    tileType,
    nextTurnSeat: sourceSeat,
    candidateClaims,
    candidateIndex: 0,
    toSeat: currentClaim.toSeat,
    options: currentClaim.options,
    chowCombos: [],
  };
}

export function advancePendingClaim(game) {
  if (!game || !game.pendingClaim || !Array.isArray(game.pendingClaim.candidateClaims)) {
    return null;
  }

  const nextIndex = Number(game.pendingClaim.candidateIndex || 0) + 1;
  if (nextIndex >= game.pendingClaim.candidateClaims.length) {
    game.pendingClaim = null;
    return null;
  }

  const nextClaim = game.pendingClaim.candidateClaims[nextIndex];
  game.pendingClaim = {
    ...game.pendingClaim,
    candidateIndex: nextIndex,
    toSeat: nextClaim.toSeat,
    options: nextClaim.options,
    chowCombos: nextClaim.chowCombos,
  };

  return game.pendingClaim;
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
