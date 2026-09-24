# CLAUDE.md — fractal-web

Browser/PWA port of `../fractal/`'s Mandelbrot/Julia/Newton/Koch explorer. WebGL fragment shaders for rendering, perturbation theory for deep zoom past the float32 precision wall (`DEEP_ZOOM_THRESHOLD` in `app.js`).

## Deploy workflow

Deployed as a static site on GitHub Pages: **https://kmjohn1000.github.io/fractal-web/** (repo `kmjohn1000/fractal-web`, public — required for free Pages hosting on a personal account). Served straight from the `main` branch root; GitHub rebuilds and redeploys automatically on every push, live within ~30-60s. No build step.

**After any change here, commit and push right away** so the live site stays in sync with what's being worked on:
```
git add -A && git commit -m "..." && git push
```
Follow the root CLAUDE.md's Git Hygiene section for commit granularity/messages — this just adds "and push" as the default next step for this repo specifically.

## Dev/testing

`python3 nocache_server.py` (port 8743) serves the app locally with caching disabled, for testing on the phone over LAN (`http://<lan-ip>:8743`). Service worker registration and install prompts are **silent no-ops** there — service workers only register on HTTPS or localhost, so PWA install/offline behavior can only be verified on the deployed GitHub Pages URL, not the LAN dev server. This is expected, not a bug.

## Feature conventions

- **Every new fractal/mode must support the two-finger twist rotation gesture**, matching whatever existing fractals already do. WebGL fractal types get this for free from `attachFractalInteraction`/the shared `u_rotation` shader uniform. Canvas2D vector modes (Koch, tree, dragon, fern) get it for free from `attachVectorViewInteraction` as long as the view's `worldToScreen`/`screenToWorld` are rotation-aware and its `view` object has a `rotation` field — copy that pattern for any new vector view rather than reinventing pan/zoom.

## TODO.md workflow

- **When the user suggests an idea, add it to `TODO.md` right away** — don't ask whether to. Adding it isn't approval to build it; the TODO list is for ideas not yet approved for implementation.
- **When a commit delivers something listed in `TODO.md`, mark that entry complete right after the commit**: move it to the `## Done` section at the bottom with the commit hash, and commit + push that update.
