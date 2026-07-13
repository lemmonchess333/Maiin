"use strict";

/**
 * Server-owned FCM token ownership (packet 19).
 *
 * An FCM token has exactly one canonical owner at a time:
 *   - device doc:  users/{uid}/devices/{sha256(token)}
 *   - claim doc:   fcmTokenClaims/{sha256(token)}
 * Only Cloud Functions create/transfer/release either record. Claiming the
 * same browser token as account B transactionally retires every matching
 * legacy/current device doc for account A before B's canonical doc is visible,
 * so a stale A write can never leave B unable to reclaim (owner-only Rules deny
 * B from deleting A's doc — the server is the only writer that can).
 *
 * The raw token lives ONLY in the owner device doc (Admin needs it to send). It
 * is never a document id, never logged, never returned by a callable.
 *
 * A fresh opaque binding id per claim + a short-lived revoked-binding fence
 * stop a claim already in flight from recreating itself after logout. A 30s
 * send lease on the claim blocks an ownership transfer while a sender that
 * already selected the current owner might still call FCM (§4a).
 */

const crypto = require("crypto");
const deletionLedger = require("./accountDeletionLedger");
const deletionStatus = require("./accountDeletionStatus");
const deletedAccountsTombstone = require("./deletedAccountsTombstone");

const OWNERSHIP_VERSION = 2;
const MIN_TOKEN_LENGTH = 20;
const MAX_TOKEN_LENGTH = 4096;
const MIN_BINDING_ID_LENGTH = 16;
const MAX_BINDING_ID_LENGTH = 128;
const MAX_DUPLICATE_DEVICE_DOCS = 25;
// A claimed browser may present arbitrary token-shaped strings. Bound both
// durable per-user registrations and the stale-request fences so one account
// cannot grow device/claim documents without limit.
const MAX_ACTIVE_DEVICE_REGISTRATIONS = 20;
const MAX_ACTIVE_REVOKED_BINDINGS = 64;
// A callable request cannot survive this long. Keeping a fence for 24 hours
// covers a request whose response is lost or delayed while still allowing a
// later, genuinely new registration with a new binding id.
const REVOCATION_WINDOW_MS = 24 * 60 * 60 * 1000;
// A sender holds an exclusive lease on a claim for at most this long; ownership
// mutations wait for it to clear or expire.
const SEND_LEASE_WINDOW_MS = 30_000;
const CLAIM_STATUS = Object.freeze({
  CLAIMED: "claimed",
  REVOKED: "revoked",
});

class PushTokenOwnershipError extends Error {
  constructor(code) {
    super(code);
    this.name = "PushTokenOwnershipError";
    this.code = code;
  }
}

function fail(code) {
  throw new PushTokenOwnershipError(code);
}

function assertToken(value) {
  if (
    typeof value !== "string" ||
    value.length < MIN_TOKEN_LENGTH ||
    value.length > MAX_TOKEN_LENGTH ||
    value.trim() !== value
  ) {
    fail("invalid-push-token");
  }
  return value;
}

