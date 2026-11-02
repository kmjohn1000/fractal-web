// The share menu (share.js, with the Save, Copy and Share… handlers in app.js): opening it starts a
// capture, the options hand out a PNG, the share link or the system share sheet, and the menu closes
// again. Plain behavior checks, no screenshots. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

/* global buildShareUrl, pendingCapture, els */

const DRIVER = new URL("../driver.js", import.meta.url).pathname;
const PNG_MAGIC = [137, 80, 78, 71, 13, 10, 26, 10];

let pageErrors = [];

// stubs: browser APIs the page would otherwise hand to the OS, replaced before the app loads.
async function load(page, { stubs = "" } = {}) {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript((code) => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
    } catch { /* storage blocked */ }
    if (code) new Function(code)();
  }, stubs);
  await page.goto("index.html");
  await page.addScriptTag({ path: DRIVER });
  await page.waitForFunction(() => window["__vt"].settled(), null, { timeout: 90_000, polling: 50 });
}

const CLIPBOARD_STUB = `
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { window["__copied"] = t; } } });
`;
const SHARE_STUB = `
  navigator.canShare = () => true;
  navigator.share = async (d) => {
    window["__shared"] = { title: d.title, url: d.url, text: d.text, files: (d.files || []).map((f) => ({ name: f.name, type: f.type, size: f.size })) };
  };
`;

const menu = (page) => page.locator("#shareMenu");
const shareBtn = (page) => page.locator("#shareBtn");

async function openMenu(page, button = shareBtn(page)) {
  await button.click();
  await expect(menu(page)).toHaveClass(/\bopen\b/);
}

// The capture the menu started when it opened, described: bytes of a PNG and the size of its canvas.
const describeCapture = (page, canvasId) => page.evaluate(async (id) => {
  const blob = await pendingCapture;
  const head = Array.from(new Uint8Array(await blob.slice(0, 8).arrayBuffer()));
  const bmp = await createImageBitmap(blob);
  return { type: blob.type, size: blob.size, head, w: bmp.width, h: bmp.height, cw: els[id].width, ch: els[id].height };
}, canvasId);

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

test("opening the menu starts a capture: a PNG the size of the canvas", async ({ page }) => {
  await load(page);
  await expect(menu(page)).not.toHaveClass(/\bopen\b/);
  await openMenu(page);
  const c = await describeCapture(page, "mainCanvas");
  expect(c.type).toBe("image/png");
  expect(c.head).toEqual(PNG_MAGIC);
  expect(c.size).toBeGreaterThan(2000);
  expect([c.w, c.h]).toEqual([c.cw, c.ch]);
});

test("a pattern mode captures its own canvas", async ({ page }) => {
  await load(page);
  await page.evaluate(() => window["__vt"].mode("koch"));
  await openMenu(page, page.locator("#kochShareBtn"));
  const c = await describeCapture(page, "kochCanvas");
  expect(c.head).toEqual(PNG_MAGIC);
  expect([c.w, c.h]).toEqual([c.cw, c.ch]);
});

test("the Share button again, Escape, or a tap elsewhere closes the menu", async ({ page }) => {
  await load(page);
  await openMenu(page);
  await shareBtn(page).click();
  await expect(menu(page)).not.toHaveClass(/\bopen\b/);

  await openMenu(page);
  await page.keyboard.press("Escape");
  await expect(menu(page)).not.toHaveClass(/\bopen\b/);

  await openMenu(page);
  await page.mouse.click(8, 8);
  await expect(menu(page)).not.toHaveClass(/\bopen\b/);
});

test("Save image downloads a PNG named for the fractal and closes the menu", async ({ page }) => {
  await load(page);
  await openMenu(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#shareSaveBtn").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^fractal-web-.+-\d{4}-\d\d-\d\d\.png$/);
  expect(Array.from(readFileSync(await download.path()).subarray(0, 8))).toEqual(PNG_MAGIC);
  await expect(menu(page)).not.toHaveClass(/\bopen\b/);
});

test("Copy link copies the current share link, says so, then restores the label and closes", async ({ page }) => {
  await load(page, { stubs: CLIPBOARD_STUB });
  await openMenu(page);
  const copy = page.locator("#shareCopyBtn");
  await expect(copy).toHaveText("Copy link");
  await copy.click();
  await expect(copy).toHaveText("Copied!");
  const [copied, link] = await page.evaluate(() => [window["__copied"], buildShareUrl()]);
  expect(copied).toBe(link);
  expect(copied).toContain("#v=1");
  await expect(copy).toHaveText("Copy link", { timeout: 5000 });
  await expect(menu(page)).not.toHaveClass(/\bopen\b/);
});

test("Share… is offered only where the browser can share, and hands over the image and link", async ({ page }) => {
  await load(page, { stubs: SHARE_STUB });
  await openMenu(page);
  const native = page.locator("#shareNativeBtn");
  await expect(native).toBeVisible();
  await native.click();
  await expect(menu(page)).not.toHaveClass(/\bopen\b/);
  await expect.poll(() => page.evaluate(() => window["__shared"] ?? null)).not.toBeNull();
  const [shared, link] = await page.evaluate(() => [window["__shared"], buildShareUrl()]);
  expect(shared.title).toBe("Fractal Atlas");
  expect(shared.url).toBe(link);
  expect(shared.files).toHaveLength(1);
  expect(shared.files[0].type).toBe("image/png");
  expect(shared.files[0].name).toMatch(/\.png$/);
  expect(shared.files[0].size).toBeGreaterThan(2000);
});

test("Share… is hidden when the browser has no share sheet", async ({ page }) => {
  await load(page, { stubs: "delete Navigator.prototype.share; delete navigator.share; delete Navigator.prototype.canShare;" });
  await openMenu(page);
  expect(await page.evaluate(() => "share" in navigator)).toBe(false);
  await expect(page.locator("#shareNativeBtn")).toBeHidden();
});
