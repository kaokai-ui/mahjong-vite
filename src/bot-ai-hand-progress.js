import {
  countTileTypes,
  getTileRank,
  getTileSuit,
  getTileType,
  isHonorTile,
  isSuitTile,
} from "./rules.js";
import { ALL_TILE_TYPES } from "./bot-ai-profile.js";
import { getOtherSeats } from "./game-internal-utils.js";

function evaluateHandProgress(handTileIds, lockedMelds = 0, cache = null) {
  const counts = countTileTypes(handTileIds || []);
  const cacheKey = cache ? `${lockedMelds}|${ALL_TILE_TYPES.map((tileType) => counts[tileType] || 0).join(",")}` : "";
  if (cache && cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  const vector = ALL_TILE_TYPES.map((tileType) => counts[tileType] || 0);
  const memo = new Map();
  const structure = searchBestStructure(vector, false, lockedMelds, memo);
  const melds = Math.min(4, lockedMelds + structure.melds);
  const usefulTaatsu = Math.min(structure.taatsu, Math.max(0, 4 - melds));
  const pair = structure.pair ? 1 : 0;
  const shanten = Math.max(0, 8 - melds * 2 - usefulTaatsu - pair);
  const floating = Math.max(0, (handTileIds || []).length - structure.melds * 3 - usefulTaatsu * 2 - pair * 2);
  const connectionBonus = scoreConnections(counts);
  const score =
    melds * 120 +
    usefulTaatsu * 34 +
    pair * 20 -
    shanten * 180 -
    floating * 7 -
    structure.isolated * 4 +
    connectionBonus;

  const result = {
    shanten,
    melds,
    taatsu: usefulTaatsu,
    pair,
    floating,
    isolated: structure.isolated,
    score,
  };

  if (cache) {
    cache.set(cacheKey, result);
  }

  return result;
}

function searchBestStructure(vector, pairUsed, lockedMelds, memo) {
  const key = `${pairUsed ? 1 : 0}:${vector.join("")}`;
  if (memo.has(key)) {
    return memo.get(key);
  }

  const index = vector.findIndex((count) => count > 0);
  if (index === -1) {
    const result = { melds: 0, taatsu: 0, pair: pairUsed ? 1 : 0, isolated: 0 };
    memo.set(key, result);
    return result;
  }

  let best = null;
  const count = vector[index];

  if (count >= 3) {
    best = pickBetterStructure(
      best,
      addStructureDelta(searchBestStructure(removeVectorTiles(vector, [index, index, index]), pairUsed, lockedMelds, memo), {
        melds: 1,
      }),
      lockedMelds,
    );
  }

  if (canFormSequence(vector, index)) {
    best = pickBetterStructure(
      best,
      addStructureDelta(searchBestStructure(removeVectorTiles(vector, [index, index + 1, index + 2]), pairUsed, lockedMelds, memo), {
        melds: 1,
      }),
      lockedMelds,
    );
  }

  if (count >= 2) {
    if (!pairUsed) {
      best = pickBetterStructure(best, searchBestStructure(removeVectorTiles(vector, [index, index]), true, lockedMelds, memo), lockedMelds);
    }

    best = pickBetterStructure(
      best,
      addStructureDelta(searchBestStructure(removeVectorTiles(vector, [index, index]), pairUsed, lockedMelds, memo), {
        taatsu: 1,
      }),
      lockedMelds,
    );
  }

  if (canFormAdjacentTaatsu(vector, index)) {
    best = pickBetterStructure(
      best,
      addStructureDelta(searchBestStructure(removeVectorTiles(vector, [index, index + 1]), pairUsed, lockedMelds, memo), {
        taatsu: 1,
      }),
      lockedMelds,
    );
  }

  if (canFormGappedTaatsu(vector, index)) {
    best = pickBetterStructure(
      best,
      addStructureDelta(searchBestStructure(removeVectorTiles(vector, [index, index + 2]), pairUsed, lockedMelds, memo), {
        taatsu: 1,
      }),
      lockedMelds,
    );
  }

  best = pickBetterStructure(
    best,
    addStructureDelta(searchBestStructure(removeVectorTiles(vector, [index]), pairUsed, lockedMelds, memo), {
      isolated: 1,
    }),
    lockedMelds,
  );

  memo.set(key, best);
  return best;
}

function addStructureDelta(base, delta) {
  return {
    melds: base.melds + (delta.melds || 0),
    taatsu: base.taatsu + (delta.taatsu || 0),
    pair: base.pair,
    isolated: base.isolated + (delta.isolated || 0),
  };
}

function pickBetterStructure(currentBest, candidate, lockedMelds) {
  if (!candidate) {
    return currentBest;
  }
  if (!currentBest) {
    return candidate;
  }

  const currentSummary = summarizeStructure(currentBest, lockedMelds);
  const candidateSummary = summarizeStructure(candidate, lockedMelds);

  if (candidateSummary.shanten < currentSummary.shanten) {
    return candidate;
  }
  if (candidateSummary.shanten > currentSummary.shanten) {
    return currentBest;
  }
  if (candidateSummary.melds > currentSummary.melds) {
    return candidate;
  }
  if (candidateSummary.melds < currentSummary.melds) {
    return currentBest;
  }
  if (candidateSummary.taatsu > currentSummary.taatsu) {
    return candidate;
  }
  if (candidateSummary.taatsu < currentSummary.taatsu) {
    return currentBest;
  }
  if (candidateSummary.pair > currentSummary.pair) {
    return candidate;
  }
  if (candidateSummary.pair < currentSummary.pair) {
    return currentBest;
  }
  if (candidateSummary.isolated < currentSummary.isolated) {
    return candidate;
  }
  if (candidateSummary.isolated > currentSummary.isolated) {
    return currentBest;
  }
  return candidate;
}

function summarizeStructure(structure, lockedMelds) {
  const melds = Math.min(4, lockedMelds + structure.melds);
  const taatsu = Math.min(structure.taatsu, Math.max(0, 4 - melds));
  const pair = structure.pair ? 1 : 0;
  const shanten = Math.max(0, 8 - melds * 2 - taatsu - pair);
  return {
    shanten,
    melds,
    taatsu,
    pair,
    isolated: structure.isolated,
  };
}

function removeVectorTiles(vector, indexes) {
  const next = [...vector];
  for (const index of indexes) {
    next[index] -= 1;
  }
  return next;
}

function canFormSequence(vector, index) {
  if (!isSuitVectorIndex(index)) {
    return false;
  }
  const rank = (index % 9) + 1;
  return rank <= 7 && vector[index + 1] > 0 && vector[index + 2] > 0;
}

function canFormAdjacentTaatsu(vector, index) {
  if (!isSuitVectorIndex(index)) {
    return false;
  }
  const rank = (index % 9) + 1;
  return rank <= 8 && vector[index + 1] > 0;
}

function canFormGappedTaatsu(vector, index) {
  if (!isSuitVectorIndex(index)) {
    return false;
  }
  const rank = (index % 9) + 1;
  return rank <= 7 && vector[index + 2] > 0;
}

function isSuitVectorIndex(index) {
  return index >= 0 && index < 27;
}

function getTilesOfTypeFromHand(handTileIds, tileType, neededCount) {
  const matches = [];
  for (const tileId of handTileIds || []) {
    if (getTileType(tileId) === tileType) {
      matches.push(tileId);
      if (matches.length === neededCount) {
        return matches;
      }
    }
  }
  return matches;
}

function getTilesForNeededTypes(handTileIds, neededTypes) {
  const remaining = [...(handTileIds || [])];
  const selected = [];
  for (const neededType of neededTypes || []) {
    const matchIndex = remaining.findIndex((tileId) => getTileType(tileId) === neededType);
    if (matchIndex === -1) {
      return [];
    }
    selected.push(remaining[matchIndex]);
    remaining.splice(matchIndex, 1);
  }
  return selected;
}

function removeTileIdsFromHand(handTileIds, tileIdsToRemove) {
  const remaining = [...(handTileIds || [])];
  for (const tileId of tileIdsToRemove || []) {
    const removeIndex = remaining.indexOf(tileId);
    if (removeIndex !== -1) {
      remaining.splice(removeIndex, 1);
    }
  }
  return remaining;
}

function getCandidateDiscardTileIds(tileIds) {
  const seenTypes = new Set();
  const candidates = [];

  for (const tileId of tileIds || []) {
    const tileType = getTileType(tileId);
    if (seenTypes.has(tileType)) {
      continue;
    }
    seenTypes.add(tileType);
    candidates.push(tileId);
  }

  return candidates;
}

function scoreDiscardTile(tileId, counts) {
  const tileType = getTileType(tileId);
  const duplicates = counts[tileType] || 0;

  if (isHonorTile(tileType)) {
    let score = 12;
    if (duplicates >= 2) {
      score -= 8;
    }
    if (duplicates >= 3) {
      score -= 2;
    }
    return score;
  }

  const suit = getTileSuit(tileType);
  const rank = getTileRank(tileType);
  const leftOne = counts[`${suit}${rank - 1}`] || 0;
  const rightOne = counts[`${suit}${rank + 1}`] || 0;
  const leftTwo = counts[`${suit}${rank - 2}`] || 0;
  const rightTwo = counts[`${suit}${rank + 2}`] || 0;

  let score = 0;

  if (duplicates === 1) {
    score += 4;
  } else if (duplicates === 2) {
    score -= 4;
  } else if (duplicates >= 3) {
    score -= 7;
  }

  if (rank === 1 || rank === 9) {
    score += 4;
  } else if (rank === 2 || rank === 8) {
    score += 2;
  }

  if (leftOne > 0) {
    score -= 3;
  }
  if (rightOne > 0) {
    score -= 3;
  }
  if (leftTwo > 0) {
    score -= 1;
  }
  if (rightTwo > 0) {
    score -= 1;
  }

  if (leftOne === 0 && rightOne === 0 && leftTwo === 0 && rightTwo === 0) {
    score += 3;
  }

  if (rank >= 3 && rank <= 7 && leftOne > 0 && rightOne > 0) {
    score -= 2;
  }

  return score;
}

function scoreConnections(counts) {
  let score = 0;

  for (const tileType of Object.keys(counts)) {
    const count = counts[tileType] || 0;
    if (!count) {
      continue;
    }

    if (isHonorTile(tileType)) {
      if (count >= 2) {
        score += 8;
      }
      continue;
    }

    const suit = getTileSuit(tileType);
    const rank = getTileRank(tileType);
    const leftOne = counts[`${suit}${rank - 1}`] || 0;
    const rightOne = counts[`${suit}${rank + 1}`] || 0;
    const leftTwo = counts[`${suit}${rank - 2}`] || 0;
    const rightTwo = counts[`${suit}${rank + 2}`] || 0;

    score += Math.min(count, 2) * 2;
    score += (leftOne + rightOne) * 4;
    score += (leftTwo + rightTwo) * 2;

    if (rank >= 3 && rank <= 7 && leftOne > 0 && rightOne > 0) {
      score += 6;
    }
  }

  return score;
}

function createAnalysisCache() {
  return {
    progressCache: new Map(),
    advancedCache: new Map(),
    riskCache: new Map(),
    visibleCountsCache: new Map(),
    availabilityCache: new Map(),
    scoringCache: new Map(),
    lookaheadCache: new Map(),
  };
}

function getOpponentSeats(gameOrCount, seat) {
  return getOtherSeats(gameOrCount, seat);
}

function getOpponentSeat(gameOrCount, seat) {
  const opponentSeats = getOpponentSeats(gameOrCount, seat);
  return opponentSeats[0] ?? null;
}

export {
  evaluateHandProgress,
  getTilesOfTypeFromHand,
  getTilesForNeededTypes,
  removeTileIdsFromHand,
  getCandidateDiscardTileIds,
  scoreDiscardTile,
  createAnalysisCache,
  getOpponentSeats,
  getOpponentSeat,
};
