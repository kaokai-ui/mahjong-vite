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

export function registerPwaServiceWorker() {
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
  const serviceWorkerBaseUrl = new URL("./", window.location.href);
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
      .register(serviceWorkerUrl.toString(), { scope: serviceWorkerBaseUrl.pathname })
      .then((registration) => {
        watchServiceWorkerUpdates(registration);
        return registration.update();
      })
      .catch((error) => {
        console.warn("PWA service worker registration failed:", error);
      });
  });
}
