/* ─────────────────────────────────────────────
   Server-side enforcement of a block.

   Blocking was CLIENT-side suppression only. `blocks/{blocker}/users/{target}`
   was written by the client and read by the client, and nothing in functions/
   or firestore.rules consulted it. So a blocked user could still kudos and
   comment: the callables wrote the counter, the sub-doc AND the notification,
   and the recipient's app then hid the feed row while the tray row and the
   push both landed.

   That is the wrong shape for this feature. Blocking is one of the few
   controls a user expects to be enforced rather than merely respected by the
   UI they happen to be running — and the notification is exactly the part a
   suppression-on-read model cannot take back, because it has already been
   delivered.

   BOTH DIRECTIONS COUNT. If either party has blocked the other, the
   interaction is refused:
   - owner blocked actor — the protection users actually ask for;
   - actor blocked owner — you do not get to keep engaging with someone you
     blocked. Allowing it would also leak the blocker's activity back to them
     through their own kudos, which is a confusing state to be in.

   Fails CLOSED on a read error. A block that stops working when Firestore
   hiccups is not a block; refusing an interaction is recoverable (the user
   retries), delivering one to someone who blocked you is not.
   ───────────────────────────────────────────── */

/**
 * Is there a block in EITHER direction between these two users?
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} ownerUid  the user being interacted WITH (activity author,
 *                           post author, follow target)
 * @param {string} actorUid  the user doing the interacting
 * @returns {Promise<boolean>}
 */
async function isBlockedBetween(db, ownerUid, actorUid) {
  if (!db) return false;
  if (typeof ownerUid !== "string" || typeof actorUid !== "string") return false;
  if (!ownerUid || !actorUid) return false;
  // Self-interaction is never a block (a user can kudos their own activity;
  // whether the UI offers that is a separate question).
  if (ownerUid === actorUid) return false;

  try {
    const [ownerBlockedActor, actorBlockedOwner] = await Promise.all([
      db.doc(`blocks/${ownerUid}/users/${actorUid}`).get(),
      db.doc(`blocks/${actorUid}/users/${ownerUid}`).get(),
    ]);
    return ownerBlockedActor.exists || actorBlockedOwner.exists;
  } catch (_) {
    // Fail CLOSED — see the header. A refused interaction is recoverable; a
    // delivered one is not.
    return true;
  }
}

/**
 * The HttpsError a blocked interaction should raise.
 *
 * Deliberately says "not available" rather than "you are blocked": confirming
 * a block to the blocked party tells them something the blocker did not
 * choose to disclose, and invites them around it. `permission-denied` is the
 * honest code — the caller is authenticated and the request is well-formed;
 * they simply may not do this.
 */
function blockedError(functions) {
  return new functions.https.HttpsError(
    "permission-denied",
    "This content isn't available."
  );
}

module.exports = { isBlockedBetween, blockedError };
