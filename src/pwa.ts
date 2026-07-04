import { ONLINE_MULTIPLAYER_ENABLED } from "./app-variant";

function activateWaitingServiceWorker(registration: ServiceWorkerRegistration) {
  registration.waiting?.postMessage({ type: "SKIP_WAITING" });
}

function watchServiceWorkerUpdates(registration: ServiceWorkerRegistration) {
  activateWaitingServiceWorker(registration);

  registration.addEventListener("updatefound", () => {
    const installingWorker = registration.installing;
    if (!installingWorker) {
      return;
    }

    installingWorker.addEventListener("statechange", () => {
      if (installingWorker.state === "installed") {
        activateWaitingServiceWorker(registration);
      }
    });
  });
}

function resolveServiceWorkerBaseUrl(): URL {
  const { pathname, href } = window.location;

  // The solo ("/solo/") entry lives in its own directory and must register its
  // own worker scoped there. Browsers can open the entry without the trailing
  // slash (e.g. ".../solo"), in which case `new URL("./", href)` resolves to the
  // *parent* directory and would grab the root worker instead. Detect the solo
  // segment explicitly and normalize to the directory form. Using the trailing
  // "/solo" segment (rather than a root-anchored "/solo/" prefix) keeps this
  // correct regardless of the deployment base path (e.g. "/mahjong-vite/solo").
  if (/\/solo$/.test(pathname)) {
    return new URL(`${pathname}/`, href);
  }

  return new URL("./", href);
}

export function registerPwaServiceWorker() {
  // Intentional: the "mahjong-solo-offline" Capacitor variant embeds its assets
  // natively and deliberately does NOT register a web service worker. Do not
  // loosen this gate — the offline variant must not install a web SW.
  if (!ONLINE_MULTIPLAYER_ENABLED) {
    return;
  }

  if (!("serviceWorker" in navigator) || window.location.protocol === "file:") {
    return;
  }

  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return;
  }

  const appVersion = String(window.__APP_VERSION__ || "").trim();
  const serviceWorkerBaseUrl = resolveServiceWorkerBaseUrl();
  const serviceWorkerUrl = new URL("sw.js", serviceWorkerBaseUrl);
  if (appVersion) {
    serviceWorkerUrl.searchParams.set("appVersion", appVersion);
  }

  window.addEventListener("load", () => {
    const hadActiveController = Boolean(navigator.serviceWorker.controller);
    let didReloadForControllerSwap = false;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadActiveController || didReloadForControllerSwap) {
        return;
      }

      didReloadForControllerSwap = true;
      window.location.reload();
    });

    void navigator.serviceWorker
      .register(serviceWorkerUrl.toString(), {
        scope: serviceWorkerBaseUrl.pathname,
        // Always revalidate the worker script (and any imports) against the
        // network so an installed PWA reliably picks up new versions.
        updateViaCache: "none",
      })
      .then((registration) => {
        watchServiceWorkerUpdates(registration);
        return registration.update();
      })
      .catch((error) => {
        console.warn("PWA service worker registration failed:", error);
      });
  });
}
