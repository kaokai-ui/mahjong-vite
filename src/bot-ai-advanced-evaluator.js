import {
  countTileTypes,
  getRuleset,
  getTileRank,
  getTileSuit,
  getTileType,
  isHonorTile,
  isSuitTile,
} from "./rules.js";
import { estimateScoringPotential, normalizeScoringEnabled } from "./scoring.js";
import {
  ALL_TILE_TYPES,
  DIFFICULTY_PROFILES,
  getScoringProfileId,
  isScoringStrategyEnabled,
} from "./bot-ai-profile.js";
import {
  createAnalysisCache,
  evaluateHandProgress,
  getOpponentSeat,
} from "./bot-ai-hand-progress.js";

function evaluateAdvancedHand(
  game,
  playerSeat,
  handTileIds,
  lockedMelds = 0,
  extraVisibleTileTypes = [],
  analysisCache = createAnalysisCache(),
  profile = DIFFICULTY_PROFILES.hard,
) {
  const cacheKey = createAdvancedHandCacheKey(game, playerSeat, handTileIds, lockedMelds, extraVisibleTileTypes, profile);
  if (analysisCache.advancedCache.has(cacheKey)) {
    return analysisCache.advancedCache.get(cacheKey);
  }

  const base = evaluateHandProgress(handTileIds, lockedMelds, analysisCache.progressCache);
  const future = evaluateFutureDrawPotential(
    game,
    playerSeat,
    handTileIds,
    lockedMelds,
    extraVisibleTileTypes,
    base,
    analysisCache,
  );
  const shapeScore = evaluateShape(base);
  const availabilityScore = evaluateAvailability(future, base);
  const flexibilityScore = evaluateFlexibility(handTileIds);
  const scoringPotential = isScoringStrategyEnabled(game, profile)
    ? getCachedScoringPotential({
        game,
        playerSeat,
        handTileIds,
        extraVisibleTileTypes,
        analysisCache,
        profile,
      })
    : null;
  const scoringScore = scoringPotential ? scoringPotential.evScore * (profile.scoringWeight || 0.5) : 0;
  const totalScore = shapeScore + availabilityScore + flexibilityScore + scoringScore;

  const result = {
    ...base,
    ...future,
    shapeScore,
    availabilityScore,
    flexibilityScore,
    scoringPotential,
    scoringScore,
    totalScore,
  };

  analysisCache.advancedCache.set(cacheKey, result);
  return result;
}

function getCachedScoringPotential({
  game,
  playerSeat,
  handTileIds,
  extraVisibleTileTypes,
  analysisCache,
  profile,
}) {
  const counts = countTileTypes(handTileIds || []);
  const countKey = ALL_TILE_TYPES.map((tileType) => counts[tileType] || 0).join(",");
  const extraKey = [...(extraVisibleTileTypes || [])].map(getTileType).sort().join(",");
  const scoringProfileId = getScoringProfileId(profile);
  const visibleCounts = buildVisibleCounts(game, playerSeat, handTileIds, extraVisibleTileTypes, analysisCache);
  const visibleKey = ALL_TILE_TYPES.map((tileType) => visibleCounts[tileType] || 0).join(",");
  const meldKey = getPlayerMelds(game, playerSeat)
    .map((meld) => `${meld.type}:${meld.tileType || ""}:${meld.concealed ? 1 : 0}`)
    .join("|");
  const cacheKey = `${playerSeat}|${countKey}|${extraKey}|${visibleKey}|${meldKey}|${scoringProfileId}`;

  if (analysisCache.scoringCache.has(cacheKey)) {
    return analysisCache.scoringCache.get(cacheKey);
  }

  const scoringPotential = estimateScoringPotential({
    handTileIds,
    melds: getPlayerMelds(game, playerSeat),
    visibleCounts,
    profile: scoringProfileId,
  });
  analysisCache.scoringCache.set(cacheKey, scoringPotential);
  return scoringPotential;
}

function evaluateShape(progress) {
  return (
    progress.melds * 120 +
    progress.taatsu * 40 +
    progress.pair * 20 -
    progress.shanten * 220 -
    progress.floating * 10 -
    progress.isolated * 12
  );
}

