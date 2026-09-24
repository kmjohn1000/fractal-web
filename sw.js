"use strict";

// Network-first app-shell service worker. This app has no backend/API, and
// gets pushed to GitHub Pages on every change (see ../CLAUDE.md) — a
// cache-first strategy was tried initially but meant an already-installed
// phone PWA would silently keep serving whatever was cached at first
// install forever, since the browser only re-checks a service worker when
// sw.js's own bytes change, and this file went untouched across many
// feature commits. Network-first fixes that: every load fetches fresh code
// when online (so "open the app" == "get the latest push"), and only falls
// back to the cache when there's no network, which is still enough for
// real offline support since every asset here is static.
const CACHE_NAME = "fractal-explorer-v2";

const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./shaders.js",
  "./colormaps.js",
  "./koch.js",
  "./pythagoras.js",
  "./dragon.js",
  "./fern.js",
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
    fetch(event.request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
