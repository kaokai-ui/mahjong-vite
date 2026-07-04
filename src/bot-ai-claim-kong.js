import {
  countTileTypes,
  getTileLabel,
  getTileRank,
  getTileSuit,
  getTileType,
  isHonorTile,
} from "./rules.js";
import {
  SOLO_DIFFICULTY_LABELS,
} from "./bot-ai-profile.js";
import {
  buildPassDecisionSummary,
  createAdvancedActionCandidate,
  createClaimCandidate,
  pickBestActionCandidate,
  scoreActionOutcome,
  shouldTakeAdvancedAction,
  shouldTakeStructuredAction,
} from "./bot-ai-action-helpers.js";
import {
  deriveBattleProfile,
  evaluateAdvancedHand,
} from "./bot-ai-advanced-evaluator.js";
import {
  createAnalysisCache,
  evaluateHandProgress,
  getTilesForNeededTypes,
  getTilesOfTypeFromHand,
  removeTileIdsFromHand,
} from "./bot-ai-hand-progress.js";

function decideClaimAction(game, playerSeat, clientState, profile) {
  const options = Array.isArray(clientState.claimOptions) ? clientState.claimOptions : [];
  const pendingClaim = clientState.pendingClaim || null;
  if (!options.length || !pendingClaim) {
    return null;
  }

  const winningOption = options.find((option) => option.type === "claimWin");
  if (winningOption) {
    return {
      type: "claimWin",
      delayMs: getBotDelay(),
      infoMessage: "電腦正在判斷胡牌...",
      resultMessage: pendingClaim.kind === "robKong" ? "電腦搶槓胡。" : "電腦胡牌。",
    };
  }

  if (profile.advanced) {
    return decideAdvancedClaimAction(game, playerSeat, clientState, options, pendingClaim, profile);
  }

  if (profile.structured) {
    return decideStructuredClaimAction(game, playerSeat, clientState, options, pendingClaim);
  }

  return decideEasyClaimAction(game, playerSeat, options, pendingClaim, profile);
}

function decideKongAction(game, playerSeat, player, clientState, profile) {
  if (profile.advanced) {
    return decideAdvancedKongAction(game, playerSeat, player, clientState, profile);
  }

  if (profile.structured) {
    return decideStructuredKongAction(player, clientState);
  }

  return decideEasyKongAction(player, clientState, profile);
}

function decideEasyClaimAction(game, playerSeat, options, pendingClaim, profile) {
  const tileType = getTileType(pendingClaim.tileId || pendingClaim.tileType || "");
  const handCounts = countTileTypes(game.players[playerSeat].hand || []);
  const claimEagerly = isEagerClaimProfile(profile);

  const kongOption = options.find((option) => option.type === "claimDiscardKong");
  if (kongOption && shouldTakeSet(tileType, handCounts, claimEagerly, true)) {
    return {
      type: "claimDiscardKong",
      delayMs: getBotDelay(),
      infoMessage: "電腦正在考慮是否槓牌...",
      resultMessage: `電腦槓了 ${getTileLabel(tileType)}。`,
    };
  }

  const pungOption = options.find((option) => option.type === "claimPung");
  if (pungOption && shouldTakeSet(tileType, handCounts, claimEagerly, false)) {
    return {
      type: "claimPung",
      delayMs: getBotDelay(),
      infoMessage: "電腦正在考慮是否碰牌...",
      resultMessage: `電腦碰了 ${getTileLabel(tileType)}。`,
    };
  }

  const chowOptions = options.filter((option) => option.type === "claimChow");
  const chosenChow = chowOptions.find((option) => shouldTakeChow(option.neededTypes || [], handCounts));
  if (chosenChow) {
    return {
      type: "claimChow",
      payload: { neededTypes: chosenChow.neededTypes },
      delayMs: getBotDelay(),
      infoMessage: "電腦正在考慮是否吃牌...",
      resultMessage: `電腦吃了 ${chosenChow.label.replace(/^吃\s*/, "")}。`,
    };
  }

  return {
    type: "passClaim",
    delayMs: getBotDelay(600, 1100),
    infoMessage: "電腦正在考慮是否過牌...",
    resultMessage: "電腦選擇過牌。",
  };
}

