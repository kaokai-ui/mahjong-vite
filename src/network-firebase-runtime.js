import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { getDatabase } from "firebase/database";
import {
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
  initializeAppCheck,
} from "firebase/app-check";
import {
  firebaseAppCheckConfig,
  firebaseConfig,
  isAppCheckConfigured,
  isFirebaseConfigured,
} from "./firebase-config.js";
import { formatFirebaseClientError } from "./network-client-errors.js";

const firebaseSetupState = {
  configured: isFirebaseConfigured(),
  appCheckConfigured: isAppCheckConfigured(),
  initializing: false,
  ready: false,
  authReady: false,
  uid: "",
  appCheckEnabled: false,
  appCheckReady: false,
  appCheckProvider: "",
  appCheckDebug: false,
  appCheckMessage: "尚未設定",
  error: "",
};

let firebaseApp = null;
let firebaseAuth = null;
let firebaseDatabase = null;
let firebaseAppCheck = null;
let firebaseInitPromise = null;
let authObserverStarted = false;
let authUnsubscribe = null;
let anonymousSignInInFlight = null;
let authReadyPromise = null;
let resolveAuthReady = null;
let rejectAuthReady = null;

function getFirebaseSetupState() {
  return {
    ...firebaseSetupState,
  };
}

function setFirebaseSetupState(patch) {
  Object.assign(firebaseSetupState, patch);
}

async function ensureFirebaseReady(reportError) {
  if (firebaseInitPromise) {
    return firebaseInitPromise;
  }

  firebaseInitPromise = (async () => {
    if (!isFirebaseConfigured()) {
      return false;
    }

    setFirebaseSetupState({
      configured: true,
      appCheckConfigured: isAppCheckConfigured(),
      initializing: true,
      ready: false,
      error: "",
    });

    firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
    initializeAppCheckIfNeeded(reportError);
    firebaseAuth = getAuth(firebaseApp);
    firebaseDatabase = getDatabase(firebaseApp);

    await waitForAnonymousAuth(reportError);

    setFirebaseSetupState({
      initializing: false,
      ready: true,
      error: "",
    });

    return true;
  })().catch((error) => {
    setFirebaseSetupState({
      initializing: false,
      ready: false,
      error: formatFirebaseClientError(error),
    });
    firebaseInitPromise = null;
    throw error;
  });

  return firebaseInitPromise;
}

function getFirebaseDatabaseInstance() {
  return firebaseDatabase;
}

function initializeAppCheckIfNeeded(reportError) {
  const config = normalizeAppCheckConfig(firebaseAppCheckConfig);
  const providerLabel = config.provider === "recaptcha-v3" ? "reCAPTCHA v3" : "reCAPTCHA Enterprise";
  const usingDebugToken = Boolean(config.debugToken);

  setFirebaseSetupState({
    appCheckConfigured: Boolean(config.siteKey),
    appCheckEnabled: false,
    appCheckReady: false,
    appCheckProvider: providerLabel,
    appCheckDebug: usingDebugToken,
    appCheckMessage: config.enabled === false ? "已停用" : config.siteKey ? "準備初始化" : "尚未填寫 site key",
  });

  if (config.enabled === false || !config.siteKey) {
    return;
  }

  if (!isSecureAppCheckOrigin() && !usingDebugToken) {
    setFirebaseSetupState({
      appCheckEnabled: false,
      appCheckReady: false,
      appCheckMessage: "目前網址不是 HTTPS/localhost，已先略過",
    });
    return;
  }

  if (usingDebugToken && typeof self !== "undefined") {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = config.debugToken === true ? true : config.debugToken;
  }

  try {
    const provider =
      config.provider === "recaptcha-v3"
        ? new ReCaptchaV3Provider(config.siteKey)
        : new ReCaptchaEnterpriseProvider(config.siteKey);
    firebaseAppCheck = initializeAppCheck(firebaseApp, {
      provider,
      isTokenAutoRefreshEnabled: true,
    });
    setFirebaseSetupState({
      appCheckEnabled: true,
      appCheckReady: true,
      appCheckMessage: usingDebugToken ? "已啟用 Debug Token" : "已啟用",
    });
  } catch (error) {
    const message = formatFirebaseClientError(error);
    setFirebaseSetupState({
      appCheckEnabled: false,
      appCheckReady: false,
      appCheckMessage: `初始化失敗：${message}`,
      error: message,
    });
    if (typeof reportError === "function") {
      reportError(message);
    }
  }
}

