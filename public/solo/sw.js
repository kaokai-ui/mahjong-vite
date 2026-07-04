const scopeUrl = new URL(self.registration.scope);
const serviceWorkerUrl = new URL(self.location.href);
const appVersion = serviceWorkerUrl.searchParams.get("appVersion") || "dev";
const cachePrefix = "mahjong-solo-pwa";
const shellCacheName = `${cachePrefix}-shell-${appVersion}`;
const assetCacheName = `${cachePrefix}-asset-${appVersion}`;
const shellPrecacheUrls = [
  "./",
  "../pwa/sologame-icon-192.png",
  "../pwa/sologame-icon-512.png",
  "../pwa/sologame-icon-maskable-192.png",
  "../pwa/sologame-icon-maskable-512.png",
  "../pwa/sologame-apple-touch-icon-180.png",
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
  const navigationCacheKey = createNavigationCacheKey(request.url);

  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) {
      await cache.put(navigationCacheKey, response.clone());
    }
    return response;
  } catch (error) {
    const cached = (await cache.match(navigationCacheKey)) || (await cache.match(createNavigationCacheKey(scopeUrl)));
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function handleAssetRequest(request) {
  const assetCache = await caches.open(assetCacheName);
  // Icons are precached (into the shell cache) without a query string, but the
  // HTML requests them versioned with "?appVersion=". Use ignoreSearch and also
  // consult the shell cache so those precached icons actually match offline.
  const cached =
    (await assetCache.match(request, { ignoreSearch: true })) ||
    (await (await caches.open(shellCacheName)).match(request, { ignoreSearch: true }));
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response && response.ok) {
    await assetCache.put(request, response.clone());
  }
  return response;
}

function shouldHandleAssetRequest(requestUrl) {
  if (requestUrl.pathname.endsWith(".webmanifest")) {
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

function createNavigationCacheKey(url) {
  const requestUrl = new URL(url);
  const normalizedUrl = new URL(requestUrl.pathname, scopeUrl);
  return new Request(normalizedUrl.toString(), { cache: "reload" });
}
