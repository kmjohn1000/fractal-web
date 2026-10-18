# Visual regression suite

```
npm run test:visual                                   # everything, ~3.5 min
npm run test:visual -- --project=webkit-iphone15      # one browser/size
npm run test:visual -- -g "Seahorse"                  # matching tests only
npm run test:visual -- --update-snapshots=all -g X    # re-record X's baselines
```

Playwright (`playwright.config.mjs`) loads the app in four projects
(Chromium and WebKit, each at 1280x800 desktop and iPhone 15) and puts it in
every state the app lists: each fractal and pattern, each colormap, and
each Surprise-me place (read from `app.js`/`colormaps.js` by `cases.mjs`, so
new ones are picked up automatically). For each state, once the frame has
settled (every supersample blended in, every IFS point plotted), it fails
if:

- the WebGL context was lost, an uncaught error fired, or the error
  banner is showing;
- the frame is blank: one color covers more than 99.5% of the canvas;
- the canvas is off-center, its drawing buffer doesn't match its shape,
  or the toolbar overlaps it;
- the screenshot differs from the golden baseline in
  `tests/baselines/<project>/` by more than 1% of pixels.

`sw.spec.mjs` checks the freshness stamps `npm run stamp` writes: `sw.js`'s
`CACHE_NAME` matches the app files, and `package.json` and `index.html`'s
`?v=` queries carry the CHANGELOG version. It also checks that `APP_SHELL`
lists everything `index.html` loads and that the installed web app starts
offline.

`scripts/test-visual.mjs` kills leftover Playwright browsers and test
servers before and after each run and runs with stdin closed. The git
pre-push hook (`.githooks/pre-push`, turned on by `npm install`) runs the
suite unless the push only touches docs; `SKIP_VISUAL=1 git push` skips it.
Failures leave diffs in `test-results/report/index.html`.

## Baselines

The baselines are about 200 MB of PNGs, so they're git-ignored and stay
on this machine. Re-record a baseline only for an intentional change, and
look at it before trusting it. If the folder is lost, check out a commit
you know is good and run `npm run test:visual -- --update-snapshots=missing`.
GPU output differs between machines, so baselines from one Mac won't
match another.
