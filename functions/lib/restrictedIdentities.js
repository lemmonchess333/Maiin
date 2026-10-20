"use strict";

/**
 * A restriction that outlives deleting the account (the S4e lock's
 * latest STATUS).
 *
 * A restriction is `globalRestrictedUids/{uid}`, and a deleted account's
 * uid never comes back: signing in again with the same Google or Apple
 * account, or signing up with the same email, makes a new uid with no
 * restriction. So when a RESTRICTED account is deleted, deletion keeps a
 * keyed hash of each way it signed in (its email address, and its Google
 * and Apple subjects) in `restrictedIdentities/{hash}`, for 13 months. A
 * new account carrying any of them is restricted as it is created
 * (`onAuthUserCreated`), and lifting a restriction forgets them.
 *
 * Nothing else about the person is kept: no uid, no name, no reason. The
 * hash is the billing tombstone's HMAC (`BILLING_HMAC_SECRET`), with its
 * own kinds in the hashed text (`restriction-email:…`), so a billing key
 * and a restriction key never collide and neither can be reversed without
 * the secret. Without the secret nothing is kept and nothing is carried;
 * deletion and sign-up go ahead, and the warning says why.
 */

const billingIdentityHash = require("./billingIdentityHash");

const COLLECTION = "restrictedIdentities";
const RETENTION_MONTHS = 13;
const SIGN_IN_PROVIDERS = ["google.com", "apple.com"];

/** Each identity an Auth user record carries, as [kind, value]. */
function identitiesOf(userRecord) {
  const identities = [];
  const email =
    userRecord && typeof userRecord.email === "string"
      ? userRecord.email.trim().toLowerCase()
      : "";
  if (email) identities.push(["restriction-email", email]);
  for (const provider of (userRecord && userRecord.providerData) || []) {
    if (
      provider &&
      SIGN_IN_PROVIDERS.includes(provider.providerId) &&
      typeof provider.uid === "string" &&
      provider.uid
    ) {
      identities.push([`restriction-${provider.providerId}`, provider.uid]);
    }
  }
  return identities;
}

/** The keys to look under: the active secret's, and the previous one's
 *  during a rotation. Null when the secret is not provisioned. */
function lookupKeys(userRecord, logger, event) {
  try {
    return identitiesOf(userRecord).flatMap(([kind, value]) =>
      billingIdentityHash.billingIdentityLookupHashes(kind, value)
    );
  } catch (err) {
    logger.warn(event, { error: err && err.message });
    return null;
  }
}

async function getUserOrNull(auth, uid) {
  try {
    return await auth.getUser(uid);
  } catch (err) {
    if (err && err.code === "auth/user-not-found") return null;
    throw err;
  }
}

/**
 * Deletion, before the restriction itself is removed: keep the identities
 * of a restricted account. Writes nothing for an account that is not
 * restricted. Returns how many identities were kept.
 */
async function keepRestrictedIdentities({ firestore, auth, uid, now, logger }) {
  const restriction = await firestore
    .collection("globalRestrictedUids")
    .doc(uid)
    .get();
  if (!restriction.exists) return 0;
  const user = await getUserOrNull(auth, uid);
  if (!user) return 0;
  let keys;
  try {
    keys = identitiesOf(user).map(([kind, value]) =>
      billingIdentityHash.billingIdentityHash(kind, value)
    );
  } catch (err) {
    logger.warn("deleteAccount.restricted_identities_unavailable", {
      uid,
      error: err && err.message,
    });
    return 0;
  }
  if (keys.length === 0) return 0;
  const expiresAt = new Date(now);
  expiresAt.setUTCMonth(expiresAt.getUTCMonth() + RETENTION_MONTHS);
  const batch = firestore.batch();
  for (const key of keys) {
    batch.set(firestore.collection(COLLECTION).doc(key), {
      reason: "restricted-account-deleted",
      createdAt: new Date(now),
      expiresAt,
    });
  }
  await batch.commit();
  return keys.length;
}

/**
 * A new Auth account: restrict it when any of its identities belonged to a
 * restricted account that was deleted within the window. Returns whether
 * it did.
 */
async function carryRestriction({ firestore, userRecord, now, logger }) {
  const uid = userRecord && userRecord.uid;
  if (typeof uid !== "string" || !uid) return false;
  const keys = lookupKeys(
    userRecord,
    logger,
    "onAuthUserCreated.restricted_identities_unavailable"
  );
  if (!keys || keys.length === 0) return false;
  const snaps = await firestore.getAll(
    ...keys.map((key) => firestore.collection(COLLECTION).doc(key))
  );
  const live = snaps.some((snap) => {
    if (!snap.exists) return false;
    const expiresAt = snap.data().expiresAt;
    const ms =
      expiresAt && typeof expiresAt.toMillis === "function"
        ? expiresAt.toMillis()
        : expiresAt instanceof Date
          ? expiresAt.getTime()
          : null;
    return ms === null || ms > now;
  });
  if (!live) return false;
  await firestore.collection("globalRestrictedUids").doc(uid).set(
    {
      uid,
      restrictedAt: new Date(now),
      restrictionEndsAt: null,
      strikes: null,
      lastActionedReport: null,
      carriedFromDeletedAccount: true,
    },
    { merge: true }
  );
  logger.info("onAuthUserCreated.restriction_carried", { uid });
  return true;
}

/**
 * Lifting a restriction: forget the account's identities too, so a lifted
 * account deleted later starts its next one clear. Returns how many keys
 * were removed (a key that was never kept removes as nothing).
 */
async function forgetRestrictedIdentities({ firestore, auth, uid, logger }) {
  const user = await getUserOrNull(auth, uid);
  if (!user) return 0;
  const keys = lookupKeys(
    user,
    logger,
    "liftRestriction.restricted_identities_unavailable"
  );
  if (!keys || keys.length === 0) return 0;
  const batch = firestore.batch();
  for (const key of keys) {
    batch.delete(firestore.collection(COLLECTION).doc(key));
  }
  await batch.commit();
  return keys.length;
}

module.exports = {
  COLLECTION,
  RETENTION_MONTHS,
  identitiesOf,
  keepRestrictedIdentities,
  carryRestriction,
  forgetRestrictedIdentities,
};
