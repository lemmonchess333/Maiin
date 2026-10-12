/**
 * Fell-behind week decision helpers (audit batch 6, extraction 2a).
 *
 * PURE module — no Firestore, no firebase-functions. Moved verbatim
 * from index.js, where the same helpers were shared by TWO transports
 * that must never drift:
 *   - weeklyFellBehindCheck (Monday 05:00 UTC scheduled sweep)
 *   - maybeSendWeeklyRecap  (local Monday-8am recap push)
 * index.js keeps thin `_`-prefixed aliases + test-surface exports, so
 * every existing call site and test import is unchanged.
 */
const { parseUtcDate, utcDateString } = require("./dateUtils");
const { isVolumeEligibleRun } = require("./runEligibility");
const { localDateKeyInTz } = require("./streakNudge");

const _utcDateString = utcDateString;
const _isVolumeEligibleRun = isVolumeEligibleRun;

const FELL_BEHIND_THRESHOLD = 0.5;

/** Compute the prior-week boundaries given a "now" timestamp. The
 *  trigger fires Monday 05:00 UTC; prior week is the Mon..Sun block
 *  immediately preceding today — so on the Monday it fires, it grades
 *  the week that ended the evening before.
 *
 *  Monday-anchored per RunWk2. It bucketed Sun..Sat until then, which
 *  put the sweep's verdict and the `weekKey` it stamps on
 *  `pendingFellBehindPrompt` a day out of step with every week the
 *  user sees. */
function _priorWeekUtcRange(nowMs) {
  // Anchor on UTC midnight of "today" so dates align cleanly with
  // the saved-runs `date` field (which is a local-date string that
  // happens to look like a UTC date for the purpose of >=/<=
  // ordering).
  const now = new Date(nowMs);
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  // Distance back to this week's Monday: Mon→0, Tue→1 … Sun→6. The
  // +6 %7 shift is what turns getUTCDay's Sunday-first numbering into
  // a Monday-first offset; subtracting the raw day number would send
  // Sunday back a whole week.
  const backToMonday = (todayUtc.getUTCDay() + 6) % 7;
  const thisMonday = new Date(todayUtc.getTime());
  thisMonday.setUTCDate(thisMonday.getUTCDate() - backToMonday);
  const priorMonday = new Date(thisMonday.getTime());
  priorMonday.setUTCDate(priorMonday.getUTCDate() - 7);
  const priorSunday = new Date(thisMonday.getTime());
  priorSunday.setUTCDate(priorSunday.getUTCDate() - 1);
  return {
    weekStart: _utcDateString(priorMonday),
    weekEnd: _utcDateString(priorSunday),
    weekKey: _utcDateString(priorMonday),
  };
}

/** The day an account began, as its owner's local date key (UTC when no
 *  timezone is stored), or null when `createdAt` isn't a timestamp. */
function _accountStartKey(profile) {
  const createdAt = profile && profile.createdAt;
  if (!createdAt || typeof createdAt.toMillis !== "function") return null;
  const began = new Date(createdAt.toMillis());
  if (!Number.isFinite(began.getTime())) return null;
  return localDateKeyInTz(began, profile.timezone) || utcDateString(began);
}

/** Pure: the runs a week planned, counted from the day the account began
 *  when it began that week (F16b). A plan made partway through a week plans
 *  no run before that day (Run19), so the full weekly target read a
 *  Thursday start as behind on its first Monday. The week's run days, while
 *  the plan still holds them; for an account that began that week, the
 *  schedule's run days from then if not; null otherwise, and the weekly
 *  target stands. */
function _plannedRunsInWeek(profile, programState, weekKey) {
  if (typeof weekKey !== "string") return null;
  const weekStart = parseUtcDate(weekKey);
  const dayOf = (i) => {
    const d = new Date(weekStart.getTime());
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  };
  const weekEnd = utcDateString(dayOf(6));
  const start = _accountStartKey(profile);
  const from = start && start > weekKey && start <= weekEnd ? start : weekKey;
  const runDays = (programState && programState.runDays) || [];
  const planned = runDays.filter(
    (rd) =>
      rd &&
      typeof rd.date === "string" &&
      rd.date >= weekKey &&
      rd.date <= weekEnd
  );
  if (planned.length > 0) return planned.filter((rd) => rd.date >= from).length;
  if (from === weekKey) return null;
  const schedule = Array.isArray(profile && profile.weekSchedule)
    ? profile.weekSchedule
    : [];
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const day = dayOf(i);
    const slot = schedule.find((s) => s && s.day === day.getUTCDay());
    const runs = slot && (slot.type === "run" || slot.type === "both");
    if (runs && utcDateString(day) >= from) count += 1;
  }
  return count;
}

/** Pure: the prior-week run-completion status against the user's
 *  weekly target, or `null` when the user has no prescriptive target
 *  (freeform / active recovery / a race plan graded on a week after its
 *  race / target < 1). Single source of truth
 *  for "who's behind", shared by both `_decideFellBehindFlag` (the
 *  Monday 05:00 UTC sweep) and `maybeSendWeeklyRecap` (the local
 *  Monday-8am recap push) so the two can't drift. */
