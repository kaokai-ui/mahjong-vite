const baseFirebaseConfig = {
  apiKey: "AIzaSyAJ7c2aI6k697zE-2NppxTh2pnUATzcMOw",
  authDomain: "my-mj-project-hkk.firebaseapp.com",
  databaseURL: "https://my-mj-project-hkk-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "my-mj-project-hkk",
  storageBucket: "my-mj-project-hkk.firebasestorage.app",
  messagingSenderId: "526378110205",
  appId: "1:526378110205:web:2c6346979ae45769b34294",
};

const baseFirebaseAppCheckConfig = {
  enabled: true,
  provider: "recaptcha-enterprise",
  siteKey: "6Lfmc8ksAAAAAKDFFu9TdYQIF4Z0e_HcLfh9NVq1",
  debugToken: "",
};

const localOverride = readLocalOverride();
const runtimeOverride = readRuntimeFirebaseOverride();

export const firebaseConfig = {
  ...baseFirebaseConfig,
  ...localOverride.firebaseConfig,
  ...runtimeOverride.firebaseConfig,
};

export const firebaseAppCheckConfig = {
  ...baseFirebaseAppCheckConfig,
  ...localOverride.firebaseAppCheckConfig,
  ...runtimeOverride.firebaseAppCheckConfig,
};

export function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.databaseURL);
}

export function isAppCheckConfigured() {
  return Boolean(firebaseAppCheckConfig.enabled !== false && String(firebaseAppCheckConfig.siteKey || "").trim());
}

export function isLocalFirebaseOverrideActive() {
  return localOverride.active || runtimeOverride.active;
}

export function getRuntimeFirebaseOverride(search, options = {}) {
  const { allowLocalAppCheckOverride = false } = options;
  const emptyOverride = {
    active: false,
    firebaseConfig: {},
    firebaseAppCheckConfig: {},
  };

  if (!allowLocalAppCheckOverride || typeof search !== "string" || !search.trim()) {
    return emptyOverride;
  }

  const params = new URLSearchParams(search);
  const appCheckMode = String(params.get("appCheck") || "").trim().toLowerCase();

  if (["off", "disabled", "disable", "skip", "0"].includes(appCheckMode)) {
    return {
      active: true,
      firebaseConfig: {},
      firebaseAppCheckConfig: {
        enabled: false,
        debugToken: "",
      },
    };
  }

  return emptyOverride;
}

function readLocalOverride() {
  const root = typeof globalThis !== "undefined" ? globalThis : {};
  const rawOverride =
    root && root.__MAHJONG_LOCAL_OVERRIDE__ && typeof root.__MAHJONG_LOCAL_OVERRIDE__ === "object"
      ? root.__MAHJONG_LOCAL_OVERRIDE__
      : {};

  const firebaseConfigOverride = pickAllowedKeys(rawOverride.firebaseConfig, Object.keys(baseFirebaseConfig));
  const appCheckOverride = pickAllowedKeys(rawOverride.firebaseAppCheckConfig, Object.keys(baseFirebaseAppCheckConfig));

  return {
    active: Boolean(Object.keys(firebaseConfigOverride).length || Object.keys(appCheckOverride).length),
    firebaseConfig: firebaseConfigOverride,
    firebaseAppCheckConfig: appCheckOverride,
  };
}

function readRuntimeFirebaseOverride() {
  if (typeof window === "undefined") {
    return {
      active: false,
      firebaseConfig: {},
      firebaseAppCheckConfig: {},
    };
  }

  return getRuntimeFirebaseOverride(window.location.search, {
    allowLocalAppCheckOverride: isLocalLikeLocation(window.location),
  });
}

function isLocalLikeLocation(locationLike) {
  if (!locationLike) {
    return false;
  }

  const protocol = String(locationLike.protocol || "");
  const hostname = String(locationLike.hostname || "");

  if (protocol === "file:") {
    return true;
  }

  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local")) {
    return true;
  }

  if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) {
    return true;
  }

  const private172 = hostname.match(/^172\.(\d{1,2})\./);
  return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
}

function pickAllowedKeys(source, allowedKeys) {
  if (!source || typeof source !== "object") {
    return {};
  }

  return allowedKeys.reduce((result, key) => {
    if (source[key] !== undefined) {
      result[key] = source[key];
    }
    return result;
  }, {});
}
