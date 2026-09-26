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
  // instead of a blank web view. The fallback timer guarantees it still
  // goes away if app.js throws before its first frame.
  let launchScreenHidden = false;
  function hideLaunchScreen() {
    if (!isNative || launchScreenHidden) return;
    launchScreenHidden = true;
    plugins().then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 200 })).catch(() => {});
  }
  if (isNative) setTimeout(hideLaunchScreen, 3000);

  // ------------------------------------------------------------ API

  return {
    isNative,
    shareBaseUrl,
    hideLaunchScreen,

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
    async share({ blob, fileName, url, title }) {
      if (!isNative) {
        try {
          if (webCanShareFiles && blob) {
            const file = new File([blob], fileName, { type: "image/png" });
            await navigator.share({ files: [file], title, text: url, url });
          } else {
            await navigator.share({ title, url });
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
        await Share.share({ title, url, files });
      } catch (err) {
        if (isNativeCancel(err)) return;
        throw err;
      }
    },
  };
})();