function evaluateAvailability(future, progress) {
  return (
    future.expectedImprovement * 1.35 +
    future.effectiveTileCount * 10 +
    future.improvementTypeCount * 5 +
    (future.bestImprovement > 0 ? Math.min(future.bestImprovement, 220) * 0.25 : 0) -
    progress.shanten * 6
  );
}

function evaluateFlexibility(handTileIds) {
  const counts = countTileTypes(handTileIds || []);
  let score = 0;

  for (const tileType of Object.keys(counts)) {
    const count = counts[tileType] || 0;
    if (!count) {
      continue;
    }

    if (isHonorTile(tileType)) {
      if (count === 1) {
        score -= 4;
      }
      if (count >= 2) {
        score += 6;
      }
      continue;
    }

    const rank = getTileRank(tileType);
    if (rank >= 3 && rank <= 7) {
      score += count * 2;
    }
    if (rank === 1 || rank === 9) {
      score -= count;
    }
  }

  return score;
}

function deriveBattleProfile(game, playerSeat, baseProgress) {
  const opponentSeat = getOpponentSeat(playerSeat);
  const opponent = game && Array.isArray(game.players) ? game.players[opponentSeat] : null;
  const openMelds = opponent && Array.isArray(opponent.melds) ? opponent.melds.filter((meld) => !meld.concealed).length : 0;
  const opponentDiscardCount = opponent && Array.isArray(opponent.discards) ? opponent.discards.length : 0;

  let attackWeight = 1;
  let defenseWeight = 0.9;

  if (baseProgress.shanten <= 1) {
    attackWeight += 0.45;
    defenseWeight -= 0.15;
  } else if (baseProgress.shanten >= 4) {
    attackWeight -= 0.12;
    defenseWeight += 0.2;
  }

  if (openMelds >= 1) {
    defenseWeight += 0.2 + openMelds * 0.1;
  }

  if (opponentDiscardCount >= 8) {
    defenseWeight += 0.08;
  }

  if (normalizeScoringEnabled(game && game.scoringEnabled) && Array.isArray(game && game.scores)) {
    const myScore = Number(game.scores[playerSeat]) || 0;
    const opponentScore = Number(game.scores[opponentSeat]) || 0;
    const scoreGap = myScore - opponentScore;

    if (scoreGap <= -160) {
      attackWeight += 0.2;
      defenseWeight -= 0.08;
    } else if (scoreGap <= -80) {
      attackWeight += 0.12;
      defenseWeight -= 0.04;
    } else if (scoreGap >= 160) {
      attackWeight -= 0.08;
      defenseWeight += 0.18;
    } else if (scoreGap >= 80) {
      attackWeight -= 0.04;
      defenseWeight += 0.1;
    }
  }

  const suitPressure = evaluateSuitPressure(opponent);
  return {
    attackWeight,
    defenseWeight,
    suitPressure,
    opponentOpenMelds: openMelds,
  };
}

function evaluateSuitPressure(opponent) {
  const suitPressure = { m: 0, p: 0, s: 0, z: 0 };
  if (!opponent) {
    return suitPressure;
  }

  for (const meld of opponent.melds || []) {
    for (const tileId of meld.tiles || []) {
      const tileType = getTileType(tileId);
      suitPressure[getTileSuit(tileType)] += meld.concealed ? 0.3 : 1;
    }
  }

  for (const discard of opponent.discards || []) {
    const tileType = getTileType(discard.tileId || discard);
    suitPressure[getTileSuit(tileType)] -= 0.4;
  }

  return suitPressure;
}