function decideStructuredClaimAction(game, playerSeat, clientState, options, pendingClaim) {
  const player = game && Array.isArray(game.players) ? game.players[playerSeat] : null;
  if (!player) {
    return null;
  }

  const baseline = evaluateHandProgress(player.hand || [], Array.isArray(player.melds) ? player.melds.length : 0);
  const candidates = [];
  const claimTileId = pendingClaim.tileId || pendingClaim.tileType || "";
  const claimTileType = getTileType(claimTileId);

  const kongOption = options.find((option) => option.type === "claimDiscardKong");
  if (kongOption) {
    const usedTileIds = getTilesOfTypeFromHand(player.hand || [], claimTileType, 3);
    if (usedTileIds.length === 3) {
      candidates.push(
        createClaimCandidate({
          player,
          usedTileIds,
          lockedMeldsAfter: (player.melds || []).length + 1,
          baseline,
          option: kongOption,
          infoMessage: "電腦正在考慮是否槓牌...",
          resultMessage: `電腦槓了 ${getTileLabel(claimTileType)}。`,
          actionBonus: 30,
        }),
      );
    }
  }

  const pungOption = options.find((option) => option.type === "claimPung");
  if (pungOption) {
    const usedTileIds = getTilesOfTypeFromHand(player.hand || [], claimTileType, 2);
    if (usedTileIds.length === 2) {
      candidates.push(
        createClaimCandidate({
          player,
          usedTileIds,
          lockedMeldsAfter: (player.melds || []).length + 1,
          baseline,
          option: pungOption,
          infoMessage: "電腦正在考慮是否碰牌...",
          resultMessage: `電腦碰了 ${getTileLabel(claimTileType)}。`,
          actionBonus: isHonorTile(claimTileType) ? 16 : 10,
        }),
      );
    }
  }

  for (const chowOption of options.filter((option) => option.type === "claimChow")) {
    const usedTileIds = getTilesForNeededTypes(player.hand || [], chowOption.neededTypes || []);
    if (usedTileIds.length === 2) {
      candidates.push(
        createClaimCandidate({
          player,
          usedTileIds,
          lockedMeldsAfter: (player.melds || []).length + 1,
          baseline,
          option: chowOption,
          infoMessage: "電腦正在考慮是否吃牌...",
          resultMessage: `電腦吃了 ${chowOption.label.replace(/^吃\s*/, "")}。`,
          actionBonus: 8,
        }),
      );
    }
  }

  const bestCandidate = pickBestActionCandidate(candidates);
  if (bestCandidate && shouldTakeStructuredAction(baseline, bestCandidate.progress, bestCandidate.actionValue)) {
    return {
      type: bestCandidate.option.type,
      payload: bestCandidate.option.neededTypes ? { neededTypes: bestCandidate.option.neededTypes } : undefined,
      delayMs: getBotDelay(),
      infoMessage: bestCandidate.infoMessage,
      resultMessage: bestCandidate.resultMessage,
    };
  }

  return {
    type: "passClaim",
    delayMs: getBotDelay(600, 1100),
    infoMessage: "電腦正在考慮是否過牌...",
    resultMessage: "電腦選擇過牌。",
  };
}

