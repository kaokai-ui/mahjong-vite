import { normalizeScoringEnabled } from "./scoring.js";

export const DEFAULT_SOLO_DIFFICULTY = "hard";
export const SOLO_DIFFICULTY_LABELS = {
  easy: "簡單",
  normal: "普通",
  hard: "困難",
  god: "賭神",
};

export const ALL_TILE_TYPES = [
  ...Array.from({ length: 9 }, (_, index) => `m${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `p${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `s${index + 1}`),
  "E",
  "S",
  "W",
  "N",
  "R",
  "G",
  "B",
];

export const DEFAULT_LOOKAHEAD_CANDIDATE_LIMIT = 1;
export const DEFAULT_LOOKAHEAD_DRAW_LIMIT = 2;

export const DIFFICULTY_PROFILES = {
  easy: {
    id: "easy",
    structured: false,
    advanced: false,
    lookahead: false,
    actionThreshold: 0,
    attackFactor: 1,
    riskMultiplier: 1,
    lookaheadWeight: 0,
    lookaheadCandidateLimit: 0,
    lookaheadDrawLimit: 0,
    lookaheadActivationGap: 0,
    lookaheadMaxShanten: 0,
    guaranteedLookaheadShanten: 0,
    taiWeight: 0,
    projectedScoreWeight: 0,
  },
  normal: {
    id: "normal",
    structured: true,
    advanced: false,
    lookahead: false,
    actionThreshold: 0,
    attackFactor: 1,
    riskMultiplier: 1,
    lookaheadWeight: 0,
    lookaheadCandidateLimit: 0,
    lookaheadDrawLimit: 0,
    lookaheadActivationGap: 0,
    lookaheadMaxShanten: 0,
    guaranteedLookaheadShanten: 0,
    taiWeight: 0,
    projectedScoreWeight: 0,
  },
  hard: {
    id: "hard",
    structured: false,
    advanced: true,
    lookahead: false,
    actionThreshold: 7,
    attackFactor: 1.07,
    riskMultiplier: 0.9,
    lookaheadWeight: 0,
    lookaheadCandidateLimit: 0,
    lookaheadDrawLimit: 0,
    lookaheadActivationGap: 0,
    lookaheadMaxShanten: 0,
    guaranteedLookaheadShanten: 0,
    scoringWeight: 0.28,
    scoreGapWeight: 0.1,
    exposurePenaltyScale: 18,
    taiWeight: 8,
    projectedScoreWeight: 0.08,
  },
  god: {
    id: "god",
    structured: false,
    advanced: true,
    lookahead: true,
    actionThreshold: 6,
    attackFactor: 1.14,
    riskMultiplier: 0.78,
    lookaheadWeight: 1.55,
    lookaheadCandidateLimit: 1,
    lookaheadDrawLimit: 2,
    lookaheadActivationGap: 8,
    lookaheadMaxShanten: 3,
    guaranteedLookaheadShanten: 1,
    scoringWeight: 1.12,
    scoreGapWeight: 0.28,
    exposurePenaltyScale: 30,
    taiWeight: 26,
    projectedScoreWeight: 0.28,
  },
};

export function normalizeSoloDifficulty(value) {
  return Object.prototype.hasOwnProperty.call(SOLO_DIFFICULTY_LABELS, value) ? value : DEFAULT_SOLO_DIFFICULTY;
}

export function getDifficultyProfile(difficulty) {
  return DIFFICULTY_PROFILES[difficulty] || DIFFICULTY_PROFILES[DEFAULT_SOLO_DIFFICULTY];
}

export function isScoringStrategyEnabled(game, profile) {
  return Boolean(profile && profile.advanced && normalizeScoringEnabled(game && game.scoringEnabled));
}

export function getScoringProfileId(profile) {
  return profile && profile.id === "god" ? "god" : "hard";
}
