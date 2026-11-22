/**
 * setEmailConsent: the Settings switches for the two emails a person can
 * choose (App1 Q55), Settings → Notifications → Email.
 *
 * The consent record is written only on the server (lib/emailConsent.js
 * says why), so a switch is a call here, not a write to the profile: the
 * times in it are the server's and the record cannot be backdated. The
 * change is made in a transaction on `users/{uid}`, from what is stored
 * there, so two quick taps on two switches both land.
 *
 * 1st-gen, like every export here: firebase-functions/v1.
 */
const functions = require("firebase-functions/v1");
const admin = require("../lib/adminSdk");
const { DEFAULT_HTTP_CAP } = require("../lib/runtimeCaps");
const accountDeletionLocks = require("../lib/accountDeletionLocks");
const rateLimiter = require("../rateLimiter");
const emailConsent = require("../lib/emailConsent");

/** A burst of taps is a few a minute; this only stops a loop. */
const SWITCH_LIMIT = Object.freeze({ maxCalls: 30, windowMs: 10 * 60_000 });

/**
 * One change, in a transaction. Returns the stored on/off of both kinds
 * after it, which the app shows.
 *
 * @param {object} args
 * @param {FirebaseFirestore.Firestore} args.db
 * @param {string} args.uid
 * @param {{ weeklyReview?: boolean, winBack?: boolean }} args.changes
 * @param {number | null} args.wording
 * @param {unknown} args.at - the server time to record
 */
async function changeEmailConsent({ db, uid, changes, wording, at }) {
  const userRef = db.collection("users").doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Finish setting up first."
      );
    }
    const stored = (snap.data() || {}).emailConsent;
    // A yes from Settings, a no from Settings: the switch is the one way
    // in here. The unsubscribe link records its own no.
    const onChanges = {};
    const offChanges = {};
    for (const [kind, on] of Object.entries(changes)) {
      (on ? onChanges : offChanges)[kind] = on;
    }
    let { next, changed } = emailConsent.applyEmailConsent(stored, onChanges, {
      via: "settings",
      wording,
      at,
    });
    const off = emailConsent.applyEmailConsent(next, offChanges, {
      via: "settings",
      at,
    });
    next = off.next;
    changed = [...changed, ...off.changed];
    if (changed.length > 0) tx.update(userRef, { emailConsent: next });
    return emailConsent.emailConsentSummary(next);
  });
}

exports.setEmailConsent = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in first.");
    }
    const uid = context.auth.uid;
    const db = admin.firestore();
    await accountDeletionLocks.assertCallableActorNotDeleting(db, uid);
    const request = emailConsent.readEmailConsentRequest(data);
    if (request.error) {
      throw new functions.https.HttpsError("invalid-argument", request.error);
    }
    if (
      await rateLimiter.isRateLimited(
        db,
        uid,
        "emailConsent",
        SWITCH_LIMIT.maxCalls,
        SWITCH_LIMIT.windowMs
      )
    ) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many changes. Try again in a few minutes."
      );
    }
    const summary = await changeEmailConsent({
      db,
      uid,
      changes: request.changes,
      wording: request.wording,
      at: admin.firestore.FieldValue.serverTimestamp(),
    });
    functions.logger.info("setEmailConsent", { uid, ...summary });
    return { emailConsent: summary };
  });

exports._internals = { changeEmailConsent, SWITCH_LIMIT };
