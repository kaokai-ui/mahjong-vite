const BROWSER_ID_KEY = "mahjong-browser-id";
const PLAYER_NAME_KEY = "mahjong-player-name";
const storageFallback = new Map();

function getOrCreateBrowserId() {
  const existing = readStorage(BROWSER_ID_KEY);
  if (existing) {
    return existing;
  }

  const generated =
    typeof crypto !== "undefined" && crypto && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `browser-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  writeStorage(BROWSER_ID_KEY, generated);
  return generated;
}

function readStorage(key) {
  if (storageFallback.has(key)) {
    return storageFallback.get(key);
  }

  try {
    const value = localStorage.getItem(key);
    if (value !== null) {
      storageFallback.set(key, value);
    }
    return value;
  } catch (error) {
    return storageFallback.has(key) ? storageFallback.get(key) : null;
  }
}

function writeStorage(key, value) {
  storageFallback.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // Safari private mode can reject writes.
  }
}

export { BROWSER_ID_KEY, PLAYER_NAME_KEY, getOrCreateBrowserId, readStorage, writeStorage };
