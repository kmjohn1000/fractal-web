"use strict";

// Cache-first app-shell service worker. This app has no backend/API — every
// asset is static and versioned by this cache name, so offline support is
// close to "free": precache the shell on install, serve from cache first,
// and fall back to network only for anything not yet cached (then cache it).
//
// Bump CACHE_NAME on any release to invalidate old caches; activate() cleans
// up stale versions automatically.
const CACHE_NAME = "fractal-explorer-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./shaders.js",
  "./colormaps.js",
  "./koch.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
