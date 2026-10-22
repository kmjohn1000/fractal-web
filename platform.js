"use strict";

// Web vs. native (Capacitor iOS app) implementations of anything
// platform-specific -- saving and sharing. app.js calls only these and
// never checks the platform itself (see CLAUDE.md). The same files serve
// GitHub Pages and the iOS app; inside the app, Capacitor's injected bridge
// defines window.Capacitor before any page script runs.
const Platform = (() => {
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  // Where share links point: the page itself on the web, the public site in
  // the app (whose own origin, capacitor://localhost, means nothing to
  // anyone the link is sent to).
  const PUBLIC_URL = "https://kmjohn1000.github.io/fractal-web/";
  const shareBaseUrl = () => (isNative ? PUBLIC_URL : location.origin + location.pathname + location.search);

  // ------------------------------------------------------------ native

  // registerPlugin() lives in capacitor.js, which scripts/build-www.mjs
  // copies into the app bundle only -- the web never requests it. Loaded on
  // first use: hiding the launch screen after the first frame, then taps.
  let pluginsPromise = null;
  function plugins() {
    if (!pluginsPromise) {
      pluginsPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "capacitor.js";
        s.onload = () => {
          const reg = window.Capacitor.registerPlugin;
          resolve({
            Share: reg("Share"),
            Haptics: reg("Haptics"),
            Filesystem: reg("Filesystem"),
            SavePhoto: reg("SavePhoto"), // app-local, ios/App/App/FractalBridgeViewController.swift
            SplashScreen: reg("SplashScreen"),
            App: reg("App"),
          });
        };
        s.onerror = () => reject(new Error("capacitor.js failed to load"));
        document.head.appendChild(s);
      });
    }
    return pluginsPromise;
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  // Share.share rejects with this message when the sheet is dismissed.
  const isNativeCancel = (err) => /cancel/i.test(err && err.message ? err.message : "");

  // ------------------------------------------------------------ web

  const webCanShareFiles = (() => {
    try {
      return !!(navigator.share && navigator.canShare
        && navigator.canShare({ files: [new File([""], "probe.png", { type: "image/png" })] }));
    } catch {
      return false;
    }
  })();

  function webDownload(blob, fileName) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke after the click has handed the blob to the download.
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // The app's launch screen (ios/App/App/Base.lproj/LaunchScreen.storyboard)
  // stays up until hideLaunchScreen() -- capacitor.config.json sets
  // launchAutoHide false -- so launch fades straight into a drawn fractal
  // instead of a blank web view. The fallback timer only guarantees it still
  // goes away if app.js throws before its first frame -- it's generous
  // because a debug build under Xcode's debugger on the iPad simulator took
  // ~4.6s to first paint, and a 3s fallback hid the launch screen too early
  // (black screen until the fractal appeared).
  // It also waits for a launch link (see onOpenUrl) to be applied, so an app
  // opened from a shared link fades into that view, not the default one.
  let launchScreenHidden = false;
  let launchUrlHandled = Promise.resolve();
  function hideLaunchScreen() {
    if (!isNative || launchScreenHidden) return;
    launchScreenHidden = true;
    launchUrlHandled
      .then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      .then(() => plugins())
      .then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 200 }))
      .catch(() => {});
  }
  // The fallback must not go through hideLaunchScreen: that sets the flag
  // before awaiting launchUrlHandled/plugins(), so if either stalls, a
  // second call would return early and the launch screen would never leave.
  function forceHideLaunchScreen() {
    plugins().then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 200 })).catch(() => {});
  }

  // Universal links: a tapped https://kmjohn1000.github.io/fractal-web/#...
  // share link opens the app (ios/App/App/App.entitlements; the domain's
  // apple-app-site-association lives in the kmjohn1000.github.io repo) and
  // arrives here with its #hash intact. getLaunchUrl covers a cold start,
  // appUrlOpen a link tapped while the app is already running. No-op on the
  // web, where the link simply loads the page with its hash.
  function onOpenUrl(handler) {
    if (!isNative) return;
    const p = plugins();
    // On a cold start the plugin reports the launch link twice: once via
    // getLaunchUrl and again as a retained appUrlOpen event. Apply it once.
    let launchUrl = null;
    launchUrlHandled = p
      .then(({ App }) => App.getLaunchUrl())
      .then((res) => { if (res && res.url) { launchUrl = res.url; handler(res.url); } })
      .catch(() => {});
    p.then(({ App }) => App.addListener("appUrlOpen", (e) => {
      if (e.url === launchUrl) { launchUrl = null; return; }
      handler(e.url);
    })).catch(() => {});
  }
  if (isNative) setTimeout(forceHideLaunchScreen, 10000);

  // CSS hook for layout that only the website wants (index.html scopes the
  // wide-screen toolbar cap to html.web, so the app's iPad layout is
  // untouched).
  document.documentElement.classList.toggle("web", !isNative);

  // First-visit state for the website's cold open and welcome card. The app
  // never flies or shows the card: isFirstVisit() is false and isDismissed()
  // is true there. localStorage can throw (private mode, blocked storage);
  // a failed read counts as a return visit that hasn't dismissed the card,
  // so nothing flies but the card still shows.
  const VISITED_KEY = "fractalAtlas.visited";
  const DISMISSED_KEY = "fractalAtlas.welcomeDismissed";
  const readFlag = (key) => {
    try { return localStorage.getItem(key) === "1"; } catch { return null; }
  };
  const writeFlag = (key) => {
    try { localStorage.setItem(key, "1"); } catch { /* storage blocked: stay stateless */ }
  };
  const welcome = {
    isFirstVisit: () => !isNative && readFlag(VISITED_KEY) === false,
    markVisited: () => { if (!isNative) writeFlag(VISITED_KEY); },
    isDismissed: () => isNative || readFlag(DISMISSED_KEY) === true,
    dismiss: () => writeFlag(DISMISSED_KEY),
  };

  // ------------------------------------------------------------ API

  return {
    isNative,
    shareBaseUrl,
    hideLaunchScreen,
    onOpenUrl,
    welcome,

    saveImageLabel: isNative ? "Save to Photos" : "Save image",

    // Whether to offer "Share…" at all.
    canShare: isNative || !!navigator.share,

    // Web: downloads the PNG. App: saves it to Photos. Resolves true once
    // saved (the app can confirm; a web download gives no signal).
    async saveImage(blob, fileName) {
      if (!isNative) {
        webDownload(blob, fileName);
        return false;
      }
      const { SavePhoto, Haptics } = await plugins();
      await SavePhoto.save({ data: await blobToBase64(blob) });
      Haptics.notification({ type: "SUCCESS" }).catch(() => {});
      return true;
    },

    // System share sheet with the image (where supported) and link.
    // Resolves quietly if the user dismisses the sheet.
    // `text` is for sharing words alone (the diagnostics report); a link
    // share leaves it out.
    async share({ blob, fileName, url, title, text }) {
      if (!isNative) {
        try {
          if (webCanShareFiles && blob) {
            const file = new File([blob], fileName, { type: "image/png" });
            await navigator.share({ files: [file], title, text: url, url });
          } else {
            await navigator.share({ title, text, url });
          }
        } catch (err) {
          if (err && err.name === "AbortError") return;
          throw err;
        }
        return;
      }
      const { Share, Filesystem } = await plugins();
      const files = [];
      if (blob) {
        const written = await Filesystem.writeFile({
          path: fileName, data: await blobToBase64(blob), directory: "CACHE",
        });
        files.push(written.uri);
      }
      try {
        await Share.share({ title, text, url, files });
      } catch (err) {
        if (isNativeCancel(err)) return;
        throw err;
      }
    },
  };
})();