function decideAdvancedClaimAction(game, playerSeat, clientState, options, pendingClaim, profile) {
  const player = game && Array.isArray(game.players) ? game.players[playerSeat] : null;
  if (!player) {
    return null;
  }

  const analysisCache = createAnalysisCache();
  const lockedMelds = Array.isArray(player.melds) ? player.melds.length : 0;
  const baseline = evaluateAdvancedHand(game, playerSeat, player.hand || [], lockedMelds, [], analysisCache, profile);
  const battleProfile = deriveBattleProfile(game, playerSeat, baseline);
  const claimTileId = pendingClaim.tileId || pendingClaim.tileType || "";
  const claimTileType = getTileType(claimTileId);
  const candidates = [];

  const kongOption = options.find((option) => option.type === "claimDiscardKong");
  if (kongOption) {
    const usedTileIds = getTilesOfTypeFromHand(player.hand || [], claimTileType, 3);
    if (usedTileIds.length === 3) {
      candidates.push(
        createAdvancedActionCandidate({
          game,
          playerSeat,
          baseline,
          battleProfile,
          remainingHand: removeTileIdsFromHand(player.hand || [], usedTileIds),
          lockedMeldsAfter: lockedMelds + 1,
          option: kongOption,
          infoMessage: "電腦正在評估是否槓牌...",
          resultMessage: `電腦槓了 ${getTileLabel(claimTileType)}。`,
          actionBonus: 36,
          extraVisibleTileTypes: usedTileIds.map((tileId) => getTileType(tileId)),
          analysisCache,
          profile,
          actionName: "槓牌",
          exposureDelta: 1,
        }),
      );
    }
  }

  const pungOption = options.find((option) => option.type === "claimPung");
  if (pungOption) {
    const usedTileIds = getTilesOfTypeFromHand(player.hand || [], claimTileType, 2);
    if (usedTileIds.length === 2) {
      candidates.push(
        createAdvancedActionCandidate({
          game,
          playerSeat,
          baseline,
          battleProfile,
          remainingHand: removeTileIdsFromHand(player.hand || [], usedTileIds),
          lockedMeldsAfter: lockedMelds + 1,
          option: pungOption,
          infoMessage: "電腦正在評估是否碰牌...",
          resultMessage: `電腦碰了 ${getTileLabel(claimTileType)}。`,
          actionBonus: isHonorTile(claimTileType) ? 20 : 12,
          extraVisibleTileTypes: usedTileIds.map((tileId) => getTileType(tileId)),
          analysisCache,
          profile,
          actionName: "碰牌",
          exposureDelta: 1,
        }),
      );
    }
  }

  for (const chowOption of options.filter((option) => option.type === "claimChow")) {
    const usedTileIds = getTilesForNeededTypes(player.hand || [], chowOption.neededTypes || []);
    if (usedTileIds.length === 2) {
      candidates.push(
        createAdvancedActionCandidate({
          game,
          playerSeat,
          baseline,
          battleProfile,
          remainingHand: removeTileIdsFromHand(player.hand || [], usedTileIds),
          lockedMeldsAfter: lockedMelds + 1,
          option: chowOption,
          infoMessage: "電腦正在評估是否吃牌...",
          resultMessage: `電腦吃了 ${chowOption.label.replace(/^吃\s*/, "")}。`,
          actionBonus: 10,
          extraVisibleTileTypes: usedTileIds.map((tileId) => getTileType(tileId)),
          analysisCache,
          profile,
          actionName: "吃牌",
          exposureDelta: 1,
        }),
      );
    }
  }

  const bestCandidate = pickBestActionCandidate(candidates);
  if (bestCandidate && shouldTakeAdvancedAction(baseline, bestCandidate, battleProfile, profile)) {
    return {
      type: bestCandidate.option.type,
      payload: bestCandidate.option.neededTypes ? { neededTypes: bestCandidate.option.neededTypes } : undefined,
      delayMs: getBotDelay(),
      infoMessage: bestCandidate.infoMessage,
      resultMessage: bestCandidate.resultMessage,
      debugSummary: bestCandidate.debugSummary,
    };
  }

  return {
    type: "passClaim",
    delayMs: getBotDelay(600, 1100),
    infoMessage: "電腦正在評估是否過牌...",
    resultMessage: "電腦選擇過牌。",
    debugSummary: buildPassDecisionSummary({
      modeLabel: SOLO_DIFFICULTY_LABELS[profile.id],
      reason: bestCandidate
        ? `最佳候選 ${bestCandidate.actionName} EV ${bestCandidate.actionValue.toFixed(1)}，未達門檻。`
        : "沒有任何吃碰槓候選可提升牌效。",
    }),
  };
}

function decideEasyKongAction(player, clientState, profile) {
  const claimEagerly = isEagerClaimProfile(profile);
  const concealedKong = (clientState.concealedKongs || []).find((tileType) =>
    shouldDeclareOwnKong(tileType, player.hand || [], claimEagerly),
  );
  if (concealedKong) {
    return {
      type: "concealedKong",
      payload: { tileType: concealedKong },
      delayMs: getBotDelay(),
      infoMessage: "電腦正在考慮是否暗槓...",
      resultMessage: `電腦暗槓 ${getTileLabel(concealedKong)}。`,
    };
  }

  const addedKong = (clientState.addedKongs || []).find((option) =>
    shouldDeclareOwnKong(option.tileType, player.hand || [], claimEagerly),
  );
  if (addedKong) {
    return {
      type: "addedKong",
      payload: {
        meldId: addedKong.meldId,
        tileId: addedKong.tileId,
      },
      delayMs: getBotDelay(),
      infoMessage: "電腦正在考慮是否補槓...",
      resultMessage: `電腦補槓 ${getTileLabel(addedKong.tileType)}。`,
    };
  }

  return null;
}

function decideStructuredKongAction(player, clientState) {
  const handTileIds = player.hand || [];
  const lockedMelds = Array.isArray(player.melds) ? player.melds.length : 0;
  const baseline = evaluateHandProgress(handTileIds, lockedMelds);

  for (const tileType of clientState.concealedKongs || []) {
    const usedTileIds = getTilesOfTypeFromHand(handTileIds, tileType, 4);
    if (usedTileIds.length !== 4) {
      continue;
    }
    const remainingHand = removeTileIdsFromHand(handTileIds, usedTileIds);
    const progress = evaluateHandProgress(remainingHand, lockedMelds + 1);
    const actionValue = scoreActionOutcome(baseline, progress, 22);
    if (shouldTakeStructuredAction(baseline, progress, actionValue)) {
      return {
        type: "concealedKong",
        payload: { tileType },
        delayMs: getBotDelay(),
        infoMessage: "電腦正在考慮是否暗槓...",
        resultMessage: `電腦暗槓 ${getTileLabel(tileType)}。`,
      };
    }
  }

  for (const option of clientState.addedKongs || []) {
    const remainingHand = removeTileIdsFromHand(handTileIds, [option.tileId]);
    const progress = evaluateHandProgress(remainingHand, lockedMelds);
    const actionValue = scoreActionOutcome(baseline, progress, 18);
    if (shouldTakeStructuredAction(baseline, progress, actionValue)) {
      return {
        type: "addedKong",
        payload: {
          meldId: option.meldId,
          tileId: option.tileId,
        },
        delayMs: getBotDelay(),
        infoMessage: "電腦正在考慮是否補槓...",
        resultMessage: `電腦補槓 ${getTileLabel(option.tileType)}。`,
      };
    }
  }

  return null;
}

