import {
  SCORING_VERSION,
  normalizeScoringEnabled,
} from "./scoring.js";

export const DEFAULT_DRAW_REVEAL_SECONDS = 3;

const MIN_DRAW_REVEAL_SECONDS = 0;
const MAX_DRAW_REVEAL_SECONDS = 6;

export function normalizeRoundPlayer(player = {}, seat = 0) {
  return {
    seat: typeof player.seat === "number" ? player.seat : seat,
    hand: Array.isArray(player.hand) ? player.hand : [],
    melds: Array.isArray(player.melds) ? player.melds : [],
    discards: Array.isArray(player.discards) ? player.discards : [],
  };
}

export function normalizeGameState(game) {
  if (!game) {
    return null;
  }

  const normalizedPlayers = Array.from({ length: 2 }, (_, seat) =>
    normalizeRoundPlayer(
      Array.isArray(game.players)
        ? game.players.find((player) => player && player.seat === seat) || game.players[seat]
        : null,
      seat,
    ),
  );

  return {
    ...game,
    players: normalizedPlayers,
    drawRevealSeconds: normalizeDrawRevealSeconds(game.drawRevealSeconds),
    scoringEnabled: normalizeScoringEnabled(game.scoringEnabled),
    scoringVersion: normalizeScoringEnabled(game.scoringEnabled)
      ? game.scoringVersion || SCORING_VERSION
      : "",
    actionLog: Array.isArray(game.actionLog) ? game.actionLog : [],
    wall: Array.isArray(game.wall) ? game.wall : [],
    pendingClaim: game.pendingClaim || null,
    latestDiscard: game.latestDiscard || null,
    result: game.result || null,
    lastDraw: game.lastDraw || null,
    wins: normalizeWins(game.winCounts, game.scores, game.scoringEnabled),
    scores: normalizePointScores(game.scores, game.winCounts, game.scoringEnabled),
  };
}

export function normalizeDrawRevealSeconds(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_DRAW_REVEAL_SECONDS;
  }

  return Math.min(MAX_DRAW_REVEAL_SECONDS, Math.max(MIN_DRAW_REVEAL_SECONDS, Math.round(parsed)));
}

export function normalizeWins(winCounts, legacyScores, scoringEnabled) {
  const source = Array.isArray(winCounts)
    ? winCounts
    : !normalizeScoringEnabled(scoringEnabled) && Array.isArray(legacyScores)
      ? legacyScores
      : [];

  return Array.from({ length: 2 }, (_, seat) => {
    const value = Number(source[seat]);
    return Number.isFinite(value) && value > 0 ? value : 0;
  });
}

export function normalizePointScores(scores, winCounts, scoringEnabled) {
  const shouldTreatLegacyScoresAsWins = !Array.isArray(winCounts) && !normalizeScoringEnabled(scoringEnabled);
  if (shouldTreatLegacyScoresAsWins) {
    return [0, 0];
  }

  return Array.from({ length: 2 }, (_, seat) => {
    const value = Array.isArray(scores) ? Number(scores[seat]) : 0;
    return Number.isFinite(value) ? Math.round(value) : 0;
  });
}
