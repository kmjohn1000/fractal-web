// The share menu and the share image: the PNG of the current view with its wordmark, the menu that opens
// from every Share button (Save image, Copy link, Share…) and the handlers behind those three options.
// Needs the state, render-layout.js (the capture waits on refinement), vector-interaction.js (the vector canvases)
// and share.js (buildShareUrl). Split from share.js (the menu and image, a pure move) and app.js (the
// option handlers); nothing imports this file, app.js only lists it for the test hook.
// An ES module: every top-level declaration is exported (test-hooks.js and app.js rely on it) and
// the other converted files' names are imported, with the same ?v= query everywhere (npm run stamp).
import { Platform } from "./platform.js?v=1.62.2";
import { fractalLabel, slugify } from "./configs.js?v=1.62.2";
import { Diag } from "./diag.js?v=1.62.2";
import { isIfsMode } from "./fractal-defs.js?v=1.62.2";
import { currentName, dualActive, els, fernView, isInteracting, kochView, mainRenderer, mode } from "./state.js?v=1.62.2";
import { modeLabel } from "./hud.js?v=1.62.2";
import { finishRefinement, refineDone, renderAll } from "./render-layout.js?v=1.62.2";
import { VECTOR_VIEWS } from "./vector-interaction.js?v=1.62.2";
import { buildShareUrl } from "./share.js?v=1.62.2";
import { reviewMaybeAsk } from "./review-prompt.js?v=1.62.2";

// ---------------------------------------------------------------- share: image + menu

export function shareFileName() {
  const label = mode === "fractal" ? fractalLabel(currentName) : modeLabel(mode);
  const slug = slugify(label);
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `fractal-web-${slug}-${date}.png`;
}

export function waitUntil(cond, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => (cond() || performance.now() - t0 > timeoutMs ? resolve() : requestAnimationFrame(tick));
    tick();
  });
}

// Dual mode: both panes onto one canvas in the layout actually on screen
// (layoutCanvasArea's "stacked" = main above Julia, otherwise side by side),
// with #canvasArea's 2px black gap between them.
export function compositeDualCanvas() {
  const a = els.mainCanvas, b = els.juliaCanvas;
  const stacked = els.canvasArea.classList.contains("stacked");
  const gap = Math.round(2 * mainRenderer.dpr);
  const out = document.createElement("canvas");
  out.width = stacked ? Math.max(a.width, b.width) : a.width + gap + b.width;
  out.height = stacked ? a.height + gap + b.height : Math.max(a.height, b.height);
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(a, 0, 0);
  ctx.drawImage(b, stacked ? 0 : a.width + gap, stacked ? a.height + gap : 0);
  return out;
}

// A copy of src with the "Fractal Atlas™" wordmark in a dark translucent
// pill, bottom-right. Drawn on the export only, never the live canvas. The
// pill (not bare or shadowed text) keeps it legible on any colormap,
// including flat light or flat dark regions. Sized off the image's short
// side so it looks the same on a phone and an iPad export.
export function watermarkedCopy(src) {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  ctx.drawImage(src, 0, 0);

  const text = "Fractal Atlas™";
  const fontPx = Math.max(12, Math.round(Math.min(out.width, out.height) * 0.03));
  ctx.font = `600 ${fontPx}px -apple-system, system-ui, "Helvetica Neue", sans-serif`;
  const h = Math.round(fontPx * 1.9);
  const w = Math.round(ctx.measureText(text).width + fontPx * 1.5);
  const margin = Math.round(fontPx * 0.9);
  const x = out.width - margin - w, y = out.height - margin - h, r = h / 2;

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fill();
  // Hairline edge so the pill still reads against a flat black export.
  ctx.lineWidth = Math.max(1, fontPx / 16);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, y + h / 2 + fontPx * 0.04);
  return out;
}

// PNG of the current view, taken only once progressive refinement has
// finished (fractal supersampling, fern point fill) -- or after 3s, so a
// slow device or an ongoing gesture can't hang it. Koch/tree/dragon draw
// synchronously and are captured immediately. Every export path (Save
// image, Save to Photos, Share…) goes through here, so all get the
// watermark.
export async function captureShareBlob() {
  if (mode === "fractal") {
    finishRefinement();
    await waitUntil(() => refineDone && !isInteracting, 3000);
  }
  else if (isIfsMode(mode)) {
    // A chaos-game replay under way (or paused): the picture saved is the finished normal frame.
    if (fernView.replaying) { fernView.cancelReplay(); renderAll(); }
    await waitUntil(() => !fernView.refining, 3000);
  }
  else if (mode === "koch" && kochView.growing) {
    // A generation still growing in: the picture saved is the finished one.
    kochView.cancelGrow();
    renderAll();
  }
  const canvas = watermarkedCopy(mode !== "fractal" ? VECTOR_VIEWS[mode][1] : dualActive ? compositeDualCanvas() : els.mainCanvas);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob failed"))), "image/png");
  });
}

els.shareNativeBtn.classList.toggle("hidden", !Platform.canShare);

// Capture starts when the menu opens, not when an option is tapped: iOS
// Safari only allows navigator.share() close to the user's tap, so the PNG
// should already be ready by then.
export let pendingCapture = null;
export function closeShareMenu() { els.shareMenu.classList.remove("open"); }
document.querySelectorAll(".shareBtn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation(); // don't let the outside-click closer below fire on this same tap
    els.fractalTypeRow.classList.remove("open");
    els.colorSheet.classList.remove("open");
    els.placesSheet.classList.remove("open");
    const opening =!els.shareMenu.classList.contains("open");
    els.shareMenu.classList.toggle("open", opening);
    if (opening) {
      pendingCapture = captureShareBlob();
      pendingCapture.catch(() => {}); // surfaced when an option actually uses it
    }
  });
});
document.addEventListener("pointerdown", (e) => {
  if (!els.shareMenu.classList.contains("open")) return;
  if (els.shareMenu.contains(e.target) || e.target.closest(".shareBtn")) return;
  closeShareMenu();
});

// ---------------------------------------------------------------- share: the three options

export function flashLabel(btn, text) {
  const original = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = original; closeShareMenu(); }, 1500);
}

els.shareSaveBtn.textContent = Platform.saveImageLabel;
els.shareSaveBtn.addEventListener("click", async () => {
  try {
    const saved = await Platform.saveImage(await pendingCapture, shareFileName());
    if (saved) {
      flashLabel(els.shareSaveBtn, "Saved!");
      reviewMaybeAsk(); // the app, after a few days of use: iOS may ask for a rating (review-prompt.js)
    } else closeShareMenu();
  } catch (err) {
    closeShareMenu();
    reportError(`Save image failed: ${err && err.message ? err.message : err}`);
  }
});

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // navigator.clipboard needs a secure context (not the LAN dev server).
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

Diag.setCopy(copyText);
if (Platform.canShare) Diag.setShare((text) => Platform.share({ title: "Fractal Atlas diagnostics", text }));

els.shareCopyBtn.addEventListener("click", async () => {
  const ok = await copyText(buildShareUrl());
  flashLabel(els.shareCopyBtn, ok ? "Copied!" : "Copy failed");
});

els.shareNativeBtn.addEventListener("click", async () => {
  const url = buildShareUrl();
  closeShareMenu();
  try {
    const shared = await Platform.share({ blob: await pendingCapture, fileName: shareFileName(), url, title: "Fractal Atlas" });
    if (shared) reviewMaybeAsk(); // not when the sheet was dismissed
  } catch (err) {
    reportError(`Share failed: ${err && err.message ? err.message : err}`);
  }
});
