/**
 * Account-deletion helper, split out of index.js so the call
 * ordering can be pinned with unit tests against stub Firestore /
 * Auth / Storage handles (no firebase-admin boot required).
 *
 * Why ordering matters: pre-W1f the deletion ran client-side and
 * deleted the Firebase Auth user FIRST, then tried to clean up
 * Firestore subcollections. As soon as the auth user was gone,
 * subsequent Firestore writes ran as an unauthenticated client and
 * either hit permission-denied or partially succeeded — leaving
 * the account in an inconsistent "ghost user with orphan data"
 * state. The post-W1f contract is the inverse: data first, auth
 * user last. If any step fails the user retries with valid
 * credentials still attached to the remaining orphans, rather
 * than getting stranded.
 *
 * Caller-injected `firestore`, `auth`, `storageBucket` handles so
 * unit tests can stub them with instrumented mocks. Storage
 * cleanup failures are absorbed per-prefix so a missing bucket
 * doesn't block the auth-user delete — that's a separate
 * invariant the tests pin.
 */

const crypto = require("crypto");
const ledger = require("./lib/accountDeletionLedger");

const USER_SUBCOLLECTIONS = Object.freeze([
  "meals",
  "workouts",
  "runs",
  "weights",
  "water",
  "bodyweight",
  "progressPhotos",
  "favorites",
  "preferences",
  // Saved routes (users/{uid}/savedRoutes) — follow-a-route library. Enumerated
  // here so a user's saved routes don't orphan when the account is deleted.
  "savedRoutes",
  // FCM device tokens (push #961). The executor enumerates rather than
  // recursing, and deleting users/{uid} does NOT cascade to its
  // subcollections — without this, device-token docs orphan under a
  // deleted user. Sign-out deletes the current device's token, but the
  // freeze blocks that during deletion and other devices aren't covered.
  "devices",
  // Lifetime-aggregate counters + per-source idempotency markers (server-
  // owned badge state — century_km / tonnage_100). Same enumerate-not-recurse
  // reason as above: these docs orphan under a deleted user without an entry.
  "lifetime",
  // Per-day macro-target snapshots (users/{uid}/dailyNutrition/{date}) backing
  // the target-dependent nutrition badges. Enumerate-not-recurse, so without
  // this entry a user's daily snapshots orphan on account deletion.
  "dailyNutrition",
]);

// `kudos` is excluded — author-keyed top-level docs are handled by
// not iterating them (the original handler had a `sub: null` entry
// that short-circuited). Listing only the actually-iterated pairs
// here so the test can assert exhaustively without a "skipped"
// branch in the helper.
const TOP_LEVEL_USER_KEYED_COLLECTIONS = Object.freeze([
  { parent: "feeds", sub: "items" },
  { parent: "notifications", sub: "items" },
  { parent: "following", sub: "users" },
  { parent: "followers", sub: "users" },
  { parent: "blocks", sub: "users" },
]);

const STORAGE_PREFIX_TEMPLATES = Object.freeze([
  "progress-photos/__UID__/",
  "profile-photos/__UID__/",
  // Food diary photos (src/lib/foodPhotoUpload.ts). Meal deletion is
  // soft (24h restore) so blobs are never deleted with the meal —
  // this sweep is the only cleanup path, same as progress photos.
  "food-photos/__UID__/",
]);

function storagePrefixesFor(uid) {
  return STORAGE_PREFIX_TEMPLATES.map((p) => p.replace("__UID__", uid));
}

/**
 * Does a `system/config.deletionExecutorEnabled` value UNAMBIGUOUSLY mean
 * "disabled"? (money-path audit F5.)
 *
 * The Firebase Console stores a field as a STRING by default, so an operator
 * pausing deletions in an incident typically writes the string "false" — which
 * a bare `=== false` misses, silently ignoring the emergency stop while the
 * operator sees their write land and assumes it took effect. Honour boolean
 * `false` AND the common "disable" string tokens.
 *
 * Lock-out defence is preserved: anything ELSE (missing field, unreadable doc,
 * a random string, a number) stays ENABLED (fail-open), so a typo or a
 * transient Firestore blip can never permanently brick the deletion fleet.
 */