function normalizeAppCheckConfig(config) {
  const rawProvider = String((config && config.provider) || "recaptcha-enterprise").trim().toLowerCase();
  const rawDebugToken = config ? config.debugToken : "";
  const normalizedDebugToken =
    rawDebugToken === true || String(rawDebugToken || "").trim().toLowerCase() === "true"
      ? true
      : String(rawDebugToken || "").trim().toLowerCase() === "false"
        ? ""
        : rawDebugToken
          ? String(rawDebugToken).trim()
          : "";
  return {
    enabled: !config || config.enabled !== false,
    provider: rawProvider === "recaptcha-v3" ? "recaptcha-v3" : "recaptcha-enterprise",
    siteKey: String((config && config.siteKey) || "").trim(),
    debugToken: normalizedDebugToken,
  };
}

function isSecureAppCheckOrigin() {
  if (typeof window === "undefined") {
    return false;
  }

  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  return protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1";
}

async function waitForAnonymousAuth(reportError) {
  if (firebaseSetupState.authReady && firebaseSetupState.uid) {
    return firebaseSetupState.uid;
  }

  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve, reject) => {
      resolveAuthReady = resolve;
      rejectAuthReady = reject;
    });
  }

  if (!authObserverStarted) {
    authObserverStarted = true;
    authUnsubscribe = onAuthStateChanged(
      firebaseAuth,
      async (user) => {
        if (user) {
          setFirebaseSetupState({
            authReady: true,
            uid: user.uid,
            error: "",
          });
          resolveAuthReadyOnce(user.uid);
          return;
        }

        setFirebaseSetupState({
          authReady: false,
          uid: "",
        });

        try {
          await ensureAnonymousSignIn();
        } catch (error) {
          handleAuthFailure(error, reportError);
        }
      },
      (error) => {
        handleAuthFailure(error, reportError);
      },
    );
  }

  return authReadyPromise;
}

function resolveAuthReadyOnce(uid) {
  if (resolveAuthReady) {
    resolveAuthReady(uid);
  }
  resolveAuthReady = null;
  rejectAuthReady = null;
}

function handleAuthFailure(error, reportError) {
  const message = formatFirebaseClientError(error);
  setFirebaseSetupState({
    ready: false,
    error: message,
  });
  if (rejectAuthReady) {
    rejectAuthReady(error);
  }
  // Reset the auth-ready gate and tear down the observer so a later
  // ensureFirebaseReady()/waitForAnonymousAuth() call can rebuild the promise
  // and retry anonymous sign-in instead of returning the stale rejected promise.
  resetAuthReadyState();
  if (typeof reportError === "function") {
    reportError(message);
  }
}

function resetAuthReadyState() {
  if (typeof authUnsubscribe === "function") {
    authUnsubscribe();
  }
  authUnsubscribe = null;
  authObserverStarted = false;
  authReadyPromise = null;
  resolveAuthReady = null;
  rejectAuthReady = null;
}

async function ensureAnonymousSignIn() {
  if (anonymousSignInInFlight) {
    return anonymousSignInInFlight;
  }

  anonymousSignInInFlight = signInAnonymously(firebaseAuth).finally(() => {
    anonymousSignInInFlight = null;
  });
  return anonymousSignInInFlight;
}

export {
  ensureFirebaseReady,
  getFirebaseDatabaseInstance,
  getFirebaseSetupState,
  setFirebaseSetupState,
};
