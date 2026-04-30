import { countTileTypes, getTileType } from "./rules.js";
import {
  DEFAULT_LOOKAHEAD_DRAW_LIMIT,
  isScoringStrategyEnabled,
} from "./bot-ai-profile.js";
import {
  evaluateHandProgress,
  getCandidateDiscardTileIds,
  removeTileIdsFromHand,
  scoreDiscardTile,
} from "./bot-ai-hand-progress.js";
import {
  buildAvailabilityMap,
  createLookaheadCacheKey,
  evaluateAdvancedHand,
} from "./bot-ai-advanced-evaluator.js";

function evaluateLookaheadPotential({ game, playerSeat, handTileIds, lockedMelds, battleProfile, analysisCache, profile }) {
  const cacheKey = createLookaheadCacheKey(game, playerSeat, handTileIds, lockedMelds, profile);
  if (analysisCache.lookaheadCache.has(cacheKey)) {
    return analysisCache.lookaheadCache.get(cacheKey);
  }

  const availability = buildAvailabilityMap(game, playerSeat, handTileIds, [], analysisCache);
  const useScoringStrategy = isScoringStrategyEnabled(game, profile);
  const baseline = useScoringStrategy
    ? evaluateAdvancedHand(game, playerSeat, handTileIds, lockedMelds, [], analysisCache, profile)
    : evaluateHandProgress(handTileIds, lockedMelds, analysisCache.progressCache);
  const drawLimit = profile.lookaheadDrawLimit || DEFAULT_LOOKAHEAD_DRAW_LIMIT;

  const baselineScore = baseline.totalScore || baseline.score;
  const screenedDraws = Object.entries(availability)
    .filter(([, count]) => count > 0)
    .map(([tileType, count]) => {
      const quickProgress = evaluateHandProgress([...handTileIds, tileType], lockedMelds, analysisCache.progressCache);
      const quickGain = (baseline.shanten - quickProgress.shanten) * 220 + (quickProgress.score - (baseline.score || 0));
      return {
        tileType,
        count,
        quickGain,
        quickScore: quickGain + count * 4,
      };
    })
    .sort((left, right) => {
      if (right.quickScore !== left.quickScore) {
        return right.quickScore - left.quickScore;
      }
      return right.count - left.count;
    })
    .slice(0, Math.max(drawLimit * 2 + 1, 5));

  const drawCandidates = screenedDraws
    .map(({ tileType, count }) => {
      const drawnTileId = `${tileType}-future`;
      const drawnHand = [...handTileIds, drawnTileId];
      const drawProgress = useScoringStrategy
        ? evaluateAdvancedHand(game, playerSeat, drawnHand, lockedMelds, [], analysisCache, profile)
        : evaluateHandProgress(drawnHand, lockedMelds, analysisCache.progressCache);
      const followUp = chooseBestLookaheadDiscard({
        game,
        playerSeat,
        tileIds: drawnHand,
        lockedMelds,
        analysisCache,
        profile,
      });
      const immediateGain = (baseline.shanten - drawProgress.shanten) * 180 + ((drawProgress.totalScore || drawProgress.score) - baselineScore);
      const followUpGain = followUp.totalScore - baselineScore;

      return {
        tileType,
        count,
        followUpValue: immediateGain * 0.55 + followUpGain,
      };
    })
    .sort((left, right) => {
      if (right.followUpValue !== left.followUpValue) {
        return right.followUpValue - left.followUpValue;
      }
      return right.count - left.count;
    })
    .slice(0, drawLimit);

  const totalWeight = drawCandidates.reduce((sum, candidate) => sum + candidate.count, 0);
  if (!totalWeight) {
    analysisCache.lookaheadCache.set(cacheKey, 0);
    return 0;
  }

  const weightedValue = drawCandidates.reduce(
    (sum, candidate) => sum + candidate.followUpValue * candidate.count,
    0,
  );
  const lookaheadValue = Math.max(0, weightedValue / totalWeight);
  analysisCache.lookaheadCache.set(cacheKey, lookaheadValue);
  return lookaheadValue;
}

function shouldRunLookahead(baseline, candidates, profile) {
  if (!candidates.length) {
    return false;
  }

  const guaranteedShanten = profile.guaranteedLookaheadShanten || 0;
  const maxShanten = profile.lookaheadMaxShanten || guaranteedShanten;
  const activationGap = profile.lookaheadActivationGap || 0;

  if (baseline.shanten <= guaranteedShanten) {
    return true;
  }

  if (candidates.length === 1) {
    return false;
  }

  return baseline.shanten <= maxShanten && Math.abs(candidates[0].totalScore - candidates[1].totalScore) <= activationGap;
}

function chooseBestLookaheadDiscard({ game, playerSeat, tileIds, lockedMelds, analysisCache, profile }) {
  const counts = countTileTypes(tileIds);
  const useScoringStrategy = isScoringStrategyEnabled(game, profile);
  const allCandidateTileIds = getCandidateDiscardTileIds(tileIds);
  const shortlistTileIds = useScoringStrategy
    ? allCandidateTileIds
        .map((tileId) => {
          const remainingHand = removeTileIdsFromHand(tileIds, [tileId]);
          const quickProgress = evaluateHandProgress(remainingHand, lockedMelds, analysisCache.progressCache);
          const discardBias = scoreDiscardTile(tileId, counts);
          return {
            tileId,
            quickProgress,
            quickScore: quickProgress.score + discardBias * 2 - quickProgress.shanten * 40,
          };
        })
        .sort((left, right) => {
          if (left.quickProgress.shanten !== right.quickProgress.shanten) {
            return left.quickProgress.shanten - right.quickProgress.shanten;
          }
          return right.quickScore - left.quickScore;
        })
        .slice(0, 5)
        .map((candidate) => candidate.tileId)
    : allCandidateTileIds;
  const candidates = shortlistTileIds.map((tileId) => {
    const remainingHand = removeTileIdsFromHand(tileIds, [tileId]);
    const progress = useScoringStrategy
      ? evaluateAdvancedHand(game, playerSeat, remainingHand, lockedMelds, [getTileType(tileId)], analysisCache, profile)
      : evaluateHandProgress(remainingHand, lockedMelds, analysisCache.progressCache);
    const discardBias = scoreDiscardTile(tileId, counts);
    const totalScore = (progress.totalScore || progress.score) + discardBias * 2;

    return {
      tileId,
      progress,
      totalScore,
    };
  });

  candidates.sort((left, right) => {
    if (left.progress.shanten !== right.progress.shanten) {
      return left.progress.shanten - right.progress.shanten;
    }
    if (right.totalScore !== left.totalScore) {
      return right.totalScore - left.totalScore;
    }
    return left.tileId.localeCompare(right.tileId);
  });
  return candidates[0];
}

export { evaluateLookaheadPotential, shouldRunLookahead };
