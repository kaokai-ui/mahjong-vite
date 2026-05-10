export type AppVariant = "mahjong-online" | "mahjong-solo-offline";

const RAW_APP_VARIANT = String(import.meta.env.VITE_APP_VARIANT || "").trim();

export const APP_VARIANT: AppVariant =
  RAW_APP_VARIANT === "mahjong-solo-offline" ? "mahjong-solo-offline" : "mahjong-online";

export const ONLINE_MULTIPLAYER_ENABLED = APP_VARIANT === "mahjong-online";

export function normalizeSupportedMode<TMode extends string>(value: TMode, soloModeValue: TMode) {
  return ONLINE_MULTIPLAYER_ENABLED ? value : soloModeValue;
}
