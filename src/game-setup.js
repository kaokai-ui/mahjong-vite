import {
  buildDeck,
  getRequiredOpeningTileCount,
  normalizeRulesetForPlayerCount,
  sortTileIds,
} from "./rules.js";
import { SCORING_VERSION, normalizeScoringEnabled } from "./scoring.js";
import {
  DEFAULT_PLAYER_COUNT,
  normalizeDrawRevealSeconds,
  normalizePlayerCount,
  normalizePointScores,
  normalizeWins,
} from "./game-state.js";
import { getSeatRange, seatLabel } from "./game-internal-utils.js";

function createRoundPlayer(seat) {
  return {
    seat,
    hand: [],
    melds: [],
    discards: [],
  };
}

function createRoundPlayers(playerCount) {
  return getSeatRange(playerCount).map((seat) => createRoundPlayer(seat));
}

function resolveNextDealerSeat(previousGame, playerCount = DEFAULT_PLAYER_COUNT) {
  if (previousGame && typeof previousGame.winnerSeat === "number") {
    return previousGame.winnerSeat % playerCount;
  }

  if (previousGame && typeof previousGame.dealerSeat === "number") {
    return previousGame.dealerSeat % playerCount;
  }

  return 0;
}

export function createWaitingGame(rulesetId, options = {}) {
  const normalizedOptions = typeof options === "number" ? { drawRevealSeconds: options } : options || {};
  const playerCount = normalizePlayerCount(normalizedOptions.playerCount);
  const ruleset = normalizeRulesetForPlayerCount(rulesetId, playerCount);
  const drawRevealSeconds = normalizeDrawRevealSeconds(
    normalizedOptions.drawRevealSeconds,
  );
  const scoringEnabled = normalizeScoringEnabled(normalizedOptions.scoringEnabled);

  return {
    status: "waiting",
    phase: "waiting",
    rulesetId: ruleset.id,
    rulesetName: ruleset.name,
    playerCount,
    drawRevealSeconds,
    scoringEnabled,
    scoringVersion: scoringEnabled ? SCORING_VERSION : "",
    players: createRoundPlayers(playerCount),
    actionLog: [`Waiting room created with ruleset ${ruleset.name}.`],
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
    winCounts: Array.from({ length: playerCount }, () => 0),
    scores: Array.from({ length: playerCount }, () => 0),
  };
}

export function createStartedGame(rulesetId, previousGame, options = {}) {
  const playerCount = normalizePlayerCount(
    options && Object.prototype.hasOwnProperty.call(options, "playerCount")
      ? options.playerCount
      : previousGame && previousGame.playerCount,
  );
  const ruleset = normalizeRulesetForPlayerCount(rulesetId, playerCount);
  const deck = buildDeck(ruleset.id);
  const requiredOpeningTileCount = getRequiredOpeningTileCount(playerCount);
  if (deck.length < requiredOpeningTileCount) {
    throw new Error(`Ruleset ${ruleset.id} does not have enough tiles for ${playerCount} players.`);
  }
  const players = createRoundPlayers(playerCount);
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
    for (const player of players) {
      player.hand.push(deck.shift());
    }
  }

  for (const player of players) {
    player.hand = sortTileIds(player.hand);
  }

  const dealerSeat = resolveNextDealerSeat(previousGame, playerCount);
  const dealerDraw = deck.shift();
  players[dealerSeat].hand = sortTileIds([...players[dealerSeat].hand, dealerDraw]);
  const wins = normalizeWins(
    previousGame && previousGame.winCounts,
    previousGame && previousGame.scores,
    previousGame && previousGame.scoringEnabled,
    playerCount,
  );
  const scores = normalizePointScores(
    previousGame && previousGame.scores,
    previousGame && previousGame.winCounts,
    previousGame && previousGame.scoringEnabled,
    playerCount,
  );

  return {
    status: "playing",
    phase: "discard",
    rulesetId: ruleset.id,
    rulesetName: ruleset.name,
    playerCount,
    drawRevealSeconds,
    scoringEnabled,
    scoringVersion: scoringEnabled ? SCORING_VERSION : "",
    players,
    actionLog: [`New round started. ${seatLabel(dealerSeat)} is the dealer.`],
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
