import { ONLINE_MULTIPLAYER_ENABLED } from "../app-variant";

export type GameMode = "online" | "solo-bot";
export type RulesetId = "full136" | "classic64";
export type SoloDifficulty = "easy" | "normal" | "hard" | "god";
export type SoloPlayerCount = "2" | "4";
export type ScoringToggle = "false" | "true";

export const GAME_MODE_OPTIONS: ReadonlyArray<{ value: GameMode; label: string }> = [
  { value: "online", label: "雙人連線" },
  { value: "solo-bot", label: "單人對電腦" },
];

export const AVAILABLE_GAME_MODE_OPTIONS: ReadonlyArray<{ value: GameMode; label: string }> = ONLINE_MULTIPLAYER_ENABLED
  ? GAME_MODE_OPTIONS
  : GAME_MODE_OPTIONS.filter((option) => option.value !== "online");

export const RULESET_OPTIONS: ReadonlyArray<{ value: RulesetId; label: string }> = [
  { value: "full136", label: "雙人全牌 136 張" },
  { value: "classic64", label: "雙人經典 64 張" },
];

export const SOLO_DIFFICULTY_OPTIONS: ReadonlyArray<{ value: SoloDifficulty; label: string }> = [
  { value: "easy", label: "簡單" },
  { value: "normal", label: "普通" },
  { value: "hard", label: "困難" },
  { value: "god", label: "賭神" },
];

export const SOLO_PLAYER_COUNT_OPTIONS: ReadonlyArray<{ value: SoloPlayerCount; label: string }> = [
  { value: "2", label: "2 人局" },
  { value: "4", label: "4 人局" },
];

export const DRAW_REVEAL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "0", label: "不倒數" },
  { value: "1", label: "1 秒" },
  { value: "2", label: "2 秒" },
  { value: "3", label: "3 秒" },
  { value: "4", label: "4 秒" },
  { value: "5", label: "5 秒" },
  { value: "6", label: "6 秒" },
];

export const SCORING_OPTIONS: ReadonlyArray<{ value: ScoringToggle; label: string }> = [
  { value: "false", label: "關閉" },
  { value: "true", label: "開啟" },
];
