const SOLO_GAME_MODE = "solo-bot";
const SOLO_FOUR_PLAYER_MINIMAL_VARIANT = "solo-4p-minimal";
const DEFAULT_RULESET_ID = "full136";
const DEFAULT_DRAW_REVEAL_SECONDS = 6;
const DEFAULT_SOLO_DIFFICULTY = "hard";
const DEFAULT_SOLO_PLAYER_COUNT = 4;
const DEFAULT_SCORING_ENABLED = true;

const STORAGE_KEYS = {
  gameMode: "mahjong-game-mode",
  soloDifficulty: "mahjong-solo-difficulty",
  soloPlayerCount: "mahjong-solo-player-count",
  scoringEnabled: "mahjong-scoring-enabled",
} as const;

export type AppShellVariant = "default" | typeof SOLO_FOUR_PLAYER_MINIMAL_VARIANT;

export type AppShellVariantPreset = {
  mode: string;
  rulesetId: string;
  drawRevealSeconds: number;
  soloDifficulty: string;
  soloPlayerCount: number;
  scoringEnabled: boolean;
};

const SOLO_FOUR_PLAYER_MINIMAL_PRESET: AppShellVariantPreset = Object.freeze({
  mode: SOLO_GAME_MODE,
  rulesetId: DEFAULT_RULESET_ID,
  drawRevealSeconds: DEFAULT_DRAW_REVEAL_SECONDS,
  soloDifficulty: DEFAULT_SOLO_DIFFICULTY,
  soloPlayerCount: DEFAULT_SOLO_PLAYER_COUNT,
  scoringEnabled: DEFAULT_SCORING_ENABLED,
});

function safeWriteLocalSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // Ignore Safari private mode write failures.
  }
}

export function readAppShellVariant(): AppShellVariant {
  if (typeof document === "undefined") {
    return "default";
  }

  return document.documentElement.dataset.appShellVariant === SOLO_FOUR_PLAYER_MINIMAL_VARIANT
    ? SOLO_FOUR_PLAYER_MINIMAL_VARIANT
    : "default";
}

export function isSoloFourPlayerMinimalShell() {
  return readAppShellVariant() === SOLO_FOUR_PLAYER_MINIMAL_VARIANT;
}

export function getAppShellVariantPreset(): AppShellVariantPreset | null {
  return isSoloFourPlayerMinimalShell() ? SOLO_FOUR_PLAYER_MINIMAL_PRESET : null;
}

export function applySoloFourPlayerMinimalEntryPreset() {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.appShellVariant = SOLO_FOUR_PLAYER_MINIMAL_VARIANT;
  }

  safeWriteLocalSetting(STORAGE_KEYS.gameMode, SOLO_FOUR_PLAYER_MINIMAL_PRESET.mode);
  safeWriteLocalSetting(STORAGE_KEYS.soloDifficulty, SOLO_FOUR_PLAYER_MINIMAL_PRESET.soloDifficulty);
  safeWriteLocalSetting(STORAGE_KEYS.soloPlayerCount, String(SOLO_FOUR_PLAYER_MINIMAL_PRESET.soloPlayerCount));
  safeWriteLocalSetting(STORAGE_KEYS.scoringEnabled, String(SOLO_FOUR_PLAYER_MINIMAL_PRESET.scoringEnabled));
}
