import {
  evaluateWinningHand,
  getAddedKongOptions,
  getConcealedKongTypes,
} from "./rules.js";
import { getPlayer } from "./game-internal-utils.js";
import { normalizeGameState } from "./game-state.js";

function createEmptyClientState() {
  return {
    canDraw: false,
    canDiscard: false,
    canSelfDraw: false,
    concealedKongs: [],
    addedKongs: [],
    claimOptions: [],
    pendingClaim: null,
  };
}

function buildClaimOptions(game, playerSeat) {
  const claimOptions = [];

  if (
    game.status !== "playing" ||
    !["response", "robKong"].includes(game.phase) ||
    !game.pendingClaim ||
    game.pendingClaim.toSeat !== playerSeat
  ) {
    return claimOptions;
  }

  if (game.pendingClaim.kind === "discard") {
    if (game.pendingClaim.options.includes("win")) {
      claimOptions.push({ type: "claimWin", label: "胡牌" });
    }
    if (game.pendingClaim.options.includes("pung")) {
      claimOptions.push({ type: "claimPung", label: "碰" });
    }
    if (game.pendingClaim.options.includes("kong")) {
      claimOptions.push({ type: "claimDiscardKong", label: "槓" });
    }
    if (game.pendingClaim.options.includes("chow")) {
      for (const combo of game.pendingClaim.chowCombos) {
        claimOptions.push({
          type: "claimChow",
          label: `吃 ${combo.label}`,
          neededTypes: combo.neededTypes,
        });
      }
    }
    claimOptions.push({ type: "passClaim", label: "過" });
    return claimOptions;
  }

  if (game.pendingClaim.kind === "robKong") {
    claimOptions.push({ type: "claimWin", label: "搶槓胡" });
    claimOptions.push({ type: "passClaim", label: "過" });
  }

  return claimOptions;
}

export function getPlayerClientState(game, playerSeat) {
  const normalizedGame = normalizeGameState(game);
  if (!normalizedGame) {
    return createEmptyClientState();
  }

  const player = getPlayer(normalizedGame, playerSeat);
  if (!player) {
    return createEmptyClientState();
  }

  const canDraw =
    normalizedGame.status === "playing" &&
    normalizedGame.phase === "draw" &&
    normalizedGame.turnSeat === playerSeat;
  const canDiscard =
    normalizedGame.status === "playing" &&
    normalizedGame.phase === "discard" &&
    normalizedGame.turnSeat === playerSeat;
  const canSelfDraw =
    canDiscard &&
    evaluateWinningHand({
      handTileIds: player.hand,
      melds: player.melds,
    }).canWin;

  return {
    canDraw,
    canDiscard,
    canSelfDraw,
    concealedKongs: canDiscard ? getConcealedKongTypes(player.hand) : [],
    addedKongs: canDiscard ? getAddedKongOptions(player) : [],
    claimOptions: buildClaimOptions(normalizedGame, playerSeat),
    pendingClaim: normalizedGame.pendingClaim,
  };
}
