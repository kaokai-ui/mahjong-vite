import { getTileLabel, getTileType } from "./rules.js";
import { scoreFromTai } from "./scoring.js";
import { DIFFICULTY_PROFILES, SOLO_DIFFICULTY_LABELS } from "./bot-ai-profile.js";
import {
  evaluateHandProgress,
  removeTileIdsFromHand,
} from "./bot-ai-hand-progress.js";
import {
  evaluateAdvancedHand,
  evaluateDiscardRisk,
} from "./bot-ai-advanced-evaluator.js";
import { evaluateLookaheadPotential } from "./bot-ai-lookahead.js";

function createClaimCandidate({ player, usedTileIds, lockedMeldsAfter, baseline, option, infoMessage, resultMessage, actionBonus }) {
  const remainingHand = removeTileIdsFromHand(player.hand || [], usedTileIds);
  const progress = evaluateHandProgress(remainingHand, lockedMeldsAfter);
  return {
    option,
    progress,
    infoMessage,
    resultMessage,
    actionValue: scoreActionOutcome(baseline, progress, actionBonus),
  };
}

function createAdvancedActionCandidate({
  game,
  playerSeat,
  baseline,
  battleProfile,
  remainingHand,
  lockedMeldsAfter,
  option,
  infoMessage,
  resultMessage,
  actionBonus,
  extraVisibleTileTypes,
  analysisCache,
  profile,
  actionName,
  exposureDelta,
  payload,
}) {
  const progress = evaluateAdvancedHand(
    game,
    playerSeat,
    remainingHand,
    lockedMeldsAfter,
    extraVisibleTileTypes,
    analysisCache,
    profile,
  );
  const lookaheadBonus = profile.lookahead && shouldRunActionLookahead(baseline, progress, profile)
    ? evaluateLookaheadPotential({
        game,
        playerSeat,
        handTileIds: remainingHand,
        lockedMelds: lockedMeldsAfter,
        battleProfile,
        analysisCache,
        profile,
      })
    : 0;
  const actionValue = evaluateActionEV({
    baseline,
    progress,
    battleProfile,
      actionBonus,
      discardRisk: 0,
      discardBias: 0,
      exposureDelta,
      lookaheadBonus,
      profile,
    });

  return {
    option,
    payload,
    progress,
    infoMessage,
    resultMessage,
    actionName,
    actionValue,
    lookaheadBonus,
    exposureDelta,
    debugSummary: buildActionDecisionSummary({
      modeLabel: SOLO_DIFFICULTY_LABELS[profile.id],
      actionName,
      progress,
      battleProfile,
      actionValue,
      lookaheadBonus,
    }),
  };
}

function shouldRunActionLookahead(baseline, progress, profile) {
  const guaranteedShanten = profile.guaranteedLookaheadShanten || 0;
  if (progress.shanten <= guaranteedShanten) {
    return true;
  }

  return baseline.shanten <= 1 && progress.shanten <= baseline.shanten;
}

function pickBestActionCandidate(candidates) {
  return candidates.reduce((best, candidate) => {
    if (!candidate) {
      return best;
    }
    if (!best) {
      return candidate;
    }
    if (candidate.progress.shanten < best.progress.shanten) {
      return candidate;
    }
    if (candidate.progress.shanten > best.progress.shanten) {
      return best;
    }
    if (candidate.actionValue > best.actionValue) {
      return candidate;
    }
    if (candidate.actionValue < best.actionValue) {
      return best;
    }
    return candidate.progress.totalScore > best.progress.totalScore ? candidate : best;
  }, null);
}

function shouldTakeStructuredAction(baseline, progress, actionValue) {
  if (progress.shanten < baseline.shanten) {
    return true;
  }

  if (progress.shanten > baseline.shanten) {
    return false;
  }

  return actionValue >= 12;
}