const DISABLE_TOKENS = new Set(["false", "0", "off", "no", "disabled"]);
function readsAsDisabled(value) {
  if (value === false) return true;
  if (typeof value === "string") {
    return DISABLE_TOKENS.has(value.trim().toLowerCase());
  }
  return false;
}

/**
 * Batched delete. Firestore write batches cap at 500 ops; we chunk
 * at 450 to keep margin for retries.
 */
async function deleteRefsInBatches(firestore, refs) {
  for (let i = 0; i < refs.length; i += 450) {
    const batch = firestore.batch();
    refs.slice(i, i + 450).forEach((r) => batch.delete(r));
    await batch.commit();
  }
}

/**
 * Delete every Firestore + Storage artefact owned by `uid`, then
 * delete the Auth user as the final step.
 *
 * CRITICAL INVARIANT: `auth.deleteUser(uid)` must be the LAST
 * external call. If any preceding step throws, the function
 * re-throws and `auth.deleteUser` is never reached — the user
 * keeps their credentials so a retry can finish the cleanup.
 *
 * Per-step semantics:
 *   1. User subcollections (users/{uid}/*) — batch delete each.
 *   2. Top-level user-keyed subcollections — batch delete each.
 *   3. Activities authored by uid — batch delete the matching set.
 *   4. Public profile mirror (users/{uid}/public/profile) —
 *      best-effort delete (missing doc swallowed).
 *   5. The user document itself.
 *   6. Storage files under each prefix — per-prefix try/catch so
 *      a missing folder / storage outage doesn't block (7).
 *   7. The Auth user.
 *
 * `logger` is injected so production passes Cloud Logging's
 * structured logger and tests pass a noop. Defaults to `console`
 * for the same reason.
 */
