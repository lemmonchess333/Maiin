/**
 * The two training launch numbers, decided on the server (App1 Q17,
 * 13 November 2026): an account's first saved session, and a session saved
 * in its fourth week. Each is kept once on `users/{uid}.launchMilestones`,
 * written here from the session triggers and read by the app, which sends
 * each to analytics once per account (`src/lib/launchEvents.ts`). The
 * money pair is the billing record beside it (`activationBillingFirsts`,
 * lib/activationBilling.js), and finished setup is sent by the app the
 * moment the plan is saved.
 *
 * The server decides because it sees every session from every device on
 * one clock, Firestore's create time (the cohort report's clock), an
 * offline save included once it syncs, and a transaction keeps each once
 * however many triggers run together or again. The app sends because
 * Firebase Analytics takes its events from the app.
 *
 * Only an account set up since this was built has the map (completeOnboarding
 * stamps it empty on the first setup), so an older account's next session
 * is never taken for its first.
 *
 * A session counts under the cohort report's rule (lib/firstWeekActivation):
 * a workout with a completed set or a timed exercise, a run that counts for
 * volume. Server-only: the rules leave it out of what a client may write.
 */
const { isFirstWeekWorkoutEligible } = require("./firstWeekActivation");
const { isVolumeEligibleRun } = require("./runEligibility");

const DAY_MS = 86_400_000;

/** The account's fourth week, in days since setup (setup's day is day 0). */
const WEEK_FOUR = Object.freeze({ fromDay: 21, toDay: 27 });

const KINDS = new Set(["lift", "run"]);

function isMilestone(value) {
  return (
    !!value && typeof value === "object" && Number.isSafeInteger(value.atMs)
  );
}

/** Whether a saved session counts toward a launch number. */
function countsAsSession(kind, data) {
  if (kind === "lift") return isFirstWeekWorkoutEligible(data);
  if (kind === "run") return isVolumeEligibleRun(data);
  return false;
}

/**
 * The map after a counted session saved at `atMs`, or null when the session
 * changes nothing: the account was set up before the map existed, or both
 * of its milestones are already earlier. The earliest session is kept,
 * since two triggers can run at once and either can commit first.
 */
function nextLaunchMilestones(current, { kind, atMs, setupAtMs }) {
  if (!current || typeof current !== "object" || Array.isArray(current))
    return null;
  if (
    !KINDS.has(kind) ||
    !Number.isSafeInteger(atMs) ||
    !Number.isSafeInteger(setupAtMs) ||
    atMs < setupAtMs
  )
    return null;
  const daysSinceSetup = Math.floor((atMs - setupAtMs) / DAY_MS);
  const milestone = { atMs, kind, daysSinceSetup };
  const next = { ...current };
  let changed = false;
  if (!isMilestone(current.firstSession) || current.firstSession.atMs > atMs) {
    next.firstSession = milestone;
    changed = true;
  }
  if (
    daysSinceSetup >= WEEK_FOUR.fromDay &&
    daysSinceSetup <= WEEK_FOUR.toDay &&
    (!isMilestone(current.week4Return) || current.week4Return.atMs > atMs)
  ) {
    next.week4Return = milestone;
    changed = true;
  }
  return changed ? next : null;
}

/**
 * Record what a just-saved session adds, in a transaction on the profile.
 * `atMs` is the session document's create time. Returns the new map, or
 * null when nothing was written.
 */
async function recordSessionMilestones(db, { uid, kind, data, atMs }) {
  if (!countsAsSession(kind, data)) return null;
  const userRef = db.collection("users").doc(uid);
  return db.runTransaction(async (txn) => {
    const snap = await txn.get(userRef);
    if (!snap.exists) return null;
    const user = snap.data() || {};
    const setup = user.onboardingCompletedAt;
    const next = nextLaunchMilestones(user.launchMilestones, {
      kind,
      atMs,
      setupAtMs:
        setup && typeof setup.toMillis === "function" ? setup.toMillis() : NaN,
    });
    if (next) txn.update(userRef, { launchMilestones: next });
    return next;
  });
}

module.exports = {
  WEEK_FOUR,
  countsAsSession,
  nextLaunchMilestones,
  recordSessionMilestones,
};
