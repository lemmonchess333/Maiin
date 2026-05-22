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
]);

function storagePrefixesFor(uid) {
  return STORAGE_PREFIX_TEMPLATES.map((p) => p.replace("__UID__", uid));
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
}) {
  /* R1A Stress 7 kill-switch — operator-controlled emergency stop
     via `system/config.deletionExecutorEnabled`. Read at start; if
     explicitly false, abort before any deletion step. Missing doc
     OR missing field defaults to ENABLED so the operator can't
     accidentally lock themselves out by forgetting to provision
     config. */
  const configSnap = await firestore.doc("system/config").get();
  if (configSnap.exists && configSnap.data()?.deletionExecutorEnabled === false) {
    throw new Error("executor-disabled");
  }

  // 1. User's own subcollections
  for (const sub of USER_SUBCOLLECTIONS) {
    const snap = await firestore.collection("users").doc(uid).collection(sub).get();
    if (!snap.empty) {
      await deleteRefsInBatches(firestore, snap.docs.map((d) => d.ref));
    }
  }

  // 2. Top-level collections keyed by user id
  for (const { parent, sub } of TOP_LEVEL_USER_KEYED_COLLECTIONS) {
    const snap = await firestore.collection(parent).doc(uid).collection(sub).get();
    if (!snap.empty) {
      await deleteRefsInBatches(firestore, snap.docs.map((d) => d.ref));
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
    await deleteRefsInBatches(firestore, activitiesSnap.docs.map((d) => d.ref));
  }

  // 4. Public profile projection — `.catch(() => {})` because a
  // missing doc (e.g. user never finished onboarding) shouldn't
  // block the rest of the flow.
  await firestore.doc(`users/${uid}/public/profile`).delete().catch(() => {});

  // 5. The user document itself
  await firestore.collection("users").doc(uid).delete();

  // 6. Storage files. Per-prefix try/catch — a missing folder or
  // a transient Storage outage shouldn't block step 7.
  for (const prefix of storagePrefixesFor(uid)) {
    try {
      await storageBucket.deleteFiles({ prefix });
    } catch (e) {
      logger.warn(`deleteAccount: storage cleanup for ${prefix} failed`, e.message);
    }
  }

  // 7. FINAL: delete the Auth user.
  await auth.deleteUser(uid);
}

module.exports = {
  USER_SUBCOLLECTIONS,
  TOP_LEVEL_USER_KEYED_COLLECTIONS,
  storagePrefixesFor,
  deleteAccount,
};
