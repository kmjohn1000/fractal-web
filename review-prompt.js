// When to ask for an App Store rating, in the iOS app only (the website never asks). iOS draws the
// sheet itself (Platform.requestReview) and decides whether it shows (at most 3 times a year per
// person), so this file only picks a good moment: the person has opened the app on at least
// REVIEW_MIN_DAYS different days and has just saved an image to Photos or shared one, and we haven't
// asked in the last REVIEW_GAP_DAYS days. The only state is a few dates in localStorage on the
// device; nothing is sent anywhere. Needs platform.js; share-menu.js calls reviewMaybeAsk().
//
// An ES module: every top-level declaration is exported (test-hooks.js relies on it), which is also
// what lets the review-prompt spec call the decision functions directly.
import { Platform } from "./platform.js?v=1.62.2";

export const REVIEW_KEY = "fractalAtlas.review";
export const REVIEW_MIN_DAYS = 3; // distinct days the app was opened
export const REVIEW_GAP_DAYS = 120; // at least this long between our own asks
export const REVIEW_DELAY_MS = 2000; // after the save or share, so the sheet doesn't land on its menu
export const REVIEW_KEEP_DAYS = 10; // opened-day dates kept (the newest); only the count up to 3 matters
export const REVIEW_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// A local calendar day as "2026-11-02".
export function reviewDayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Whole days from one day key to another (a later than b is positive).
export function reviewDaysBetween(from, to) {
  const ms = (key) => { const [y, m, d] = key.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((ms(to) - ms(from)) / 86400000);
}

// The stored state, checked: anything unexpected reads as "never opened, never asked".
export function reviewParse(raw) {
  try {
    const v = JSON.parse(raw);
    const days = Array.isArray(v && v.days) ? v.days.filter((d) => typeof d === "string" && REVIEW_DAY_RE.test(d)) : [];
    const askedOn = v && typeof v.askedOn === "string" && REVIEW_DAY_RE.test(v.askedOn) ? v.askedOn : null;
    return { days: [...new Set(days)].slice(-REVIEW_KEEP_DAYS), askedOn };
  } catch {
    return { days: [], askedOn: null };
  }
}

export function reviewLoad() {
  try { return reviewParse(localStorage.getItem(REVIEW_KEY)); } catch { return { days: [], askedOn: null }; }
}

export function reviewSave(state) {
  try { localStorage.setItem(REVIEW_KEY, JSON.stringify(state)); } catch { /* storage blocked: stay stateless */ }
}

// The state with today counted as an opened day.
export function reviewRecordDay(state, today) {
  if (state.days.includes(today)) return state;
  return { ...state, days: [...state.days, today].slice(-REVIEW_KEEP_DAYS) };
}

// Whether now is a good moment to ask: opened on enough days, and not asked lately.
export function reviewShouldAsk(state, today) {
  if (state.days.length < REVIEW_MIN_DAYS) return false;
  return state.askedOn === null || reviewDaysBetween(state.askedOn, today) >= REVIEW_GAP_DAYS;
}

// Counts today as an opened day (called once as the app starts).
export function reviewNoteOpen(isNative = Platform.isNative, today = reviewDayKey()) {
  if (!isNative) return;
  const state = reviewLoad();
  const next = reviewRecordDay(state, today);
  if (next !== state) reviewSave(next);
}

// Called after a successful save to Photos or share. Asks REVIEW_DELAY_MS later if the moment is
// right, and writes down that it asked before it asks, so a crash can't make it ask twice.
// `deps` lets the spec stand in for the app, the clock and the iOS call.
export function reviewMaybeAsk(deps = {}) {
  const {
    isNative = Platform.isNative,
    request = () => Platform.requestReview(),
    delayMs = REVIEW_DELAY_MS,
    today = reviewDayKey,
  } = deps;
  if (!isNative) return Promise.resolve(false);
  return new Promise((resolve) => {
    setTimeout(async () => {
      try {
        const day = today();
        const state = reviewRecordDay(reviewLoad(), day);
        if (!reviewShouldAsk(state, day)) { resolve(false); return; }
        reviewSave({ ...state, askedOn: day });
        await request();
        resolve(true);
      } catch {
        resolve(false); // a rating prompt must never get in the way of saving or sharing
      }
    }, delayMs);
  });
}

reviewNoteOpen();
