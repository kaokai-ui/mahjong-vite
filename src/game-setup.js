import { buildDeck, getRuleset, sortTileIds } from "./rules.js";
import { SCORING_VERSION, normalizeScoringEnabled } from "./scoring.js";
import {
  normalizeDrawRevealSeconds,
  normalizePointScores,
  normalizeWins,
} from "./game-state.js";
import { seatLabel } from "./game-internal-utils.js";

function createRoundPlayer(seat) {
  return {
    seat,
    hand: [],
    melds: [],
    discards: [],
  };
}

function resolveNextDealerSeat(previousGame) {
  if (previousGame && typeof previousGame.winnerSeat === "number") {
    return previousGame.winnerSeat;
  }

  if (previousGame && typeof previousGame.dealerSeat === "number") {
    return previousGame.dealerSeat;
  }

  return 0;
}

export function createWaitingGame(rulesetId, options = {}) {
  const ruleset = getRuleset(rulesetId);
  const normalizedOptions = typeof options === "number" ? { drawRevealSeconds: options } : options || {};
  const drawRevealSeconds = normalizeDrawRevealSeconds(
    normalizedOptions.drawRevealSeconds,
  );
  const scoringEnabled = normalizeScoringEnabled(normalizedOptions.scoringEnabled);

  return {
    status: "waiting",
    phase: "waiting",
    rulesetId: ruleset.id,
    rulesetName: ruleset.name,
    drawRevealSeconds,
    scoringEnabled,
    scoringVersion: scoringEnabled ? SCORING_VERSION : "",
    players: [createRoundPlayer(0), createRoundPlayer(1)],
    actionLog: [`已建立房間，規則為「${ruleset.name}」。`],
    latestDiscard: null,
    pendingClaim: null,
    wall: [],
    dealerSeat: 0,
    turnSeat: 0,
    roundNumber: 0,
    nextDiscardId: 1,
    nextMeldId: 1,
    winnerSeat: null,
    result: null,
    lastDraw: null,
    winCounts: [0, 0],
    scores: [0, 0],
  };
}

export function createStartedGame(rulesetId, previousGame, options = {}) {
  const ruleset = getRuleset(rulesetId);
  const deck = buildDeck(ruleset.id);
  const players = [createRoundPlayer(0), createRoundPlayer(1)];
  const drawRevealSeconds = normalizeDrawRevealSeconds(
    options && Object.prototype.hasOwnProperty.call(options, "drawRevealSeconds")
      ? options.drawRevealSeconds
      : previousGame && previousGame.drawRevealSeconds,
  );
  const scoringEnabled = normalizeScoringEnabled(
    options && Object.prototype.hasOwnProperty.call(options, "scoringEnabled")
      ? options.scoringEnabled
      : previousGame && previousGame.scoringEnabled,
  );

  for (let drawCount = 0; drawCount < 13; drawCount += 1) {
    players[0].hand.push(deck.shift());
    players[1].hand.push(deck.shift());
  }

  players[0].hand = sortTileIds(players[0].hand);
  players[1].hand = sortTileIds(players[1].hand);

  const dealerSeat = resolveNextDealerSeat(previousGame);
  const dealerDraw = deck.shift();
  players[dealerSeat].hand = sortTileIds([...players[dealerSeat].hand, dealerDraw]);
  const wins = normalizeWins(
    previousGame && previousGame.winCounts,
    previousGame && previousGame.scores,
    previousGame && previousGame.scoringEnabled,
  );
  const scores = normalizePointScores(
    previousGame && previousGame.scores,
    previousGame && previousGame.winCounts,
    previousGame && previousGame.scoringEnabled,
  );

  return {
    status: "playing",
    phase: "discard",
    rulesetId: ruleset.id,
    rulesetName: ruleset.name,
    drawRevealSeconds,
    scoringEnabled,
    scoringVersion: scoringEnabled ? SCORING_VERSION : "",
    players,
    actionLog: [`新的一局開始，${seatLabel(dealerSeat)}為莊家。`],
    latestDiscard: null,
    pendingClaim: null,
    wall: deck,
    dealerSeat,
    turnSeat: dealerSeat,
    roundNumber: ((previousGame && previousGame.roundNumber) || 0) + 1,
    nextDiscardId: 1,
    nextMeldId: 1,
    winnerSeat: null,
    result: null,
    winCounts: wins,
    scores,
    lastDraw: {
      seat: dealerSeat,
      tileId: dealerDraw,
      source: "live",
      initial: true,
    },
  };
}