function evaluateDiscardRisk(game, playerSeat, tileId, battleProfile, analysisCache) {
  const tileType = getTileType(tileId);
  const cacheKey = `${playerSeat}|${tileType}|${serializeSuitPressure(battleProfile.suitPressure)}`;
  if (analysisCache.riskCache.has(cacheKey)) {
    return analysisCache.riskCache.get(cacheKey);
  }

  const opponentSeat = getOpponentSeat(playerSeat);
  const opponent = game && Array.isArray(game.players) ? game.players[opponentSeat] : null;
  const visibleCounts = buildVisibleCounts(game, playerSeat, [], [], analysisCache);
  const visibleCount = visibleCounts[tileType] || 0;
  const opponentDiscardTypes = new Set(
    (opponent && Array.isArray(opponent.discards) ? opponent.discards : []).map((discard) => getTileType(discard.tileId || discard)),
  );

  let risk = 14;

  if (opponentDiscardTypes.has(tileType)) {
    risk = 0;
  } else if (isHonorTile(tileType)) {
    risk = 24 - visibleCount * 5;
    if ((battleProfile.suitPressure.z || 0) > 0) {
      risk += 4;
    }
  } else {
    const suit = getTileSuit(tileType);
    const rank = getTileRank(tileType);
    risk = rank >= 3 && rank <= 7 ? 18 : 15;
    risk += (battleProfile.suitPressure[suit] || 0) * 4;
    risk += visibleCount <= 1 ? 5 : visibleCount >= 3 ? -4 : 0;

    const opponentDiscards = opponent && Array.isArray(opponent.discards) ? opponent.discards : [];
    const sameSuitDiscards = opponentDiscards.filter((discard) => getTileSuit(getTileType(discard.tileId || discard)) === suit).length;
    if (sameSuitDiscards <= 1) {
      risk += 4;
    }

    const openMelds = opponent && Array.isArray(opponent.melds) ? opponent.melds.filter((meld) => !meld.concealed) : [];
    for (const meld of openMelds) {
      const meldSuit = getTileSuit(meld.tileType || getTileType(meld.tiles && meld.tiles[0] ? meld.tiles[0] : ""));
      if (meldSuit !== suit) {
        continue;
      }
      const meldRank = isSuitTile(meld.tileType) ? getTileRank(meld.tileType) : null;
      if (meldRank && Math.abs(meldRank - rank) <= 2) {
        risk += 6;
      }
    }
  }

  risk = Math.max(0, risk);
  analysisCache.riskCache.set(cacheKey, risk);
  return risk;
}

function serializeSuitPressure(suitPressure) {
  return ["m", "p", "s", "z"].map((suit) => Number(suitPressure[suit] || 0).toFixed(2)).join(",");
}

function evaluateFutureDrawPotential(
  game,
  playerSeat,
  handTileIds,
  lockedMelds,
  extraVisibleTileTypes,
  baseProgress,
  analysisCache,
) {
  const availability = buildAvailabilityMap(game, playerSeat, handTileIds, extraVisibleTileTypes, analysisCache);
  const totalAvailable = Object.values(availability).reduce((sum, count) => sum + count, 0);

  if (!totalAvailable) {
    return {
      expectedImprovement: -24,
      effectiveTileCount: 0,
      improvementTypeCount: 0,
      bestDrawType: null,
      bestImprovement: -24,
    };
  }

  let weightedImprovement = 0;
  let effectiveTileCount = 0;
  let improvementTypeCount = 0;
  let bestDrawType = null;
  let bestImprovement = -Infinity;

  for (const [tileType, availableCount] of Object.entries(availability)) {
    if (availableCount <= 0) {
      continue;
    }

    const progress = evaluateHandProgress([...handTileIds, tileType], lockedMelds, analysisCache.progressCache);
    const improvement = (baseProgress.shanten - progress.shanten) * 240 + (progress.score - baseProgress.score);
    weightedImprovement += improvement * availableCount;

    if (improvement > 0) {
      effectiveTileCount += availableCount;
      improvementTypeCount += 1;
    }

    if (improvement > bestImprovement) {
      bestImprovement = improvement;
      bestDrawType = tileType;
    }
  }

  return {
    expectedImprovement: weightedImprovement / totalAvailable,
    effectiveTileCount,
    improvementTypeCount,
    bestDrawType,
    bestImprovement,
  };
}

function buildAvailabilityMap(game, playerSeat, handTileIds, extraVisibleTileTypes = [], analysisCache = null) {
  const ruleset = getRuleset((game && game.rulesetId) || undefined);
  const visibleCounts = buildVisibleCounts(game, playerSeat, handTileIds, extraVisibleTileTypes, analysisCache);
  const visibleKey = ALL_TILE_TYPES.map((tileType) => visibleCounts[tileType] || 0).join(",");
  const cacheKey = `${playerSeat}|${visibleKey}`;
  if (analysisCache && analysisCache.availabilityCache.has(cacheKey)) {
    return analysisCache.availabilityCache.get(cacheKey);
  }
  const availability = {};
  for (const tileType of ruleset.tileTypes) {
    availability[tileType] = Math.max(0, 4 - (visibleCounts[tileType] || 0));
  }
  if (analysisCache) {
    analysisCache.availabilityCache.set(cacheKey, availability);
  }
  return availability;
}