async function deleteAccount({
  firestore,
  auth,
  storageBucket,
  uid,
  logger = console,
  cancelStripeSubscription,
  // R1A Chunk 3 — per-invocation lease owner id + injectable clock (ms) so the
  // lease/state-machine is deterministically testable.
  leaseOwner,
  now = Date.now(),
}) {
  /* R1A Stress 7 kill-switch — operator-controlled emergency stop
     via `system/config.deletionExecutorEnabled`. Read at start; if
     strictly === false, abort before any deletion step.
     Fail-open invariants (lock-out defence):
       - Missing doc → ENABLED
       - Missing field → ENABLED
       - Field set to non-boolean (`"false"` string, `null`, `0`) →
         ENABLED, with a `kill_switch_malformed` warning so the
         operator sees that their write didn't take effect (most
         common cause: Firebase Console renders the value as a
         string when the field type wasn't pre-set).
       - Firestore read error → ENABLED (matches the `isFlagEnabled`
         helper in index.js; a transient Firestore blip on this read
         must not disable the entire deletion fleet).
     TOCTOU note: the switch is read once at the start of an
     invocation. Flipping the flag mid-flight does NOT stop an
     in-progress deletion; it only prevents new ones. Operators
     should treat the switch as "stop accepting new requests"
     rather than "abort all in-flight work". For "rogue executor"
     incidents (something is calling deleteMyAccount maliciously)
     the kill-switch alone is insufficient — disable the function
     directly or rotate the service account.
     The thrown error carries `code: "executor-disabled"` AND a
     `details: { reason }` payload so the callable wrapper in
     index.js can build a typed HttpsError("failed-precondition")
     with structured `details` for the client to branch on. Log
     lines use dotted event names (`deleteAccount.kill_switch_*`)
     for Cloud Logging filtering. */
  let killSwitchActive = false;
  try {
    const configSnap = await firestore.doc("system/config").get();
    if (configSnap.exists) {
      const value = configSnap.data()?.deletionExecutorEnabled;
      // F5: honour a value that unambiguously reads as "disabled" — including
      // the string "false" the Console stores by default — so a stringified
      // pause isn't silently ignored. Ambiguous values stay ENABLED (fail-open)
      // and still emit the malformed warning below.
      if (readsAsDisabled(value)) {
        killSwitchActive = true;
      } else if (value !== undefined && typeof value !== "boolean") {
        logger.warn("deleteAccount.kill_switch_malformed", {
          uid,
          valueType: typeof value,
          value: String(value),
        });
      }
    }
  } catch (err) {
    logger.warn("deleteAccount.kill_switch_read_failed", {
      uid,
      error: err.message,
    });
  }
  if (killSwitchActive) {
    logger.warn("deleteAccount.kill_switch_trip", { uid });
    const killSwitchError = new Error("executor-disabled");
    killSwitchError.code = "executor-disabled";
    killSwitchError.details = { reason: "executor-disabled" };
    throw killSwitchError;
  }

  // R1A Chunk 3 — acquire the deletion lease. This transactionally SETs
  // accountDeletionRequests/{uid}.status='running', which engages the
  // firestore.rules write-freeze (isDeleting) for the whole cascade — closing
  // the concurrent-write orphan/resurrect window (money-path audit F2). The
  // monotonic leaseGeneration guards the irreversible auth-delete against a
  // takeover by a retry.
  const leaseOwnerId = leaseOwner || crypto.randomUUID();
  const lease = await ledger.acquireLease({
    firestore,
    uid,
    leaseOwner: leaseOwnerId,
    now,
  });
  if (!lease.acquired) {
    if (lease.reason === "leased") {
      // Another executor holds a live lease — a deletion is already running.
      logger.warn("deleteAccount.lease_contended", { uid });
      const contended = new Error("deletion-in-progress");
      contended.code = "deletion-in-progress";
      throw contended;
    }
    logger.info("deleteAccount.lease_not_acquired", {
      uid,
      reason: lease.reason,
    });
    return;
  }
  const generation = lease.generation;
  let stage = "cascade";

  try {
    // 0. Sub1 R1A pin (b) — cancel active Stripe subscription BEFORE
    // purging user data. The stripeSubscriptionId lives on the user
    // doc, which step 5 deletes — so we must read + cancel here
    // first. Apple IAP subs aren't handled server-side (Apple has no
    // admin-cancellation API for standard IAP subs; that path is
    // handled client-side in AccountSection.tsx via the warn-and-
    // deep-link modal).
    if (cancelStripeSubscription) {
      try {
        const snap = await firestore.collection("users").doc(uid).get();
        if (snap.exists) {
          const data = snap.data();
          if (data && data.stripeSubscriptionId) {
            await cancelStripeSubscription({
              uid,
              stripeSubscriptionId: data.stripeSubscriptionId,
              logger,
            });
          }
        }
      } catch (err) {
        // Locked semantic: provider cancellation MUST NOT block
        // deletion. Surface the failure to Cloud Logging so an
        // operator can manually cancel via the Stripe dashboard,
        // but proceed with the data delete regardless.
        logger.warn("deleteAccount.subscription_cancel_failed", {
          uid,
          error: err && err.message,
        });
      }
    }

    // 1. User's own subcollections
    stage = "user_subcollections";
    for (const sub of USER_SUBCOLLECTIONS) {
      const snap = await firestore
        .collection("users")
        .doc(uid)
        .collection(sub)
        .get();
      if (!snap.empty) {
        await deleteRefsInBatches(
          firestore,
          snap.docs.map((d) => d.ref)
        );
      }
    }

    // 2. Top-level collections keyed by user id
    for (const { parent, sub } of TOP_LEVEL_USER_KEYED_COLLECTIONS) {
      const snap = await firestore
        .collection(parent)
        .doc(uid)
        .collection(sub)
        .get();
      if (!snap.empty) {
        await deleteRefsInBatches(
          firestore,
          snap.docs.map((d) => d.ref)
        );
      }
    }

    // 3. Activities the user posted. Deliberately NOT touching
    // comments / kudos the user gave on others' activities — those
    // are part of the other users' feeds and mutating them
    // retroactively would surprise people.
    const activitiesSnap = await firestore
      .collection("activities")
      .where("authorId", "==", uid)
      .get();
    if (!activitiesSnap.empty) {
      await deleteRefsInBatches(
        firestore,
        activitiesSnap.docs.map((d) => d.ref)
      );
    }

    // 3b. Partner-streak bonds the user is a member of (SOCIAL S3).
    // Bonds are 1:1; when one member deletes their account the bond is
    // deleted (the deletion-safe behaviour — the surviving partner's
    // PartnerStreak surface reverts to its invite state). Query by the
    // `members` array (array-contains), same query-delete shape as (3),
    // and BEFORE the auth user (7) so a throw here leaves credentials
    // intact for a retry.
    const bondsSnap = await firestore
      .collection("partnerBonds")
      .where("members", "array-contains", uid)
      .get();
    if (!bondsSnap.empty) {
      await deleteRefsInBatches(
        firestore,
        bondsSnap.docs.map((d) => d.ref)
      );
    }

    // 4. Public profile projection — `.catch(() => {})` because a
    // missing doc (e.g. user never finished onboarding) shouldn't
    // block the rest of the flow.
    await firestore
      .doc(`users/${uid}/public/profile`)
      .delete()
      .catch(() => {});

    // 5. The user document itself
    stage = "user_document";
    await firestore.collection("users").doc(uid).delete();

    // 6. Storage files. Per-prefix try/catch — a missing folder or
    // a transient Storage outage shouldn't block step 7.
    for (const prefix of storagePrefixesFor(uid)) {
      try {
        await storageBucket.deleteFiles({ prefix });
      } catch (e) {
        logger.warn(
          `deleteAccount: storage cleanup for ${prefix} failed`,
          e.message
        );
      }
    }

    // Split-brain guard: if a retry took over our lease (generation bumped),
    // abort BEFORE the irreversible auth delete — the taker owns it now.
    stage = "verify_lease";
    const stillOwner = await ledger.verifyLeaseGeneration({
      firestore,
      uid,
      expectedGeneration: generation,
    });
    if (!stillOwner) {
      const superseded = new Error("deletion-superseded");
      superseded.code = "deletion-superseded";
      throw superseded;
    }

    // 7. FINAL: delete the Auth user.
    stage = "auth_deletion";
    await auth.deleteUser(uid);

    // Success — mark completed + set the 30-day TTL cleanup. Runs AFTER the
    // auth delete (Admin SDK, unaffected by the user being gone); its own
    // failure does not undo a successful deletion, so it is swallowed.
    try {
      await ledger.transitionStatus({
        firestore,
        uid,
        toStatus: ledger.STATUS.COMPLETED,
        expectedGeneration: generation,
        extraFields: {
          completedAt: now,
          cleanupAfter: now + ledger.LEDGER_RETENTION_MS,
        },
        now,
      });
    } catch (completeErr) {
      logger.error("deleteAccount.completed_write_failed", {
        uid,
        error: completeErr && completeErr.message,
      });
    }
  } catch (err) {
    // A takeover happened mid-cascade — the taker owns the ledger; do not
    // overwrite its state.
    if (err && err.code === "deletion-superseded") {
      logger.warn("deleteAccount.superseded", { uid, generation });
      throw err;
    }
    // Failure BEFORE the auth delete: the user still has valid credentials and
    // can retry (the pre-existing "data first, auth last" rail). Flip to
    // failed_cleanup so the write-freeze STAYS engaged (a frozen status) and a
    // retry / operator takes over, rather than the user writing into a
    // half-deleted account. A superseded transition is a safe no-op.
    try {
      await ledger.transitionStatus({
        firestore,
        uid,
        toStatus: ledger.STATUS.FAILED_CLEANUP,
        expectedGeneration: generation,
        extraFields: {
          failedStage: stage,
          lastErrorCode: (err && err.code) || "unknown",
          lastErrorMessage: String((err && err.message) || "").slice(0, 500),
        },
        now,
      });
    } catch (transitionErr) {
      logger.error("deleteAccount.failed_cleanup_write_failed", {
        uid,
        error: transitionErr && transitionErr.message,
      });
    }
    throw err;
  }
}

module.exports = {
  USER_SUBCOLLECTIONS,
  TOP_LEVEL_USER_KEYED_COLLECTIONS,
  storagePrefixesFor,
  readsAsDisabled,
  deleteAccount,
};
