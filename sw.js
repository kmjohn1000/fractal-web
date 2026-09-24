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
    // {cache: "no-cache"} forces revalidation with the server instead of
    // silently accepting the browser's own HTTP cache — GitHub Pages sends
    // Cache-Control: max-age=600, so a plain fetch(event.request) here
    // could still return a stale app.js alongside a fresh index.html (or
    // the reverse) for up to 10 minutes after a push, which breaks startup
    // whenever a commit changes element IDs between the two files (as one
    // already did). Revalidation is cheap: GitHub Pages returns 304s with
    // ETags, so this doesn't cost a full re-download when nothing changed.
    fetch(event.request.url, { cache: "no-cache" })
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          // Without waitUntil, the worker can be torn down right after
          // respondWith's promise resolves, before this un-awaited write
          // finishes — silently skipping the offline copy.
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
