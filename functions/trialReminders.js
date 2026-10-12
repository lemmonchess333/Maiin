// The reminder before a free trial turns into a paid subscription (Sub1,
// STATUS 2026-10-06). Every hour, email the people whose reminder is due.
//
// planEntitlementWrite records a trial on the profile as `subscriptionTrial`
// (lib/trialReminder.js), with the instant its reminder goes. This sweep
// finds the records whose instant has passed and, for each, re-reads
// RevenueCat first, so a trial cancelled since the last webhook is not
// reminded. Then it sends the email (lib/trialReminderEmail.js) through
// Resend to the address the person signs in with, and marks the record
// `reminderEmailedAt`. A later sync of the same trial keeps the mark.
//
// 1st-gen, like every export here: firebase-functions/v1.
const functions = require("firebase-functions/v1");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { SCHEDULED_CAP } = require("./lib/runtimeCaps");
const accountDeletionLocks = require("./lib/accountDeletionLocks");
const trialReminder = require("./lib/trialReminder");
const { buildTrialReminderEmail } = require("./lib/trialReminderEmail");
const { sendViaResend } = require("./email/accountEmails");
const { syncUser } = require("./revenueCat");

// Both are already provisioned and bound elsewhere (email/accountEmails.js,
// revenueCat.js); defineSecret registers by name.
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const REVENUECAT_REST_KEY = defineSecret("REVENUECAT_REST_KEY");

/** A reminder stays due for at most 62 hours (lib/trialReminder.js), so a
 *  three-day look back finds every one still due, with room for hours the
 *  sweep did not run. */
const LOOKBACK_MS = 3 * 24 * 3_600_000;
/** When RevenueCat cannot be read, wait for the next hour unless the last
 *  moment to cancel is this close. A reminder that may be out of date beats
 *  none, and it says there is nothing to do if they have already cancelled. */
const SEND_WITHOUT_REFRESH_MS = 12 * 3_600_000;

/** Anything shaped like an address, out of a line bound for the logs. */
function redact(message) {
  return String(message || "unknown").replace(/\S+@\S+/g, "[address]");
}

/**
 * Remind one person if their reminder is due. Returns what happened, as a
 * fixed code for the run's log: "emailed", or why not — lib/trialReminder.js's
 * reminderStatus codes ("sent" there means an earlier run emailed them),
 * account-deleting, revenuecat-unavailable or no-email.
 */
async function remindOne(uid, deps) {
  const { db, nowMs, logger } = deps;
  const userRef = db.collection("users").doc(uid);
  const before = (await userRef.get()).data() || {};
  const first = trialReminder.reminderStatus(before.subscriptionTrial, nowMs);
  if (first !== "due") return first;
  if (!(await deps.shouldProceed(db, uid))) return "account-deleting";

  let data = before;
  try {
    await deps.refresh(uid);
    data = (await userRef.get()).data() || {};
  } catch (err) {
    const left = Date.parse(before.subscriptionTrial.cancelBy) - nowMs;
    if (left > SEND_WITHOUT_REFRESH_MS) return "revenuecat-unavailable";
    logger.warn("trialReminderSweep: sending without a fresh read", {
      uid,
      error: redact(err && (err.code || err.message)),
    });
  }
  const trial = data.subscriptionTrial;
  const status = trialReminder.reminderStatus(trial, nowMs);
  if (status !== "due") return status;

  const to = await deps.getEmail(uid);
  if (!to) return "no-email";
  const message = buildTrialReminderEmail({ trial, timeZone: data.timezone });
  await deps.sendEmail({ to, ...message });

  // Marked only while it is still the trial that was reminded about.
  const sentAt = new Date(nowMs).toISOString();
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(userRef);
    const current = snap.exists ? snap.data().subscriptionTrial : null;
    if (
      current &&
      current.productId === trial.productId &&
      current.endsAt === trial.endsAt
    ) {
      txn.update(userRef, { "subscriptionTrial.reminderEmailedAt": sentAt });
    }
  });
  return "emailed";
}

/** One run: every record whose reminder time has passed in the look back. */
async function runSweep(deps) {
  const { db, nowMs, logger } = deps;
  const snapshot = await db
    .collection("users")
    .where(
      "subscriptionTrial.reminderAt",
      ">=",
      new Date(nowMs - LOOKBACK_MS).toISOString()
    )
    .where("subscriptionTrial.reminderAt", "<=", new Date(nowMs).toISOString())
    .get();
  const outcomes = {};
  for (const doc of snapshot.docs) {
    let outcome;
    try {
      outcome = await remindOne(doc.id, deps);
    } catch (err) {
      outcome = "failed";
      logger.error("trialReminderSweep: reminder failed", {
        uid: doc.id,
        error: redact(err && err.message),
      });
    }
    outcomes[outcome] = (outcomes[outcome] || 0) + 1;
  }
  return outcomes;
}

/** The address the person signs in with, or null when there is none. */
async function authEmail(uid) {
  try {
    const user = await admin.auth().getUser(uid);
    return typeof user.email === "string" && user.email ? user.email : null;
  } catch (err) {
    if (err && err.code === "auth/user-not-found") return null;
    throw err;
  }
}

function productionDeps(nowMs) {
  const db = admin.firestore();
  return {
    db,
    nowMs,
    logger: functions.logger,
    shouldProceed: (database, uid) =>
      accountDeletionLocks.shouldSystemWriteProceed(
        database,
        uid,
        "trialReminderSweep"
      ),
    refresh: (uid) =>
      syncUser({
        db,
        uid,
        apiKey: process.env.REVENUECAT_REST_KEY,
        fetchImpl: fetch,
        serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
        logger: functions.logger,
      }),
    getEmail: authEmail,
    sendEmail: sendViaResend,
  };
}

// Hourly, on UTC: each reminder goes at 10:00 in the person's own zone.
exports.trialReminderSweep = functions
  .runWith({
    ...SCHEDULED_CAP,
    secrets: [RESEND_API_KEY, REVENUECAT_REST_KEY],
  })
  .pubsub.schedule("0 * * * *")
  .timeZone("Etc/UTC")
  .onRun(async () => {
    try {
      const outcomes = await runSweep(productionDeps(Date.now()));
      functions.logger.log("trialReminderSweep: done", outcomes);
    } catch (err) {
      functions.logger.error("trialReminderSweep: run failed", {
        error: redact(err && err.message),
      });
    }
    return null;
  });

exports._internals = {
  LOOKBACK_MS,
  SEND_WITHOUT_REFRESH_MS,
  remindOne,
  runSweep,
  redact,
};
