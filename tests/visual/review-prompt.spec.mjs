// The rating prompt (review-prompt.js): when the iOS app asks for an App Store rating. The sheet itself is
// iOS's and can't be seen here, so these checks cover the decision (opened on 2 different days, then a
// save, a share or a deep zoom left alone, not twice within 120 days), the stored dates, and that the
// website never asks. The
// app's side (Platform.requestReview and the Swift plugin) is checked by hand on a Release build.
// Plain behavior checks, no screenshots. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";

/* global reviewShouldAsk, reviewRecordDay, reviewParse, reviewDaysBetween, reviewMaybeAsk, reviewNoteOpen,
   reviewLoad, reviewSave, reviewNoteDeep, REVIEW_KEY */

let pageErrors = [];

async function load(page) {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript(() => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
    } catch { /* storage blocked */ }
  });
  await page.goto("index.html");
  await page.waitForFunction(() => window["__faHooks"] > 0, null, { timeout: 90_000 });
}

test.describe("the decision", () => {
  test("asks only after the app was opened on 2 different days, and not again within 120 days", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const one = { days: ["2026-11-01"], askedOn: null };
      const three = { days: ["2026-11-01", "2026-11-05"], askedOn: null };
      const asked = (day) => ({ ...three, askedOn: day });
      return {
        two: reviewShouldAsk(one, "2026-11-05"),
        three: reviewShouldAsk(three, "2026-11-05"),
        justAsked: reviewShouldAsk(asked("2026-11-05"), "2026-11-05"),
        day119: reviewShouldAsk(asked("2026-11-05"), "2027-03-04"),
        day120: reviewShouldAsk(asked("2026-11-05"), "2027-03-05"),
        between: reviewDaysBetween("2026-11-05", "2027-03-05"),
      };
    });
    expect(r.two).toBe(false);
    expect(r.three).toBe(true);
    expect(r.justAsked).toBe(false);
    expect(r.day119).toBe(false);
    expect(r.day120).toBe(true);
    expect(r.between).toBe(120);
    expect(pageErrors).toEqual([]);
  });

  test("a day counts once, only the newest 10 are kept, and bad stored data reads as empty", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const first = reviewRecordDay({ days: [], askedOn: null }, "2026-11-01");
      const sameObject = reviewRecordDay(first, "2026-11-01") === first;
      let s = first;
      for (let d = 2; d <= 15; d++) s = reviewRecordDay(s, `2026-11-${String(d).padStart(2, "0")}`);
      return {
        sameObject,
        kept: s.days,
        junk: reviewParse("not json"),
        wrongTypes: reviewParse(JSON.stringify({ days: ["x", "2026-01-01", 5, "2026-01-01"], askedOn: 7 })),
        nothing: reviewParse(null),
      };
    });
    expect(r.sameObject).toBe(true);
    expect(r.kept.length).toBe(10);
    expect(r.kept[0]).toBe("2026-11-06");
    expect(r.kept[9]).toBe("2026-11-15");
    expect(r.junk).toEqual({ days: [], askedOn: null });
    expect(r.wrongTypes).toEqual({ days: ["2026-01-01"], askedOn: null });
    expect(r.nothing).toEqual({ days: [], askedOn: null });
  });
});

test.describe("where it runs", () => {
  test("the website never counts days, stores anything or asks", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async () => {
      reviewNoteOpen();
      const asked = await reviewMaybeAsk({ delayMs: 0, request: async () => { window["__asked"] = true; } });
      return { asked, stored: localStorage.getItem(REVIEW_KEY), flag: window["__asked"] === true };
    });
    expect(r.asked).toBe(false);
    expect(r.stored).toBeNull();
    expect(r.flag).toBe(false);
    expect(pageErrors).toEqual([]);
  });

  test("the app, with stand-ins for iOS and the clock: counts opened days, asks once at the right moment", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async () => {
      window["__asks"] = 0;
      const request = async () => { window["__asks"]++; };
      const on = (day) => ({ isNative: true, delayMs: 0, request, today: () => day });
      const out = {};
      // Opening counts a day once, however often the app starts that day.
      reviewNoteOpen(true, "2026-11-01"); reviewNoteOpen(true, "2026-11-01"); reviewNoteOpen(true, "2026-11-02");
      out.afterTwoDays = reviewLoad().days;
      // A save on the 1st day (only one day opened so far): too early.
      reviewSave({ days: ["2026-11-01"], askedOn: null });
      out.tooEarly = await reviewMaybeAsk(on("2026-11-01"));
      out.asksTooEarly = window["__asks"];
      // The 2nd day's save counts that day too, so it asks.
      out.third = await reviewMaybeAsk(on("2026-11-02"));
      out.stored = reviewLoad();
      // The next save, even the same day, does not ask again.
      out.again = await reviewMaybeAsk(on("2026-11-02"));
      out.asksAfter = window["__asks"];
      // A failing request never throws into saving or sharing.
      reviewSave({ days: ["2026-01-01", "2026-01-02"], askedOn: null });
      out.failed = await reviewMaybeAsk({ ...on("2026-01-03"), request: async () => { throw new Error("no"); } });
      return out;
    });
    expect(r.afterTwoDays).toEqual(["2026-11-01", "2026-11-02"]);
    expect(r.tooEarly).toBe(false);
    expect(r.asksTooEarly).toBe(0);
    expect(r.third).toBe(true);
    expect(r.stored).toEqual({ days: ["2026-11-01", "2026-11-02"], askedOn: "2026-11-02" });
    expect(r.again).toBe(false);
    expect(r.asksAfter).toBe(1);
    expect(r.failed).toBe(false);
    expect(pageErrors).toEqual([]);
  });

  test("a deep view left alone asks once; moving, a shallow view or the website does not", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async () => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      let asks = 0;
      const deps = (isNative = true) => ({ isNative, idleMs: 60, ask: () => { asks++; } });
      const out = {};
      // Deep and still: asks once, after the wait.
      reviewNoteDeep(1e-7, deps());
      out.beforeWait = asks;
      await wait(150);
      out.afterWait = asks;
      // Renders keep restarting the wait, so a view that keeps moving never asks.
      for (let i = 0; i < 5; i++) { reviewNoteDeep(1e-7, deps()); await wait(30); }
      out.whileMoving = asks;
      // A shallower render cancels the wait.
      reviewNoteDeep(1e-7, deps());
      reviewNoteDeep(0.5, deps());
      await wait(150);
      out.shallow = asks;
      // The website never asks.
      reviewNoteDeep(1e-7, deps(false));
      await wait(150);
      out.web = asks;
      return out;
    });
    expect(r.beforeWait).toBe(0);
    expect(r.afterWait).toBe(1);
    expect(r.whileMoving).toBe(1);
    expect(r.shallow).toBe(1);
    expect(r.web).toBe(1);
    expect(pageErrors).toEqual([]);
  });
});