function decideAdvancedKongAction(game, playerSeat, player, clientState, profile) {
  const handTileIds = player.hand || [];
  const lockedMelds = Array.isArray(player.melds) ? player.melds.length : 0;
  const analysisCache = createAnalysisCache();
  const baseline = evaluateAdvancedHand(game, playerSeat, handTileIds, lockedMelds, [], analysisCache, profile);
  const battleProfile = deriveBattleProfile(game, playerSeat, baseline);

  for (const tileType of clientState.concealedKongs || []) {
    const usedTileIds = getTilesOfTypeFromHand(handTileIds, tileType, 4);
    if (usedTileIds.length !== 4) {
      continue;
    }

    const decision = createAdvancedActionCandidate({
      game,
      playerSeat,
      baseline,
      battleProfile,
      remainingHand: removeTileIdsFromHand(handTileIds, usedTileIds),
      lockedMeldsAfter: lockedMelds + 1,
      option: { type: "concealedKong", tileType },
      infoMessage: "電腦正在評估是否暗槓...",
      resultMessage: `電腦暗槓 ${getTileLabel(tileType)}。`,
      actionBonus: 28,
      extraVisibleTileTypes: usedTileIds.map((tileId) => getTileType(tileId)),
      analysisCache,
      profile,
      actionName: "暗槓",
      exposureDelta: 1,
      payload: { tileType },
    });

    if (shouldTakeAdvancedAction(baseline, decision, battleProfile, profile)) {
      return {
        type: "concealedKong",
        payload: { tileType },
        delayMs: getBotDelay(),
        infoMessage: decision.infoMessage,
        resultMessage: decision.resultMessage,
        debugSummary: decision.debugSummary,
      };
    }
  }

  for (const option of clientState.addedKongs || []) {
    const decision = createAdvancedActionCandidate({
      game,
      playerSeat,
      baseline,
      battleProfile,
      remainingHand: removeTileIdsFromHand(handTileIds, [option.tileId]),
      lockedMeldsAfter: lockedMelds,
      option,
      infoMessage: "電腦正在評估是否補槓...",
      resultMessage: `電腦補槓 ${getTileLabel(option.tileType)}。`,
      actionBonus: 18,
      extraVisibleTileTypes: [option.tileType],
      analysisCache,
      profile,
      actionName: "補槓",
      exposureDelta: 0.45,
      payload: {
        meldId: option.meldId,
        tileId: option.tileId,
      },
    });

    if (shouldTakeAdvancedAction(baseline, decision, battleProfile, profile)) {
      return {
        type: "addedKong",
        payload: {
          meldId: option.meldId,
          tileId: option.tileId,
        },
        delayMs: getBotDelay(),
        infoMessage: decision.infoMessage,
        resultMessage: decision.resultMessage,
        debugSummary: decision.debugSummary,
      };
    }
  }

  return null;
}

function shouldTakeSet(tileType, handCounts, claimEagerly, isKong) {
  if (!tileType) {
    return false;
  }

  if (isHonorTile(tileType)) {
    return true;
  }

  const rank = getTileRank(tileType);
  const suit = getTileSuit(tileType);
  const leftCount = handCounts[`${suit}${rank - 1}`] || 0;
  const rightCount = handCounts[`${suit}${rank + 1}`] || 0;
  const isolated = leftCount === 0 && rightCount === 0;

  if (isKong) {
    return isolated || rank === 1 || rank === 9;
  }

  return isolated || claimEagerly;
}

function shouldTakeChow(neededTypes, handCounts) {
  if (!Array.isArray(neededTypes) || neededTypes.length !== 2) {
    return false;
  }

  return neededTypes.every((tileType) => (handCounts[tileType] || 0) === 1);
}

function shouldDeclareOwnKong(tileType, handTileIds, claimEagerly) {
  const counts = countTileTypes(handTileIds || []);
  if (!tileType || (counts[tileType] || 0) <= 0) {
    return false;
  }

  if (isHonorTile(tileType)) {
    return true;
  }

  if (claimEagerly) {
    return true;
  }

  const rank = getTileRank(tileType);
  return rank === 1 || rank === 9;
}

function isEagerClaimProfile(profile) {
  return Boolean(profile) && profile.id === "easy";
}

function getBotDelay(min = 800, max = 1500) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export { decideClaimAction, decideKongAction };
