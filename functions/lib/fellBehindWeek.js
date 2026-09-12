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
const { utcDateString } = require("./dateUtils");
const { isVolumeEligibleRun } = require("./runEligibility");

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

/** Pure: the prior-week run-completion status against the user's
 *  weekly target, or `null` when the user has no prescriptive target
 *  (freeform / active recovery / target < 1). Single source of truth
 *  for "who's behind", shared by both `_decideFellBehindFlag` (the
 *  Monday 05:00 UTC sweep) and `maybeSendWeeklyRecap` (the local
 *  Monday-8am recap push) so the two can't drift. */
function _fellBehindRatio(profile, programState, priorWeekRuns) {
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

  // Count volume-eligible runs in the prior week.
  const realRunCount = (priorWeekRuns || []).filter(
    _isVolumeEligibleRun
  ).length;
  const completedRatio = realRunCount / weeklyTarget;
  return {
    realRunCount,
    weeklyTarget,
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
  const status = _fellBehindRatio(profile, programState, priorWeekRuns);
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
  fellBehindRatio: _fellBehindRatio,
  decideFellBehindFlag: _decideFellBehindFlag,
};
