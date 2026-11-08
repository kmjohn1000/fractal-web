// Phoenix's drag preview (1.80.3): a drag at any depth moves the last frame (renderPreview) instead of drawing the
// float32 shader live (render), because a live Phoenix frame costs more than a 60 fps frame on a phone and was drawn
// inside the touch handler, so it held up the other controls too. Mandelbrot above its deep threshold keeps its live
// frames (the control test). Plain behavior checks, no screenshot baselines: they count the calls to the renderer
// during the drag and after it.
import { test, expect } from "@playwright/test";

/* global selectFractal, mainState, mainRenderer */

let pageErrors = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript(() => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
    } catch { /* storage blocked */ }
  });
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("index.html");
  await page.waitForFunction(() => typeof selectFractal === "function" && typeof mainRenderer === "object");
});

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

// Drags across the main canvas with the mouse (pointer events, the same path as a finger), counting renderer calls
// while the button is down and again once it is up and the view has settled.
async function dragCounts(page) {
  await page.evaluate(() => {
    window.__calls = { render: 0, preview: 0 };
    const render = mainRenderer.render, preview = mainRenderer.renderPreview;
    mainRenderer.render = (...a) => { window.__calls.render++; return render.apply(mainRenderer, a); };
    mainRenderer.renderPreview = (...a) => { window.__calls.preview++; return preview.apply(mainRenderer, a); };
  });
  const box = await page.locator("#mainCanvas").boundingBox();
  const x0 = box.x + box.width * 0.5, y0 = box.y + box.height * 0.4;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.evaluate(() => { window.__calls.render = 0; window.__calls.preview = 0; }); // only the moves count
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(x0 + i * 8, y0 + i * 3);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  }
  const during = await page.evaluate(() => ({ ...window.__calls }));
  await page.mouse.up();
  await page.waitForTimeout(1500); // the settle timer draws the accurate frame
  const after = await page.evaluate(() => ({ ...window.__calls }));
  return { during, after };
}

for (const name of ["Phoenix", "Julia:Phoenix"]) {
  test(`${name}: a drag at the opening view moves the last frame and draws the real one once you stop`, async ({ page }) => {
    await page.evaluate((n) => selectFractal(n), name);
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => mainState.scale), "a shallow view, above Phoenix's deep threshold").toBeGreaterThan(1e-4);
    const r = await dragCounts(page);
    expect(r.during.preview, "the drag drew previews").toBeGreaterThan(0);
    expect(r.during.render, "and no live frames").toBe(0);
    expect(r.after.render, "the accurate frame is drawn after the drag").toBeGreaterThan(0);
  });
}

test("Mandelbrot at the opening view still draws live frames while dragging (unchanged)", async ({ page }) => {
  await page.waitForTimeout(1500);
  const r = await dragCounts(page);
  expect(r.during.render, "live frames while dragging").toBeGreaterThan(0);
  expect(r.during.preview, "no previews at a shallow view").toBe(0);
});
