const CACHE_NAME = "simpletodo-cache-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./assets/icon-192.svg",
  "./assets/icon-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((oldKey) => caches.delete(oldKey))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);

  // Never cache API calls containing sensitive request headers.
  if (requestUrl.origin.includes("api.groq.com")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Production perf mode:
  // Cache-first for same-origin app files for instant startup,
  // while revalidating in background to keep cache fresh.
  if (requestUrl.origin === self.location.origin) {
    event.respondWith(cacheFirstWithBackgroundUpdate(event.request));
    return;
  }

  // External assets (e.g., fonts): cache-first for speed + offline support.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        event.waitUntil(updateCacheFromNetwork(event.request));
        return cached;
      }
      return fetch(event.request)
        .then((response) => {
          if (isCacheableResponse(response)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          new Response("Offline", {
            status: 503,
            statusText: "Offline",
            headers: { "Content-Type": "text/plain" },
          })
        );
    })
  );
});

async function cacheFirstWithBackgroundUpdate(request) {
  const cached = await caches.match(request);
  if (cached) {
    // Refresh in background; user still gets instant response.
    updateCacheFromNetwork(request);
    return cached;
  }

  try {
    const networkResponse = await fetch(request);
    if (isCacheableResponse(networkResponse)) {
      const clone = networkResponse.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
    }
    return networkResponse;
  } catch {
    if (request.mode === "navigate") {
      const shell = await caches.match("./index.html");
      if (shell) return shell;
    }
    return new Response("Offline", {
      status: 503,
      statusText: "Offline",
      headers: { "Content-Type": "text/plain" },
    });
  }
}

async function updateCacheFromNetwork(request) {
  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      const clone = response.clone();
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, clone);
    }
  } catch {
    // Keep existing cached version when network is unavailable.
  }
}

function isCacheableResponse(response) {
  if (!response) return false;
  if (response.status === 200) return true;
  // Opaque responses (status 0), common for cross-origin fonts/CDN.
  return response.type === "opaque";
}
