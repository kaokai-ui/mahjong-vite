import {
  getTileLabel,
  getTileType,
  getTilesByType,
} from "./rules.js";
import {
  applyDiscardClaimMeld,
  getDiscardResponseClaim,
} from "./game-claim-command-helpers.js";
import { appendLog, failure, getPlayer, seatLabel, success } from "./game-internal-utils.js";
import { drawSupplementTile } from "./game-turn-flow.js";

function handleClaimChow(game, playerSeat, payload = {}) {
  const { claim, error } = getDiscardResponseClaim(game, playerSeat, "chow", "現在不能吃牌。");
  if (error) {
    return error;
  }

  const neededTypes = payload.neededTypes || [];
  const combo = claim.chowCombos.find((candidate) => candidate.key === neededTypes.join("|"));
  if (!combo) {
    return failure("指定的吃牌組合不存在。");
  }

  const player = getPlayer(game, playerSeat);
  const usedTileIds = [];
  for (const tileType of combo.neededTypes) {
    const matches = getTilesByType(player.hand, tileType, 1);
    if (matches.length > 0) {
      usedTileIds.push(matches[0]);
    }
  }

  if (usedTileIds.length !== 2) {
    return failure("手牌不足以完成吃牌。");
  }

  applyDiscardClaimMeld(game, {
    playerSeat,
    claim,
    meldType: "chow",
    meldTileType: combo.sequence[0],
    usedTileIds,
  });
  appendLog(game, `${seatLabel(playerSeat)}吃了 ${combo.label}。`);
  return success(game);
}

function handleClaimPung(game, playerSeat) {
  const { claim, error } = getDiscardResponseClaim(game, playerSeat, "pung", "現在不能碰牌。");
  if (error) {
    return error;
  }

  const player = getPlayer(game, playerSeat);
  const usedTileIds = getTilesByType(player.hand, getTileType(claim.tileId), 2);
  if (usedTileIds.length !== 2) {
    return failure("手牌不足以完成碰牌。");
  }

  applyDiscardClaimMeld(game, {
    playerSeat,
    claim,
    meldType: "pung",
    meldTileType: getTileType(claim.tileId),
    usedTileIds,
  });
  appendLog(game, `${seatLabel(playerSeat)}碰了 ${getTileLabel(claim.tileId)}。`);
  return success(game);
}

function handleClaimDiscardKong(game, playerSeat) {
  const { claim, error } = getDiscardResponseClaim(game, playerSeat, "kong", "現在不能明槓。");
  if (error) {
    return error;
  }

  const player = getPlayer(game, playerSeat);
  const usedTileIds = getTilesByType(player.hand, getTileType(claim.tileId), 3);
  if (usedTileIds.length !== 3) {
    return failure("手牌不足以完成明槓。");
  }

  applyDiscardClaimMeld(game, {
    playerSeat,
    claim,
    meldType: "kong",
    meldTileType: getTileType(claim.tileId),
    usedTileIds,
  });
  drawSupplementTile(game, playerSeat, "明槓補牌");
  return success(game);
}

export const GAME_DISCARD_CLAIM_COMMAND_HANDLERS = {
  claimChow: (game, playerSeat, payload) => handleClaimChow(game, playerSeat, payload),
  claimPung: (game, playerSeat) => handleClaimPung(game, playerSeat),
  claimDiscardKong: (game, playerSeat) => handleClaimDiscardKong(game, playerSeat),
};
