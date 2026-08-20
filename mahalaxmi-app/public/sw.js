// Mahalaxmi Stock Engine service worker
//
// Goal: once installed as an app (Android/desktop "Add to Home Screen"),
// reopening it should be near-instant instead of a full network fetch of
// every JS/CSS asset from scratch, and it should still open (to a "you're
// offline" -friendly shell) if there's no connection at that moment.
//
// Strategy:
//  - HTML (the app shell, "/"): network-first, falling back to cache if
//    offline. Always prefer the latest build when there's a connection;
//    the cached copy is just a safety net.
//  - Hashed build assets (/assets/*.js, /assets/*.css from Vite) and the
//    icons/manifest: cache-first. Vite content-hashes these filenames on
//    every build, so a cached copy is always safe to serve — once a new
//    version ships, it's referenced by new hashed filenames and simply
//    gets fetched fresh the first time.
//
// Bump CACHE_VERSION whenever you want to force-clear old cached assets
// (rarely needed in practice, since hashed filenames already handle this).
const CACHE_VERSION = "stockengine-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

const SHELL_URLS = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png", "/icon-512-maskable.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // let cross-origin (Supabase API etc.) pass through untouched

  // App shell HTML: network-first so you always get the latest deploy when
  // online, cache as a fallback for instant load when offline/discarded.
  if (request.mode === "navigate" || url.pathname === "/") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Hashed static assets (JS/CSS/icons): cache-first, fetch-and-cache on miss.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
