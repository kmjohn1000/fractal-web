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
const CACHE_NAME = "fractal-atlas-295e2610e02d";

const APP_SHELL = [
  "./",
  "./index.html",
  "./configs.js",
  "./places.js",
  "./fractal-defs.js",
  "./deepzoom.js",
  "./renderer.js",
  "./state.js",
  "./state-colors.js",
  "./render-layout.js",
  "./modes.js",
  "./interaction.js",
  "./compass-ui.js",
  "./teleport.js",
  "./colormap-picker.js",
  "./color-sheet.js",
  "./places-sheet.js",
  "./test-hooks.js",
  "./share.js",
  "./share-menu.js",
  "./app.js",
  "./shaders.js",
  "./colormaps.js",
  "./vectorgeom.js",
  "./koch.js",
  "./pythagoras.js",
  "./hexaflake.js",
  "./dragon.js",
  "./fern.js",
  "./chaos-run.js",
  "./lsystem.js",
  "./view-math.js",
  "./hud.js",
  "./color-styles.js",
  "./hud-format.js",
  "./platform.js",
  "./diag.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/thumbs/apollonian.webp",
  "./icons/thumbs/arrowhead.webp",
  "./icons/thumbs/burn-ship.webp",
  "./icons/thumbs/carpet.webp",
  "./icons/thumbs/celtic.webp",
  "./icons/thumbs/dragon.webp",
  "./icons/thumbs/fern.webp",
  "./icons/thumbs/gasket.webp",
  "./icons/thumbs/gosper.webp",
  "./icons/thumbs/hexaflake.webp",
  "./icons/thumbs/hilbert.webp",
  "./icons/thumbs/julia-dragon.webp",
  "./icons/thumbs/julia-phoenix.webp",
  "./icons/thumbs/julia-rabbit.webp",
  "./icons/thumbs/julia-spiral.webp",
  "./icons/thumbs/koch.webp",
  "./icons/thumbs/levy.webp",
  "./icons/thumbs/mandelbrot.webp",
  "./icons/thumbs/multibrot3.webp",
  "./icons/thumbs/newton-z3.webp",
  "./icons/thumbs/nova.webp",
  "./icons/thumbs/pentagon.webp",
  "./icons/thumbs/phoenix.webp",
  "./icons/thumbs/sierpinski.webp",
  "./icons/thumbs/tree.webp",
  "./icons/thumbs/tricorn.webp",
  "./icons/thumbs/vicsek.webp",
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
      // ignoreSearch: index.html loads app files as app.js?v=<version>
      // (scripts/stamp.mjs), while APP_SHELL precaches them as app.js.
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