function buildVisibleCounts(game, playerSeat, handTileIds = [], extraVisibleTileTypes = [], analysisCache = null) {
  const handCounts = countTileTypes(handTileIds || []);
  const handKey = ALL_TILE_TYPES.map((tileType) => handCounts[tileType] || 0).join(",");
  const extraKey = [...(extraVisibleTileTypes || [])].map(getTileType).sort().join(",");
  const round = game && typeof game.roundNumber === "number" ? game.roundNumber : 0;
  const latestDiscardId = game && game.latestDiscard ? game.latestDiscard.id : 0;
  const cacheKey = `${round}|${latestDiscardId}|${playerSeat}|${handKey}|${extraKey}`;
  if (analysisCache && analysisCache.visibleCountsCache.has(cacheKey)) {
    return analysisCache.visibleCountsCache.get(cacheKey);
  }

  const visibleCounts = {};

  for (const player of game && Array.isArray(game.players) ? game.players : []) {
    for (const discard of player.discards || []) {
      incrementTileTypeCount(visibleCounts, getTileType(discard.tileId || discard));
    }
    for (const meld of player.melds || []) {
      for (const tileId of meld.tiles || []) {
        incrementTileTypeCount(visibleCounts, getTileType(tileId));
      }
    }
  }

  for (const tileId of handTileIds || []) {
    incrementTileTypeCount(visibleCounts, getTileType(tileId));
  }

  for (const tileType of extraVisibleTileTypes || []) {
    incrementTileTypeCount(visibleCounts, tileType);
  }

  if (analysisCache) {
    analysisCache.visibleCountsCache.set(cacheKey, visibleCounts);
  }
  return visibleCounts;
}

function getPlayerMelds(game, playerSeat) {
  const player = game && Array.isArray(game.players) ? game.players[playerSeat] : null;
  return player && Array.isArray(player.melds) ? player.melds : [];
}

function incrementTileTypeCount(counts, tileType) {
  if (!tileType) {
    return;
  }
  counts[tileType] = (counts[tileType] || 0) + 1;
}

function createAdvancedHandCacheKey(game, playerSeat, handTileIds, lockedMelds, extraVisibleTileTypes, profile) {
  const counts = countTileTypes(handTileIds || []);
  const countKey = ALL_TILE_TYPES.map((tileType) => counts[tileType] || 0).join(",");
  const extraKey = [...(extraVisibleTileTypes || [])].map(getTileType).sort().join(",");
  const round = game && typeof game.roundNumber === "number" ? game.roundNumber : 0;
  const latestDiscardId = game && game.latestDiscard ? game.latestDiscard.id : 0;
  const scoringKey = isScoringStrategyEnabled(game, profile) ? getScoringProfileId(profile) : "plain";
  return `${round}|${latestDiscardId}|${playerSeat}|${lockedMelds}|${countKey}|${extraKey}|${scoringKey}`;
}

function createLookaheadCacheKey(game, playerSeat, handTileIds, lockedMelds, profile) {
  const counts = countTileTypes(handTileIds || []);
  const countKey = ALL_TILE_TYPES.map((tileType) => counts[tileType] || 0).join(",");
  const round = game && typeof game.roundNumber === "number" ? game.roundNumber : 0;
  const latestDiscardId = game && game.latestDiscard ? game.latestDiscard.id : 0;
  const scoringKey = isScoringStrategyEnabled(game, profile) ? getScoringProfileId(profile) : "plain";
  return `${round}|${latestDiscardId}|${playerSeat}|${lockedMelds}|${countKey}|${scoringKey}`;
}

export { evaluateAdvancedHand, deriveBattleProfile, evaluateDiscardRisk, buildAvailabilityMap, createLookaheadCacheKey };
