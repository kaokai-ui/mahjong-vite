const scopeUrl = new URL(self.registration.scope);
const serviceWorkerUrl = new URL(self.location.href);
const appVersion = serviceWorkerUrl.searchParams.get("appVersion") || "dev";
const cachePrefix = "mahjong-pwa";
const shellCacheName = `${cachePrefix}-shell-${appVersion}`;
const assetCacheName = `${cachePrefix}-asset-${appVersion}`;
const appShellCacheKey = new Request(new URL("./", scopeUrl).toString(), { cache: "reload" });
const shellPrecacheUrls = [
  "./",
  "./pwa/icon-192.png",
  "./pwa/icon-512.png",
  "./pwa/icon-maskable-192.png",
  "./pwa/icon-maskable-512.png",
  "./pwa/apple-touch-icon-180.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(shellCacheName);
      await cache.addAll(shellPrecacheUrls);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith(`${cachePrefix}-`) && name !== shellCacheName && name !== assetCacheName)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  if (shouldHandleAssetRequest(requestUrl)) {
    event.respondWith(handleAssetRequest(request));
  }
});

async function handleNavigationRequest(request) {
  const cache = await caches.open(shellCacheName);

  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) {
      await cache.put(appShellCacheKey, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(appShellCacheKey);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function handleAssetRequest(request) {
  const cache = await caches.open(assetCacheName);
  const cached = await cache.match(request, { ignoreSearch: false });
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response && response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

function shouldHandleAssetRequest(requestUrl) {
  if (requestUrl.pathname.endsWith("/site.webmanifest")) {
    return false;
  }

  return (
    requestUrl.pathname.includes("/assets/") ||
    requestUrl.pathname.includes("/pwa/") ||
    requestUrl.pathname.endsWith(".css") ||
    requestUrl.pathname.endsWith(".js") ||
    requestUrl.pathname.endsWith(".png") ||
    requestUrl.pathname.endsWith(".svg")
  );
}