function shouldTakeAdvancedAction(baseline, candidate, battleProfile, profile) {
  const progress = candidate.progress;
  const threshold = profile.actionThreshold + battleProfile.defenseWeight * 2;
  const scoringMode = Boolean(baseline.scoringPotential || progress.scoringPotential);
  const baselineProjectedTai = baseline.scoringPotential ? baseline.scoringPotential.projectedTai : 0;
  const progressProjectedTai = progress.scoringPotential ? progress.scoringPotential.projectedTai : 0;

  if (progress.shanten < baseline.shanten) {
    return true;
  }

  if (progress.shanten > baseline.shanten && candidate.lookaheadBonus < 24) {
    return false;
  }

  if (scoringMode && progress.shanten === baseline.shanten) {
    const taiLossTolerance = profile.id === "god" ? 0.45 : 1.75;
    const openTaiLossTolerance = profile.id === "god" ? 0.25 : 1.25;
    if (progressProjectedTai + taiLossTolerance < baselineProjectedTai && candidate.lookaheadBonus < 18) {
      return false;
    }
    if (candidate.exposureDelta > 0 && progressProjectedTai + openTaiLossTolerance < baselineProjectedTai && candidate.lookaheadBonus < 24) {
      return false;
    }
  }

  if (progress.effectiveTileCount >= baseline.effectiveTileCount + 3) {
    return true;
  }

  if (candidate.lookaheadBonus >= 28) {
    return true;
  }

  return candidate.actionValue >= threshold;
}

function scoreActionOutcome(baseline, progress, actionBonus = 0) {
  return (baseline.shanten - progress.shanten) * 220 + (progress.score - baseline.score) + actionBonus;
}

function evaluateActionEV({
  baseline,
  progress,
  battleProfile,
  actionBonus = 0,
  discardRisk = 0,
  discardBias = 0,
  exposureDelta = 0,
  lookaheadBonus = 0,
  profile = DIFFICULTY_PROFILES.hard,
}) {
  const attackFactor = profile.attackFactor || 1;
  const riskMultiplier = profile.riskMultiplier || 1;
  const lookaheadWeight = profile.lookaheadWeight || 0;
  const scoreGapWeight = profile.scoreGapWeight || 0;
  const progressDelta = progress.totalScore - baseline.totalScore;
  const scoringDelta = (progress.scoringScore || 0) - (baseline.scoringScore || 0);
  const baselineProjectedTai = baseline.scoringPotential ? baseline.scoringPotential.projectedTai : 0;
  const progressProjectedTai = progress.scoringPotential ? progress.scoringPotential.projectedTai : 0;
  const taiDelta = progressProjectedTai - baselineProjectedTai;
  const baselineProjectedScore = baseline.scoringPotential ? scoreFromTai(baseline.scoringPotential.roundedProjectedTai) : 0;
  const progressProjectedScore = progress.scoringPotential ? scoreFromTai(progress.scoringPotential.roundedProjectedTai) : 0;
  const projectedScoreDelta = progressProjectedScore - baselineProjectedScore;
  const scoringMode = Boolean(baseline.scoringPotential || progress.scoringPotential);
  const exposurePenaltyScale = scoringMode
    ? profile.exposurePenaltyScale || 24
    : 18;
  const taiWeight = scoringMode ? profile.taiWeight ?? 22 : 0;
  const projectedScoreWeight = scoringMode ? profile.projectedScoreWeight ?? 0.22 : 0;

  return (
    progressDelta * attackFactor +
    scoringDelta * scoreGapWeight * battleProfile.attackWeight +
    taiDelta * taiWeight * battleProfile.attackWeight +
    projectedScoreDelta * projectedScoreWeight * battleProfile.attackWeight +
    actionBonus +
    discardBias * 2 -
    discardRisk * battleProfile.defenseWeight * riskMultiplier -
    exposureDelta * exposurePenaltyScale * battleProfile.defenseWeight * riskMultiplier +
    lookaheadBonus * lookaheadWeight
  );
}

function buildActionDecisionSummary({ modeLabel, actionName, progress, battleProfile, actionValue, lookaheadBonus }) {
  const parts = [
    `${modeLabel}模式評估${actionName}`,
    `向聽 ${progress.shanten}`,
    `進張 ${progress.effectiveTileCount}`,
    `總分 ${actionValue.toFixed(1)}`,
    `攻擊 ${battleProfile.attackWeight.toFixed(2)}`,
    `防守 ${battleProfile.defenseWeight.toFixed(2)}`,
  ];
  if (lookaheadBonus) {
    parts.push(`預測 ${lookaheadBonus.toFixed(1)}`);
  }
  return parts.join(" / ");
}

function buildPassDecisionSummary({ modeLabel, reason }) {
  return `${modeLabel}模式選擇過牌：${reason}`;
}

export {
  createClaimCandidate,
  createAdvancedActionCandidate,
  pickBestActionCandidate,
  shouldTakeStructuredAction,
  shouldTakeAdvancedAction,
  scoreActionOutcome,
  evaluateActionEV,
  buildPassDecisionSummary,
};