function isBindingId(value) {
  return (
    typeof value === "string" &&
    value.length >= MIN_BINDING_ID_LENGTH &&
    value.length <= MAX_BINDING_ID_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function assertBindingId(value) {
  if (!isBindingId(value)) fail("invalid-push-binding");
  return value;
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(assertToken(token)).digest("hex");
}

function assertTokenHash(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new TypeError("tokenHash is required");
  }
  return value;
}

function assertUid(uid) {
  if (
    typeof uid !== "string" ||
    uid.length === 0 ||
    uid.includes("/") ||
    uid === "." ||
    uid === ".."
  ) {
    throw new TypeError("uid is required");
  }
  return uid;
}

function deviceRef(firestore, uid, hash) {
  return firestore.doc("users/" + assertUid(uid) + "/devices/" + hash);
}

function claimRef(firestore, hash) {
  return firestore.doc("fcmTokenClaims/" + hash);
}

function isUserDeviceRef(ref) {
  const segments = ref.path.split("/");
  return (
    segments.length === 4 &&
    segments[0] === "users" &&
    segments[2] === "devices"
  );
}

function uidFromUserDeviceRef(ref) {
  return isUserDeviceRef(ref) ? ref.path.split("/")[1] : null;
}

function createdAtFrom(snapshot, serverTimestamp) {
  return snapshot.exists && snapshot.get("createdAt")
    ? snapshot.get("createdAt")
    : serverTimestamp;
}

function activeRevocations(snapshot, nowMs) {
  const raw = snapshot.exists ? snapshot.get("revokedBindings") : [];
  if (!Array.isArray(raw)) return [];

  const byBindingId = new Map();
  for (const record of raw) {
    if (
      !record ||
      !isBindingId(record.bindingId) ||
      !Number.isFinite(record.expiresAtMs) ||
      record.expiresAtMs <= nowMs
    ) {
      continue;
    }
    const existing = byBindingId.get(record.bindingId);
    if (!existing || existing.expiresAtMs < record.expiresAtMs) {
      byBindingId.set(record.bindingId, {
        bindingId: record.bindingId,
        expiresAtMs: record.expiresAtMs,
      });
    }
  }
  return [...byBindingId.values()];
}

function withRevocation(revocations, bindingId, nowMs) {
  const byBindingId = new Map(
    revocations.map((record) => [record.bindingId, record])
  );
  if (
    !byBindingId.has(bindingId) &&
    byBindingId.size >= MAX_ACTIVE_REVOKED_BINDINGS
  ) {
    // Do not trim a still-live fence: trimming would allow an old in-flight
    // claim to recreate ownership. Refuse the new operation until TTL/time
    // expiry makes room.
    fail("too-many-push-token-revocations");
  }
  byBindingId.set(bindingId, {
    bindingId,
    expiresAtMs: nowMs + REVOCATION_WINDOW_MS,
  });
  return [...byBindingId.values()];
}

function isCanonicalClaim(snapshot) {
  return (
    snapshot.exists &&
    snapshot.get("ownershipVersion") === OWNERSHIP_VERSION &&
    snapshot.get("status") === CLAIM_STATUS.CLAIMED &&
    typeof snapshot.get("uid") === "string" &&
    isBindingId(snapshot.get("bindingId"))
  );
}

function activeSendLease(snapshot, nowMs) {
  const lease = snapshot.exists ? snapshot.get("sendLease") : null;
  if (
    !lease ||
    typeof lease.uid !== "string" ||
    !isBindingId(lease.bindingId) ||
    !isBindingId(lease.leaseId) ||
    !Number.isFinite(lease.expiresAtMs) ||
    lease.expiresAtMs <= nowMs
  ) {
    return null;
  }
  return lease;
}

function newSendLeaseId() {
  return crypto.randomBytes(24).toString("base64url");
}

function assertWritableInTransaction({ deletionSnap, tombstoneSnap, uid }) {
  if (
    deletionSnap.exists &&
    deletionStatus.isStatusActive(deletionSnap.get("status"))
  ) {
    throw deletionStatus.makeAccountDeletingError(uid);
  }
  if (
    tombstoneSnap.exists &&
    deletionStatus.isTombstoneLive(tombstoneSnap.data())
  ) {
    throw deletionStatus.makeAccountDeletedError(uid);
  }
}

async function claimToken({
  firestore,
  uid,
  token,
  platform,
  bindingId,
  serverTimestamp,
  nowMs = Date.now(),
}) {
  assertUid(uid);
  const normalizedToken = assertToken(token);
  const normalizedBindingId = assertBindingId(bindingId);
  if (platform !== "web") fail("invalid-push-platform");
  if (!serverTimestamp) throw new TypeError("serverTimestamp is required");

  const hash = tokenHash(normalizedToken);
  const currentDeviceRef = deviceRef(firestore, uid, hash);
  const currentClaimRef = claimRef(firestore, hash);
  const deletionRef = firestore.collection(deletionLedger.COLLECTION).doc(uid);
  const tombstoneRef = firestore
    .collection(deletedAccountsTombstone.COLLECTION)
    .doc(uid);
  const duplicateQuery = firestore
    .collectionGroup("devices")
    .where("token", "==", normalizedToken)
    .limit(MAX_DUPLICATE_DEVICE_DOCS + 1);
  const activeDevicesQuery = firestore
    .collection("users/" + uid + "/devices")
    .where("ownershipVersion", "==", OWNERSHIP_VERSION)
    .limit(MAX_ACTIVE_DEVICE_REGISTRATIONS + 1);

  return firestore.runTransaction(async (transaction) => {
    // Firestore transactions require every read before every write.
    const [
      claimSnap,
      ownDeviceSnap,
      duplicatesSnap,
      activeDevicesSnap,
      deletionSnap,
      tombstoneSnap,
    ] = await Promise.all([
      transaction.get(currentClaimRef),
      transaction.get(currentDeviceRef),
      transaction.get(duplicateQuery),
      transaction.get(activeDevicesQuery),
      transaction.get(deletionRef),
      transaction.get(tombstoneRef),
    ]);
    assertWritableInTransaction({ deletionSnap, tombstoneSnap, uid });
    // §4a: never mutate ownership while a sender still holds a live lease.
    if (activeSendLease(claimSnap, nowMs)) {
      fail("push-token-send-in-progress");
    }
    const revocations = activeRevocations(claimSnap, nowMs);
    if (
      revocations.some((record) => record.bindingId === normalizedBindingId)
    ) {
      fail("push-token-binding-revoked");
    }
    if (duplicatesSnap.size > MAX_DUPLICATE_DEVICE_DOCS) {
      fail("too-many-push-token-records");
    }

    const refsToRetire = new Map();
    const previousUid = isCanonicalClaim(claimSnap)
      ? claimSnap.get("uid")
      : null;
    if (typeof previousUid === "string" && previousUid !== uid) {
      refsToRetire.set(
        "users/" + previousUid + "/devices/" + hash,
        deviceRef(firestore, previousUid, hash)
      );
    }

    // This lazy migration removes any v1 document whose id was the raw token,
    // plus any old v2 duplicate, before the new owner becomes canonical.
    for (const duplicate of duplicatesSnap.docs) {
      const duplicateUid = uidFromUserDeviceRef(duplicate.ref);
      if (!duplicateUid || duplicate.ref.path === currentDeviceRef.path) {
        continue;
      }
      refsToRetire.set(duplicate.ref.path, duplicate.ref);
    }

    const currentDeviceAlreadyCounted = activeDevicesSnap.docs.some(
      (device) => device.ref.path === currentDeviceRef.path
    );
    const retiringActiveDeviceCount = activeDevicesSnap.docs.filter((device) =>
      refsToRetire.has(device.ref.path)
    ).length;
    // A bounded query that reaches cap + 1 cannot prove the true count after
    // local retirements, so fail closed rather than admitting unbounded docs.
    if (
      activeDevicesSnap.size === MAX_ACTIVE_DEVICE_REGISTRATIONS + 1 ||
      activeDevicesSnap.size -
        retiringActiveDeviceCount +
        (currentDeviceAlreadyCounted ? 0 : 1) >
        MAX_ACTIVE_DEVICE_REGISTRATIONS
    ) {
      fail("too-many-active-push-devices");
    }

    for (const ref of refsToRetire.values()) transaction.delete(ref);

    transaction.set(
      currentDeviceRef,
      {
        token: normalizedToken,
        tokenHash: hash,
        platform,
        ownershipVersion: OWNERSHIP_VERSION,
        bindingId: normalizedBindingId,
        updatedAt: serverTimestamp,
        ...(ownDeviceSnap.exists ? {} : { createdAt: serverTimestamp }),
      },
      { merge: true }
    );
    transaction.set(
      currentClaimRef,
      {
        uid,
        tokenHash: hash,
        ownershipVersion: OWNERSHIP_VERSION,
        status: CLAIM_STATUS.CLAIMED,
        bindingId: normalizedBindingId,
        revokedBindings: revocations,
        createdAt: createdAtFrom(claimSnap, serverTimestamp),
        updatedAt: serverTimestamp,
      },
      // Overwrite a short-lived revoked marker so its TTL field cannot later
      // delete a newly claimed token. An expired send lease is discarded here.
      { merge: false }
    );

    return {
      tokenHash: hash,
      bindingId: normalizedBindingId,
      retiredCount: refsToRetire.size,
    };
  });
}

async function releaseTokenIfOwned({
  firestore,
  uid,
  token,
  bindingId,
  serverTimestamp,
  revocationExpiresAt,
  nowMs = Date.now(),
}) {
  assertUid(uid);
  const normalizedToken = assertToken(token);
  const normalizedBindingId = assertBindingId(bindingId);
  if (!serverTimestamp || !revocationExpiresAt) {
    throw new TypeError("serverTimestamp and revocationExpiresAt are required");
  }
  const hash = tokenHash(normalizedToken);
  const ownedDeviceRef = deviceRef(firestore, uid, hash);
  const ownedClaimRef = claimRef(firestore, hash);

  return firestore.runTransaction(async (transaction) => {
    const [claimSnap, deviceSnap] = await Promise.all([
      transaction.get(ownedClaimRef),
      transaction.get(ownedDeviceRef),
    ]);
    // §4a: refuse while a sender holds a live lease; the caller retries.
    if (activeSendLease(claimSnap, nowMs)) {
      fail("push-token-send-in-progress");
    }
    const canonicalClaim = isCanonicalClaim(claimSnap);
    const claimIsOwned =
      canonicalClaim &&
      claimSnap.get("uid") === uid &&
      claimSnap.get("bindingId") === normalizedBindingId;
    const deviceIsOwned =
      deviceSnap.exists &&
      deviceSnap.get("token") === normalizedToken &&
      deviceSnap.get("ownershipVersion") === OWNERSHIP_VERSION &&
      deviceSnap.get("bindingId") === normalizedBindingId;

    const revocations = withRevocation(
      activeRevocations(claimSnap, nowMs),
      normalizedBindingId,
      nowMs
    );

    if (claimIsOwned) {
      if (deviceIsOwned) transaction.delete(ownedDeviceRef);
      transaction.set(
        ownedClaimRef,
        {
          tokenHash: hash,
          ownershipVersion: OWNERSHIP_VERSION,
          status: CLAIM_STATUS.REVOKED,
          revokedBindings: revocations,
          // This marker is intentionally short-lived. It prevents a claim
          // already on the wire from recreating the released binding; a new
          // claim uses a new binding id and overwrites this document.
          revocationExpiresAt,
          createdAt: createdAtFrom(claimSnap, serverTimestamp),
          updatedAt: serverTimestamp,
        },
        { merge: false }
      );
      return { released: true };
    }

    if (!claimSnap.exists || claimSnap.get("status") === CLAIM_STATUS.REVOKED) {
      // Fence a matching claim that was dispatched before logout but has not
      // committed yet. Never overwrite another account's active claim.
      transaction.set(
        ownedClaimRef,
        {
          tokenHash: hash,
          ownershipVersion: OWNERSHIP_VERSION,
          status: CLAIM_STATUS.REVOKED,
          revokedBindings: revocations,
          revocationExpiresAt,
          createdAt: createdAtFrom(claimSnap, serverTimestamp),
          updatedAt: serverTimestamp,
        },
        { merge: false }
      );
    } else if (canonicalClaim && claimSnap.get("uid") === uid) {
      // A newer binding for this same uid is active. Preserve it, but retain
      // the older binding's fence so an old request cannot reclaim the token.
      transaction.update(ownedClaimRef, {
        revokedBindings: revocations,
        updatedAt: serverTimestamp,
      });
    }

    return { released: false };
  });
}

async function loadClaimedRegistrations({ firestore, uid }) {
  assertUid(uid);
  const deviceSnap = await firestore
    .collection("users/" + uid + "/devices")
    .get();
  const byHash = new Map();
  for (const device of deviceSnap.docs) {
    if (device.get("ownershipVersion") !== OWNERSHIP_VERSION) continue;
    const token = device.get("token");
    const bindingId = device.get("bindingId");
    if (typeof token !== "string" || !isBindingId(bindingId)) continue;
    try {
      byHash.set(tokenHash(token), { token, bindingId });
    } catch (_) {
      // Malformed documents are ignored rather than passed to FCM.
    }
  }
  const candidates = [...byHash.entries()].map(([hash, registration]) => ({
    ...registration,
    hash,
  }));

  if (candidates.length === 0) return [];
  const claims = await firestore.getAll(
    ...candidates.map((candidate) => claimRef(firestore, candidate.hash))
  );
  return candidates
    .filter((candidate, index) => {
      const claim = claims[index];
      return (
        isCanonicalClaim(claim) &&
        claim.get("uid") === uid &&
        claim.get("bindingId") === candidate.bindingId
      );
    })
    .map(({ token, bindingId, hash }) => ({ token, bindingId, hash }));
}

async function acquireSendLease({
  firestore,
  uid,
  tokenHash: hash,
  bindingId,
  serverTimestamp,
  nowMs = Date.now(),
}) {
  assertUid(uid);
  assertTokenHash(hash);
  assertBindingId(bindingId);
  const leaseId = newSendLeaseId();
  const ref = claimRef(firestore, hash);

  return firestore.runTransaction(async (transaction) => {
    const claim = await transaction.get(ref);
    if (
      !isCanonicalClaim(claim) ||
      claim.get("uid") !== uid ||
      claim.get("bindingId") !== bindingId ||
      activeSendLease(claim, nowMs)
    ) {
      return null;
    }
    transaction.update(ref, {
      sendLease: {
        uid,
        bindingId,
        leaseId,
        expiresAtMs: nowMs + SEND_LEASE_WINDOW_MS,
      },
      updatedAt: serverTimestamp,
    });
    return { tokenHash: hash, bindingId, leaseId };
  });
}

async function releaseSendLease({
  firestore,
  uid,
  tokenHash: hash,
  bindingId,
  leaseId,
  serverTimestamp,
  nowMs = Date.now(),
}) {
  assertUid(uid);
  assertTokenHash(hash);
  assertBindingId(bindingId);
  assertBindingId(leaseId);
  const ref = claimRef(firestore, hash);
  await firestore.runTransaction(async (transaction) => {
    const claim = await transaction.get(ref);
    const lease = activeSendLease(claim, nowMs);
    if (
      lease &&
      lease.uid === uid &&
      lease.bindingId === bindingId &&
      lease.leaseId === leaseId
    ) {
      transaction.update(ref, { sendLease: null, updatedAt: serverTimestamp });
    }
  });
}

async function removeClaimsForDeletedUser({ firestore, uid }) {
  assertUid(uid);
  const PAGE_SIZE = 200;
  const CONCURRENCY = 20;

  for (;;) {
    const claimSnap = await firestore
      .collection("fcmTokenClaims")
      .where("uid", "==", uid)
      .limit(PAGE_SIZE)
      .get();
    if (claimSnap.empty) return;

    for (
      let offset = 0;
      offset < claimSnap.docs.length;
      offset += CONCURRENCY
    ) {
      const page = claimSnap.docs.slice(offset, offset + CONCURRENCY);
      await Promise.all(
        page.map((candidate) =>
          firestore.runTransaction(async (transaction) => {
            const current = await transaction.get(candidate.ref);
            // A token can transfer while account deletion is cleaning A. A
            // fresh transactional read is required; a stale batch delete here
            // would erase B's newly committed canonical claim.
            if (current.exists && current.get("uid") === uid) {
              // §4a: don't delete a claim under a sender that holds a lease;
              // let deletion stay retryable and proceed after the lease window.
              if (activeSendLease(current, Date.now())) {
                fail("push-token-send-in-progress");
              }
              transaction.delete(candidate.ref);
            }
          })
        )
      );
    }

    if (claimSnap.size < PAGE_SIZE) return;
  }
}

module.exports = {
  OWNERSHIP_VERSION,
  REVOCATION_WINDOW_MS,
  SEND_LEASE_WINDOW_MS,
  MAX_ACTIVE_DEVICE_REGISTRATIONS,
  MAX_ACTIVE_REVOKED_BINDINGS,
  PushTokenOwnershipError,
  assertToken,
  assertBindingId,
  tokenHash,
  claimToken,
  releaseTokenIfOwned,
  loadClaimedRegistrations,
  acquireSendLease,
  releaseSendLease,
  removeClaimsForDeletedUser,
};