function _fellBehindRatio(profile, programState, priorWeekRuns, priorWeekKey) {
  // Gate 1 — freeform users have no prescriptive target; skip.
  const runMode = profile && profile.runMode;
  if (!runMode || runMode === "freeform") {
    return null;
  }

  // Gate 2 — users in active recovery phase aren't falling behind
  // on training; they're recovering by design. The "prescription"
  // for the recovery weeks is easy_30s at the same frequency, but
  // missing those isn't fell-behind territory.
  const runPlan = (programState && programState.runPlan) || null;
  if (runPlan && runPlan.phase === "recovery") {
    return null;
  }

  // Gate 2b — a race plan graded on a week that began after its race holds
  // nothing to fall behind on. Race prep waits for the race's own ending
  // (the no-show, the recovery exit and the return to free running), and
  // until then the weekly check said "fell behind" every Monday.
  const raceDate =
    (runPlan && runPlan.raceGoal && runPlan.raceGoal.targetDate) ||
    (profile && profile.raceGoal && profile.raceGoal.targetDate) ||
    null;
  if (
    typeof priorWeekKey === "string" &&
    typeof raceDate === "string" &&
    raceDate < priorWeekKey
  ) {
    return null;
  }

  // Gate 3 — read the user's weekly run target. Use `??` (not `||`)
  // to mirror `getWeeklyRunTarget` in src/lib/scheduleUtils.ts — a
  // user with an explicit `weeklyRunDaysTarget: 0` (e.g. a zeroed
  // taper week) should treat the new field as authoritative rather
  // than falling back to the legacy `weeklyRunsTarget`. After
  // resolution, 0 still falls through to the `< 1` guard below.
  const weeklyTarget =
    (profile && profile.weeklyRunDaysTarget) ??
    (profile && profile.weeklyRunsTarget) ??
    0;
  if (weeklyTarget < 1) {
    return null;
  }

  // Gate 3b — a week is graded against what it planned (F16b): a first week
  // begun partway through has fewer runs than the weekly target, and one
  // begun after its last run day has none to fall behind on.
  const plannedTarget = _plannedRunsInWeek(profile, programState, priorWeekKey);
  const target = plannedTarget ?? weeklyTarget;
  if (target < 1) {
    return null;
  }

  // Count volume-eligible runs in the prior week.
  const realRunCount = (priorWeekRuns || []).filter(
    _isVolumeEligibleRun
  ).length;
  const completedRatio = realRunCount / target;
  return {
    realRunCount,
    weeklyTarget: target,
    completedRatio,
    fellBehind: completedRatio < FELL_BEHIND_THRESHOLD,
  };
}

/** Pure decision function for the fell-behind flag. Returns
 *  `{ payload, action }` where `action` is one of:
 *    - "set": new fell-behind state → write flag
 *    - "clear": previously fell-behind but this week clears it →
 *      delete the flag (write `null`)
 *    - "noop": nothing to do this week
 *  Easy to test exhaustively without Firestore. */
function _decideFellBehindFlag(
  profile,
  programState,
  priorWeekRuns,
  priorWeekKey
) {
  const status = _fellBehindRatio(
    profile,
    programState,
    priorWeekRuns,
    priorWeekKey
  );
  // No prescriptive target (freeform / recovery / target<1) → nothing to do.
  if (!status) {
    return { action: "noop" };
  }
  const { completedRatio, realRunCount, weeklyTarget, fellBehind } = status;

  const existingFlag =
    (programState && programState.pendingFellBehindPrompt) || null;

  if (fellBehind) {
    // Idempotent: if the same flag is already present (re-firing on
    // the same week), no-op so we don't generate spurious writes.
    if (
      existingFlag &&
      existingFlag.weekKey === priorWeekKey &&
      existingFlag.completedRatio === completedRatio
    ) {
      return { action: "noop" };
    }
    return {
      action: "set",
      payload: {
        pendingFellBehindPrompt: {
          weekKey: priorWeekKey,
          completedRatio,
          realRunCount,
          weeklyTarget,
        },
      },
    };
  }

  // Not fell-behind this week. If a flag for an OLDER week is still
  // present (user dismissed the previous one slowly), leave it —
  // the client owns the dismissal. Only clear if the flag belongs
  // to THIS evaluation's week (defensive — caller shouldn't have
  // re-evaluated the same week twice, but be safe).
  if (existingFlag && existingFlag.weekKey === priorWeekKey) {
    return {
      action: "clear",
      payload: { pendingFellBehindPrompt: null },
    };
  }
  return { action: "noop" };
}

module.exports = {
  FELL_BEHIND_THRESHOLD,
  priorWeekUtcRange: _priorWeekUtcRange,
  plannedRunsInWeek: _plannedRunsInWeek,
  fellBehindRatio: _fellBehindRatio,
  decideFellBehindFlag: _decideFellBehindFlag,
};
