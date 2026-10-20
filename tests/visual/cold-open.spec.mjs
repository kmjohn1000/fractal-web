// The website's first visit: a fresh visitor flies to a showpiece place with
// the info card open and sees the welcome card; a return visitor who closed
// the card sees neither; a visitor arriving by share link gets that view
// (and still the card). Function checks only, no screenshots: the place is
// picked at random. app.spec.mjs pre-sets the storage keys instead.
import { test, expect } from "@playwright/test";

const SHOWPIECES = ["Seahorse Valley", "Mini Mandelbrot", "Elephant Valley", "Double Spiral", "Sunburst Fan"];
const SHARE_LINK = "index.html#v=1&m=fractal&f=Mandelbrot&x=-0.5&y=0&s=1&r=0&i=300";

let pageErrors = [];

test.beforeEach(({ page }) => {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

test("a fresh visit flies to a showpiece and shows the welcome card", async ({ page }) => {
  await page.goto("index.html");

  // The flight lands on one of the showpieces and the info card names it.
  await page.waitForFunction(
    (names) => names.includes(document.querySelector("#hud .hudName").textContent),
    SHOWPIECES,
    { timeout: 60_000, polling: 200 },
  );
  await expect(page.locator("#hud")).toBeVisible();

  const welcome = page.locator("#welcome");
  await expect(welcome).toBeVisible();
  await expect(welcome.locator("a.welcomeApp")).toHaveAttribute("href", /apps\.apple\.com\/.*\/id6816481394$/);
  await expect(welcome.locator("a", { hasText: "Privacy" })).toHaveAttribute("href", "privacy.html");
  await expect(welcome.locator("a", { hasText: "Support" })).toHaveAttribute("href", "support.html");

  // The fractal count is the picker's tile count, not a hard-coded number.
  const tiles = await page.evaluate(
    () => document.querySelectorAll("#fractalTypeRow button[data-name], #fractalTypeRow button[data-mode]").length,
  );
  expect(tiles).toBeGreaterThan(0);
  await expect(page.locator("#welcomeText")).toContainText(`Zoom into ${tiles} fractals`);

  // The flight pushed history, so Back returns to the whole set.
  await expect(page.locator("#backBtn")).toBeEnabled();
});

test("closing the card, then reloading, shows neither the card nor a flight", async ({ page }) => {
  await page.goto("index.html");
  await expect(page.locator("#welcome")).toBeVisible();
  await page.locator("#welcomeClose").click();
  await expect(page.locator("#welcome")).toBeHidden();

  await page.reload();
  // Longer than the cold open's delay (600 ms after the first frame).
  await page.waitForTimeout(2500);
  await expect(page.locator("#welcome")).toBeHidden();
  await expect(page.locator("#hud")).toBeHidden();
});

test("a share link opens that view, with no flight but still the card", async ({ page }) => {
  await page.goto(SHARE_LINK);
  await page.waitForTimeout(2500);
  await expect(page.locator("#welcome")).toBeVisible();
  // The cold open turns the info card on; it stays off here.
  await expect(page.locator("#hud")).toBeHidden();
});
