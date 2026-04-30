import { getTileType } from "./rules.js";
import {
  SCORING_VERSION,
  evaluateWinningScore,
  normalizeScoringEnabled,
} from "./scoring.js";
import { appendLog, getPlayer, seatLabel } from "./game-internal-utils.js";
import { normalizePointScores, normalizeWins } from "./game-state.js";

export function finishWithWinner(game, { winnerSeat, loserSeat, winKind, winningTileId, patterns }) {
  const winner = getPlayer(game, winnerSeat);
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
  game.winCounts = normalizeWins(game.winCounts, game.scores, game.scoringEnabled);
  game.winCounts[winnerSeat] += 1;
  game.scores = normalizePointScores(game.scores, game.winCounts, game.scoringEnabled);

  const scoreDeltaBySeat = [0, 0];
  if (scoringEnabled && scoringSummary && scoringSummary.totalScore > 0) {
    scoreDeltaBySeat[winnerSeat] += scoringSummary.totalScore;
    if (typeof loserSeat === "number") {
      scoreDeltaBySeat[loserSeat] -= scoringSummary.totalScore;
    }
    game.scores = game.scores.map((score, seat) => score + scoreDeltaBySeat[seat]);
  }

  game.result = {
    winnerSeat,
    loserSeat,
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
      ? `${seatLabel(winnerSeat)}自摸`
      : winKind === "robKong"
        ? `${seatLabel(winnerSeat)}搶槓胡`
        : `${seatLabel(winnerSeat)}胡牌`;
  const summaryPatterns = patterns.join("、") || "標準胡牌";
  const scoringText =
    scoringEnabled && scoringSummary ? ` / ${scoringSummary.totalTai}台 / ${scoringSummary.totalScore}分` : "";
  appendLog(game, `${summaryLabel}，牌型：${summaryPatterns}${scoringText}。`);
}

export function finishAsDraw(game, message) {
  const scoringEnabled = normalizeScoringEnabled(game.scoringEnabled);

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
    scoreDeltaBySeat: [0, 0],
  };
  appendLog(game, message);
}
