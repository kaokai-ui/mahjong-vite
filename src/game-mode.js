export const GAME_MODE_LEGACY_ONLINE = "online";
export const GAME_MODE_ONLINE_2P = "online-2p";
export const GAME_MODE_ONLINE_4P = "online-4p";
export const GAME_MODE_SOLO = "solo-bot";

export function isSoloGameMode(mode) {
  return mode === GAME_MODE_SOLO;
}

export function isOnlineGameMode(mode) {
  return mode === GAME_MODE_LEGACY_ONLINE || mode === GAME_MODE_ONLINE_2P || mode === GAME_MODE_ONLINE_4P;
}

export function normalizeOnlineGameMode(mode) {
  return mode === GAME_MODE_ONLINE_4P ? GAME_MODE_ONLINE_4P : GAME_MODE_ONLINE_2P;
}

export function normalizeAppGameMode(mode) {
  return isSoloGameMode(mode) ? GAME_MODE_SOLO : normalizeOnlineGameMode(mode);
}

export function getOnlineTablePlayerCount(mode) {
  return normalizeOnlineGameMode(mode) === GAME_MODE_ONLINE_4P ? 4 : 2;
}

export function getOnlineGuestSeat(mode) {
  return normalizeOnlineGameMode(mode) === GAME_MODE_ONLINE_4P ? 2 : 1;
}

export function getOnlineBotSeats(mode) {
  return normalizeOnlineGameMode(mode) === GAME_MODE_ONLINE_4P ? [1, 3] : [];
}

export function getOnlineHumanSeatForSlot(mode, slot) {
  if (Number(slot) === 0) {
    return 0;
  }

  return getOnlineGuestSeat(mode);
}
