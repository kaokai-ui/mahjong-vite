import { getTileType } from "./rules.js";
import {
  SCORING_VERSION,
  buildWinningScoreDelta,
  evaluateWinningScore,
  normalizeScoringEnabled,
} from "./scoring.js";
import { appendLog, getPlayer, getPlayerCount, seatLabel } from "./game-internal-utils.js";
import { normalizePointScores, normalizeWins } from "./game-state.js";

function normalizeLoserSeats(loserSeat, playerCount) {
  if (Array.isArray(loserSeat)) {
    return loserSeat.filter((seat) => typeof seat === "number" && seat >= 0 && seat < playerCount);
  }

  return typeof loserSeat === "number" ? [loserSeat] : [];
}

export function finishWithWinner(game, { winnerSeat, loserSeat, winKind, winningTileId, patterns }) {
  const winner = getPlayer(game, winnerSeat);
  const playerCount = getPlayerCount(game);
  const scoringEnabled = normalizeScoringEnabled(game.scoringEnabled);
  const scoringSummary =
    scoringEnabled && winner
      ? evaluateWinningScore({
          handTileIds: winner.hand,
          melds: winner.melds,
          winKind,
          winningTileId,
          additionalTileId: winKind === "discardWin" ? winningTileId : "",
          additionalTileType: winKind === "robKong" ? getTileType(winningTileId) : "",
          lastDrawSource: game.lastDraw ? game.lastDraw.source : "",
        })
      : null;

  game.status = "finished";
  game.phase = "finished";
  game.winnerSeat = winnerSeat;
  game.pendingClaim = null;
  game.turnSeat = winnerSeat;
  game.winCounts = normalizeWins(game.winCounts, game.scores, game.scoringEnabled, playerCount);
  game.winCounts[winnerSeat] += 1;
  game.scores = normalizePointScores(game.scores, game.winCounts, game.scoringEnabled, playerCount);

  const loserSeats = normalizeLoserSeats(loserSeat, playerCount);
  const scoreDeltaBySeat = Array.from({ length: playerCount }, () => 0);
  if (scoringEnabled && scoringSummary && scoringSummary.totalScore > 0) {
    const settlement = buildWinningScoreDelta({
      playerCount,
      winnerSeat,
      loserSeat: loserSeats,
      winKind,
      totalScore: scoringSummary.totalScore,
    });
    for (let seat = 0; seat < settlement.length; seat += 1) {
      scoreDeltaBySeat[seat] = settlement[seat];
    }
    game.scores = game.scores.map((score, seat) => score + scoreDeltaBySeat[seat]);
  }

  game.result = {
    winnerSeat,
    loserSeat: loserSeats.length <= 1 ? loserSeats[0] ?? null : loserSeats,
    winKind,
    winningTileId,
    patterns,
    scoringEnabled,
    scoringVersion: scoringEnabled ? SCORING_VERSION : "",
    taiBreakdown: scoringSummary ? scoringSummary.breakdown : [],
    totalTai: scoringSummary ? scoringSummary.totalTai : 0,
    roundScore: scoringSummary ? scoringSummary.totalScore : 0,
    scoreDeltaBySeat,
  };

  const summaryLabel =
    winKind === "selfDraw"
      ? `${seatLabel(winnerSeat)} self drew`
      : winKind === "robKong"
        ? `${seatLabel(winnerSeat)} robbed the kong`
        : `${seatLabel(winnerSeat)} won on discard`;
  const summaryPatterns = patterns.join(", ") || "Winning hand";
  const scoringText =
    scoringEnabled && scoringSummary ? ` / ${scoringSummary.totalTai} tai / ${scoringSummary.totalScore} pts` : "";
  appendLog(game, `${summaryLabel}: ${summaryPatterns}${scoringText}.`);
}

export function finishAsDraw(game, message) {
  const scoringEnabled = normalizeScoringEnabled(game.scoringEnabled);
  const playerCount = getPlayerCount(game);

  game.status = "finished";
  game.phase = "finished";
  game.pendingClaim = null;
  game.result = {
    winKind: "draw",
    patterns: [],
    message,
    scoringEnabled,
    scoringVersion: scoringEnabled ? SCORING_VERSION : "",
    taiBreakdown: [],
    totalTai: 0,
    roundScore: 0,
    scoreDeltaBySeat: Array.from({ length: playerCount }, () => 0),
  };
  appendLog(game, message);
}
