import { GAME_MODE_SOLO } from "./game-mode.js";
import { DEFAULT_RULESET } from "./rules.js";
import { DEFAULT_SCORING_ENABLED } from "./scoring.js";
import { DEFAULT_SOLO_DIFFICULTY } from "./bot-ai-profile.js";
import { SOLO_STORAGE_KEYS } from "./solo-storage-keys.js";

const SOLO_FOUR_PLAYER_MINIMAL_VARIANT = "solo-4p-minimal";

// Preset-specific values for the solo-4p-minimal entry. These intentionally
// differ from the app-wide defaults (drawReveal default is 3s and the default
// solo player count is 2), so they are defined locally rather than imported.
const PRESET_DRAW_REVEAL_SECONDS = 6;
const PRESET_SOLO_PLAYER_COUNT = 4;

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
  mode: GAME_MODE_SOLO,
  rulesetId: DEFAULT_RULESET,
  drawRevealSeconds: PRESET_DRAW_REVEAL_SECONDS,
  soloDifficulty: DEFAULT_SOLO_DIFFICULTY,
  soloPlayerCount: PRESET_SOLO_PLAYER_COUNT,
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

  safeWriteLocalSetting(SOLO_STORAGE_KEYS.gameMode, SOLO_FOUR_PLAYER_MINIMAL_PRESET.mode);
  safeWriteLocalSetting(SOLO_STORAGE_KEYS.soloDifficulty, SOLO_FOUR_PLAYER_MINIMAL_PRESET.soloDifficulty);
  safeWriteLocalSetting(SOLO_STORAGE_KEYS.soloPlayerCount, String(SOLO_FOUR_PLAYER_MINIMAL_PRESET.soloPlayerCount));
  safeWriteLocalSetting(SOLO_STORAGE_KEYS.scoringEnabled, String(SOLO_FOUR_PLAYER_MINIMAL_PRESET.scoringEnabled));
}
