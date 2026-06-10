/**
 * SOCIAL S3 (Soc7) — JS mirror of `src/features/partnerStreak/streakEngine.ts`.
 *
 * Server-side persist (`applyPartnerActivity` in index.js, driven by the
 * `onWorkoutCreated` / `onRunCreated` triggers) needs the SAME deterministic
 * counting the client engine performs. Keep this in lockstep with the TS
 * source — a cross-check test (`engineMirror.test.ts`) runs one shared
 * case-table against both and asserts identical output, so the two cannot
 * drift (the "tested copy ≠ running copy" guard).
 *
 * Pure functions only — no Firestore, no admin SDK. Days are local
 * "YYYY-MM-DD" strings (lexicographic compare == date compare). This module
 * never touches `new Date()` for the day key — the caller passes the local
 * day, exactly as the TS engine requires.
 *
 * CRITICAL: `weekKey` here is MONDAY-anchored (the freeze ledger bucket),
 * matching the TS engine. It is deliberately NOT the functions `getWeekKey`
 * (Sunday-anchored, for the performance week) — reusing that would silently
 * corrupt freeze bucketing.
 */

/** UTC-midnight epoch for a YYYY-MM-DD key — DST-proof day arithmetic. */
function dayEpoch(day) {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole-day difference b − a (both YYYY-MM-DD). */
function dayDiff(a, b) {
  return Math.round((dayEpoch(b) - dayEpoch(a)) / 86400000);
}

/** Monday-anchored week key (YYYY-MM-DD of that day's Monday). */
function weekKey(day) {
  const e = dayEpoch(day);
  const dow = new Date(e).getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = (dow + 6) % 7; // days since Monday
  const monday = new Date(e - mondayOffset * 86400000);
  const y = monday.getUTCFullYear();
  const m = String(monday.getUTCMonth() + 1).padStart(2, "0");
  const d = String(monday.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Is `member`'s weekly freeze available for the week containing `day`? */
function freezeAvailable(state, member, day) {
  const consumedWeek = state.freezeWeek[member];
  return !consumedWeek || consumedWeek !== weekKey(day);
}

/** YYYY-MM-DD sorts chronologically as a string. */
function laterDay(a, b) {
  return !a || b > a ? b : a;
}

/**
 * Apply one partner's logged activity on `localDay` to the shared bond
 * `state`, returning the next state. Pure; mirror of the TS engine.
 *
 * MAX-idempotent per (member, day): `lastActive` advances via `laterDay`
 * (a MAX), `lastSharedDay` only moves forward, and a same-day re-apply
 * hits the "already counted" guard BEFORE the freeze ledger — so a
 * redelivered trigger is a no-op without any external marker.
 *
 * @param {{streak:number,lastSharedDay:string|null,lastActive:Object,freezeWeek:Object}} state
 * @param {string} member        the member who logged
 * @param {string} localDay      "YYYY-MM-DD"
 * @param {[string,string]} members  the bond's two members
 */
function recordPartnerActivity(state, member, localDay, members) {
  const [a, b] = members;
  const other = member === a ? b : a;

  const lastActive = {
    ...state.lastActive,
    [member]: laterDay(state.lastActive[member], localDay),
  };

  const mine = lastActive[member];
  const theirs = lastActive[other];

  // A shared day is achieved only when BOTH partners' latest day is the
  // same calendar key. Until the other catches up, just bank the day.
  if (!theirs || theirs !== mine) {
    return { ...state, lastActive };
  }

  const D = mine; // the shared day
  // Already counted (a later log on the same shared day) → no change.
  if (
    state.lastSharedDay === D ||
    (state.lastSharedDay && D < state.lastSharedDay)
  ) {
    return { ...state, lastActive };
  }

  // First shared day ever → streak starts at 1.
  if (state.lastSharedDay === null) {
    return { ...state, lastActive, streak: 1, lastSharedDay: D };
  }

  const gap = dayDiff(state.lastSharedDay, D);
  if (gap === 1) {
    return { ...state, lastActive, streak: state.streak + 1, lastSharedDay: D };
  }

  // gap > 1: at least one shared day was missed. Try to bridge with one
  // available weekly freeze (first member in order who has one).
  const freezeUser = members.find((m) => freezeAvailable(state, m, D));
  if (freezeUser) {
    return {
      ...state,
      lastActive,
      streak: state.streak + 1,
      lastSharedDay: D,
      freezeWeek: { ...state.freezeWeek, [freezeUser]: weekKey(D) },
    };
  }

  // No freeze available → the streak broke; restart at this shared day.
  return { ...state, lastActive, streak: 1, lastSharedDay: D };
}

module.exports = {
  dayDiff,
  weekKey,
  recordPartnerActivity,
};
