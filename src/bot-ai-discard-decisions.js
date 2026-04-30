import { countTileTypes, getTileLabel, getTileType } from "./rules.js";
import {
  DEFAULT_LOOKAHEAD_CANDIDATE_LIMIT,
  SOLO_DIFFICULTY_LABELS,
} from "./bot-ai-profile.js";
import {
  deriveBattleProfile,
  evaluateAdvancedHand,
  evaluateDiscardRisk,
} from "./bot-ai-advanced-evaluator.js";
import { evaluateActionEV } from "./bot-ai-action-helpers.js";
import {
  createAnalysisCache,
  evaluateHandProgress,
  getCandidateDiscardTileIds,
  removeTileIdsFromHand,
  scoreDiscardTile,
} from "./bot-ai-hand-progress.js";
import {
  evaluateLookaheadPotential,
  shouldRunLookahead,
} from "./bot-ai-lookahead.js";

function chooseDiscardDecision(game, playerSeat, player, profile) {
  if (profile.advanced) {
    return chooseAdvancedDiscardDecision(game, playerSeat, player, profile);
  }

  if (profile.structured) {
    return chooseStructuredDiscardDecision(player);
  }

  const tileId = chooseSimpleDiscardTile(Array.isArray(player && player.hand) ? [...player.hand] : []);
  return {
    tileId,
    debugSummary: `簡單模式：優先丟孤張、字牌與邊張，選擇 ${getTileLabel(tileId)}。`,
  };
}

function chooseSimpleDiscardTile(handTileIds) {
  const tileIds = Array.isArray(handTileIds) ? [...handTileIds] : [];
  const counts = countTileTypes(tileIds);

  let bestTileId = tileIds[0] || "";
  let bestScore = -Infinity;

  for (const tileId of tileIds) {
    const score = scoreDiscardTile(tileId, counts);
    if (score > bestScore || (score === bestScore && tileId.localeCompare(bestTileId) > 0)) {
      bestTileId = tileId;
      bestScore = score;
    }
  }

  return bestTileId;
}

function chooseStructuredDiscardDecision(player) {
  const tileIds = Array.isArray(player && player.hand) ? [...player.hand] : [];
  const counts = countTileTypes(tileIds);
  const lockedMelds = Array.isArray(player && player.melds) ? player.melds.length : 0;

  let bestTileId = tileIds[0] || "";
  let bestProgress = null;
  let bestTieScore = -Infinity;

  for (const tileId of tileIds) {
    const remainingHand = removeTileIdsFromHand(tileIds, [tileId]);
    const progress = evaluateHandProgress(remainingHand, lockedMelds);
    const discardBias = scoreDiscardTile(tileId, counts);
    const tieScore = progress.score + discardBias;

    if (!bestProgress) {
      bestTileId = tileId;
      bestProgress = progress;
      bestTieScore = tieScore;
      continue;
    }

    if (progress.shanten < bestProgress.shanten) {
      bestTileId = tileId;
      bestProgress = progress;
      bestTieScore = tieScore;
      continue;
    }

    if (progress.shanten > bestProgress.shanten) {
      continue;
    }

    if (progress.score > bestProgress.score) {
      bestTileId = tileId;
      bestProgress = progress;
      bestTieScore = tieScore;
      continue;
    }

    if (progress.score < bestProgress.score) {
      continue;
    }

    if (tieScore > bestTieScore || (tieScore === bestTieScore && tileId.localeCompare(bestTileId) > 0)) {
      bestTileId = tileId;
      bestProgress = progress;
      bestTieScore = tieScore;
    }
  }

  return {
    tileId: bestTileId,
    debugSummary: `普通模式：優先維持搭子、對子與向聽進展，選擇 ${getTileLabel(bestTileId)}。`,
  };
}

