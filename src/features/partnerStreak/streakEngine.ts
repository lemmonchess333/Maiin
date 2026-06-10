/**
 * Partner-streak engine (SOCIAL S3) — pure, deterministic, timezone-safe.
 *
 * A partner bond is 1:1. The SHARED streak counts consecutive days on
 * which BOTH partners logged any session. Day boundary is each partner's
 * LOCAL day (the caller passes a "YYYY-MM-DD" local-day key built with
 * the established localDateString helper — this module never touches
 * `new Date()` or UTC, sidestepping the codebase's UTC/local landmines).
 *
 * MODEL (decisions flagged for review — these resolve the spec's
 * under-specified cross-timezone semantics):
 *  - A shared streak day D is achieved when BOTH partners' most-recent
 *    logged local day equals the same calendar key D. Two partners in
 *    different timezones both logging "on the 12th" (each local) share
 *    day "2026-06-12" — a calendar date is a calendar date. We compare
 *    the latest day per member (minimal stored state), so a partner who
 *    races a day ahead simply waits at that day until the other catches
 *    up; the streak advances when their latest days coincide.
 *  - Consecutive = the new shared day is exactly 1 day after the last.
 *  - FREEZE: one auto-freeze per partner per (Monday-anchored) week. A
 *    single missed shared day (gap > 1) consumes one AVAILABLE freeze to
 *    bridge and preserve the streak; with none available, the streak
 *    resets to 1 at the new shared day. (Whose freeze: the first member,
 *    in `members` order, with one available that week — deterministic.)
 *
 * No Firestore, no React. The data layer, rules, nudge function and UI
 * live elsewhere; this is the part worth unit-testing across timezones.
 */

export const MAX_PARTNERS = 5;

export interface PartnerStreakState {
  /** Current shared-streak length (days both logged, consecutively). */
  streak: number;
  /** Last calendar day (YYYY-MM-DD) both partners logged. null = none. */
  lastSharedDay: string | null;
  /** Each member's most-recent logged local day (YYYY-MM-DD). */
  lastActive: Record<string, string>;
  /** Each member's freeze ledger: the week-key their weekly freeze was
   *  consumed on (absent / null = freeze available this week). */
  freezeWeek: Record<string, string | null>;
}

export function emptyStreakState(): PartnerStreakState {
  return { streak: 0, lastSharedDay: null, lastActive: {}, freezeWeek: {} };
}

/** Bond cap: a user may hold at most MAX_PARTNERS active bonds. */
export function canAddPartner(activeBondCount: number): boolean {
  return activeBondCount < MAX_PARTNERS;
}

/** UTC-midnight epoch for a YYYY-MM-DD key — DST-proof day arithmetic
 *  (parsing as UTC means no local-offset / spring-forward drift). */
function dayEpoch(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole-day difference b − a (both YYYY-MM-DD). */
export function dayDiff(a: string, b: string): number {
  return Math.round((dayEpoch(b) - dayEpoch(a)) / 86400000);
}

/** Monday-anchored week key (YYYY-MM-DD of that day's Monday) — the
 *  bucket the weekly freeze resets on. */
export function weekKey(day: string): string {
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
function freezeAvailable(
  state: PartnerStreakState,
  member: string,
  day: string
): boolean {
  const consumedWeek = state.freezeWeek[member];
  return !consumedWeek || consumedWeek !== weekKey(day);
}

/** YYYY-MM-DD sorts chronologically as a string. */
function laterDay(a: string | undefined, b: string): string {
  return !a || b > a ? b : a;
}

/**
 * Record that `member` logged a session on their local day `localDay`,
 * returning the new bond state. Pure — no side effects, no clock reads.
 */
export function recordPartnerActivity(
  state: PartnerStreakState,
  member: string,
  localDay: string,
  members: readonly [string, string]
): PartnerStreakState {
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
  if (state.lastSharedDay === D || (state.lastSharedDay && D < state.lastSharedDay)) {
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

/**
 * Nudge eligibility: on `today` (a shared local-day key), one partner has
 * logged and the other hasn't — the logged partner may nudge. Returns the
 * member who should be nudged, or null. Pure; the caller supplies "today".
 */
export function partnerToNudge(
  state: PartnerStreakState,
  members: readonly [string, string],
  today: string
): string | null {
  const [a, b] = members;
  const aToday = state.lastActive[a] === today;
  const bToday = state.lastActive[b] === today;
  if (aToday && !bToday) return b;
  if (bToday && !aToday) return a;
  return null;
}
