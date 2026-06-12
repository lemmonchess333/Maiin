/**
 * SOCIAL S3 (Soc7) — server-side partner-streak persist.
 *
 * Firestore I/O extracted from index.js so it's unit-testable with a
 * firestore stub (the house pattern — pure/injected lib + thin trigger
 * orchestration). Driven by onWorkoutCreated / onRunCreated. SERVER is the
 * only writer of streak state (the partnerBonds update rule is `if false`).
 */

const { recordPartnerActivity } = require("./partnerStreakEngine");
const { localDateKeyInTz } = require("./streakNudge");

/**
 * Advance every partner-streak bond `uid` belongs to for a session logged
 * on local day `localDay` ("YYYY-MM-DD"). No-op when `localDay` is falsy.
 *
 * Each bond is updated inside a `runTransaction` (guards the lost-update
 * race when two activities, or both partners, write the same bond). No
 * per-activity marker: `recordPartnerActivity` is MAX-idempotent per
 * (member, day), so a redelivered trigger is a no-op — and we skip the
 * write entirely when the engine returns unchanged state.
 *
 * The CALLER must have already gated `shouldSystemWriteProceed` (R1A).
 *
 * @param {FirebaseFirestore.Firestore} firestore
 * @param {string} uid
 * @param {string|null} localDay
 */
async function applyPartnerActivity(firestore, uid, localDay) {
  if (!localDay) return;
  try {
    const bondsSnap = await firestore
      .collection("partnerBonds")
      .where("members", "array-contains", uid)
      .get();
    for (const bondDoc of bondsSnap.docs) {
      const ref = bondDoc.ref;
      // The transaction returns the committed result (or null on a no-op
      // skip) so we can log AFTER commit — once per real write, never on a
      // same-day no-op and never duplicated by a transaction retry.
      const wrote = await firestore.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return null;
        const data = snap.data() || {};
        const members = data.members;
        if (!Array.isArray(members) || members.length !== 2) return null;

        const state = {
          streak: data.streak || 0,
          lastSharedDay:
            data.lastSharedDay === undefined ? null : data.lastSharedDay,
          lastActive: data.lastActive || {},
          freezeWeek: data.freezeWeek || {},
        };
        const next = recordPartnerActivity(state, uid, localDay, members);

        // Skip redundant writes (same-day re-log, or a bank that didn't
        // change this member's latest day) — one write per bond per NEW
        // shared/banked day, not per session.
        const changed =
          next.streak !== state.streak ||
          next.lastSharedDay !== state.lastSharedDay ||
          JSON.stringify(next.lastActive) !== JSON.stringify(state.lastActive) ||
          JSON.stringify(next.freezeWeek) !== JSON.stringify(state.freezeWeek);
        if (!changed) return null;

        tx.set(
          ref,
          {
            streak: next.streak,
            lastSharedDay: next.lastSharedDay,
            lastActive: next.lastActive,
            freezeWeek: next.freezeWeek,
          },
          { merge: true }
        );
        return { streak: next.streak, lastSharedDay: next.lastSharedDay };
      });

      // Success observability (post-deploy verification): a single greppable
      // line per real bond write. A same-day re-log returns null → no line,
      // which is itself the confirmation that the no-op path held.
      if (wrote) {
        console.log(
          `applyPartnerActivity: bond ${bondDoc.id} streak→${wrote.streak} ` +
            `lastShared=${wrote.lastSharedDay} (uid ${uid}, day ${localDay})`
        );
      }
    }
  } catch (err) {
    console.error(`applyPartnerActivity: error for ${uid}:`, err.message);
  }
}

/**
 * Resolve a user's local day for partner-streak persist. Prefers the
 * activity doc's own `date` ("YYYY-MM-DD", written local via
 * `localDateString`); falls back to the user's timezone-derived local day.
 * Returns null when neither is available — the caller then skips persist
 * (NEVER a UTC fallback; mixing UTC and local days corrupts the streak).
 *
 * @param {FirebaseFirestore.Firestore} firestore
 * @param {string} uid
 * @param {string|undefined} activityDate
 */
async function resolvePartnerActivityDay(firestore, uid, activityDate) {
  if (activityDate) return activityDate;
  try {
    const profSnap = await firestore.collection("users").doc(uid).get();
    const tz = (profSnap.data() || {}).timezone || null;
    return tz ? localDateKeyInTz(new Date(), tz) : null;
  } catch {
    return null;
  }
}

module.exports = { applyPartnerActivity, resolvePartnerActivityDay };