function chooseAdvancedDiscardDecision(game, playerSeat, player, profile) {
  const tileIds = Array.isArray(player && player.hand) ? [...player.hand] : [];
  const counts = countTileTypes(tileIds);
  const lockedMelds = Array.isArray(player && player.melds) ? player.melds.length : 0;
  const analysisCache = createAnalysisCache();
  const baseline = evaluateAdvancedHand(game, playerSeat, tileIds, lockedMelds, [], analysisCache, profile);
  const battleProfile = deriveBattleProfile(game, playerSeat, baseline);

  const candidates = evaluateDiscardCandidates({
    game,
    playerSeat,
    tileIds,
    counts,
    lockedMelds,
    baseline,
    battleProfile,
    profile,
    analysisCache,
  });
  const bestCandidate = candidates[0];

  return {
    tileId: bestCandidate.tileId,
    debugSummary: buildDiscardDecisionSummary(profile, battleProfile, candidates),
  };
}

function evaluateDiscardCandidates({
  game,
  playerSeat,
  tileIds,
  counts,
  lockedMelds,
  baseline,
  battleProfile,
  profile,
  analysisCache,
}) {
  const candidates = getCandidateDiscardTileIds(tileIds).map((tileId) => {
    const remainingHand = removeTileIdsFromHand(tileIds, [tileId]);
    const progress = evaluateAdvancedHand(
      game,
      playerSeat,
      remainingHand,
      lockedMelds,
      [getTileType(tileId)],
      analysisCache,
      profile,
    );
    const discardRisk = evaluateDiscardRisk(game, playerSeat, tileId, battleProfile, analysisCache);
    const discardBias = scoreDiscardTile(tileId, counts);
    const actionValue = evaluateActionEV({
      baseline,
      progress,
      battleProfile,
      actionBonus: 0,
      discardRisk,
      discardBias,
      exposureDelta: 0,
      lookaheadBonus: 0,
      profile,
    });

    return {
      tileId,
      progress,
      discardRisk,
      discardBias,
      actionValue,
      lookaheadBonus: 0,
      totalScore: actionValue,
    };
  });

  sortDiscardCandidates(candidates);

  if (profile.lookahead && shouldRunLookahead(baseline, candidates, profile)) {
    const candidateLimit = profile.lookaheadCandidateLimit || DEFAULT_LOOKAHEAD_CANDIDATE_LIMIT;
    for (const candidate of candidates.slice(0, candidateLimit)) {
      candidate.lookaheadBonus = evaluateLookaheadPotential({
        game,
        playerSeat,
        handTileIds: removeTileIdsFromHand(tileIds, [candidate.tileId]),
        lockedMelds,
        battleProfile,
        analysisCache,
        profile,
      });
      candidate.totalScore += candidate.lookaheadBonus;
    }
    sortDiscardCandidates(candidates);
  }

  return candidates;
}

function sortDiscardCandidates(candidates) {
  candidates.sort((left, right) => {
    if (left.progress.shanten !== right.progress.shanten) {
      return left.progress.shanten - right.progress.shanten;
    }
    if (right.totalScore !== left.totalScore) {
      return right.totalScore - left.totalScore;
    }
    if (left.discardRisk !== right.discardRisk) {
      return left.discardRisk - right.discardRisk;
    }
    return left.tileId.localeCompare(right.tileId);
  });
}

function buildDiscardDecisionSummary(profile, battleProfile, candidates) {
  const topCandidates = candidates.slice(0, 3).map((candidate) => {
    const parts = [
      `${getTileLabel(candidate.tileId)}`,
      `向聽 ${candidate.progress.shanten}`,
      `進張 ${candidate.progress.effectiveTileCount}`,
      `風險 ${candidate.discardRisk.toFixed(1)}`,
      `總分 ${candidate.totalScore.toFixed(1)}`,
    ];
    if (candidate.lookaheadBonus) {
      parts.push(`預測 ${candidate.lookaheadBonus.toFixed(1)}`);
    }
    return parts.join(" / ");
  });

  return [
    `${SOLO_DIFFICULTY_LABELS[profile.id]}模式：攻擊權重 ${battleProfile.attackWeight.toFixed(2)}，防守權重 ${battleProfile.defenseWeight.toFixed(2)}。`,
    `候選前三：${topCandidates.join("；")}`,
    `最終選擇 ${getTileLabel(candidates[0].tileId)}。`,
  ].join(" ");
}

export { chooseDiscardDecision };
