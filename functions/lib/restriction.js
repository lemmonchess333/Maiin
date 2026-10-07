/* ─────────────────────────────────────────────
   A restricted account, refused on the server (S4e, STATUS 2026-10-06).

   A moderator restricts an account from the report queue
   (`resolveReport` with `restrictUser`), which writes
   `globalRestrictedUids/{uid}`. Until 2026-10-06 nothing consulted it but
   the Find tab: a restricted account could still post, comment, give
   props, like, react, follow from a profile and join Spaces. The S4e lock
   said that hole was acceptable only while the operator was the only user.

   The rule: a restriction refuses everything that reaches another person,
   and nothing else. Private logging, the person's own profile, reading,
   blocking, reporting, leaving and taking things back (unfollowing,
   removing their own props) stay open. firestore.rules holds the same line
   for the writes clients make directly (`isRestricted()`); this module is
   the callables' half.

   Fails CLOSED on a read error, like blockGuard: a refused interaction is
   recoverable (the person tries again), one delivered to the people a
   moderator meant to protect is not.
   ───────────────────────────────────────────── */

/** `details.reason` on the refusal, which the app maps to its own words. */
const RESTRICTED_REASON = "account-restricted";

const RESTRICTED_MESSAGE =
  "Your account is restricted, so you can't do this for now. Contact support if you think it's a mistake.";

/**
 * Whether this account is restricted.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} uid
 * @returns {Promise<boolean>}
 */
async function isRestricted(db, uid) {
  if (!db || typeof uid !== "string" || !uid) return false;
  try {
    const snap = await db.collection("globalRestrictedUids").doc(uid).get();
    return snap.exists;
  } catch (_) {
    return true;
  }
}

/** The refusal a restricted account's request gets. */
function restrictedError(functions) {
  return new functions.https.HttpsError("permission-denied", RESTRICTED_MESSAGE, {
    reason: RESTRICTED_REASON,
  });
}

/** Throws the refusal when the account is restricted. */
async function assertNotRestricted(db, uid, functions) {
  if (await isRestricted(db, uid)) throw restrictedError(functions);
}

/**
 * For the toggles (props, Space likes, comment reactions): an error a
 * transaction throws when a restricted account would ADD, so taking one
 * back still works. Checked inside the transaction, against the same read
 * that decides add or remove.
 */
function refusedAddError() {
  const err = new Error(RESTRICTED_MESSAGE);
  err.code = RESTRICTED_REASON;
  return err;
}

module.exports = {
  RESTRICTED_REASON,
  RESTRICTED_MESSAGE,
  isRestricted,
  restrictedError,
  assertNotRestricted,
  refusedAddError,
};
