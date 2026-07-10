/**
 * GOALS-CORE-01 (slice 3) — server-owned Goal Space membership.
 *
 * The rules lock goalSpaces/{id} and members/{uid} to `write: if
 * false`: THIS module (Admin SDK, bypasses rules) is the only writer,
 * so a client can never forge membership, counts, or another member's
 * status. House pattern: injected-firestore lib (unit-testable with
 * stubs) + thin index.js callable wiring with maxInstances caps.
 *
 * Locked constraints (GsPb1): invite-only, 2–8 members, no public
 * discovery; blocked pairs cannot share a Circle; free at launch (no
 * entitlement gate). Every read-modify-write runs in a transaction
 * (at-least-once / concurrent callable invocations), and memberCount
 * is maintained server-side only.
 *
 * Invite model: the space doc carries a server-generated inviteCode.
 * Space docs are member-only readable, so the code never leaks via
 * reads — the owner shares it out-of-band (link/message). Joining
 * requires the current code; the owner can rotate it by recreating
 * the space in v1 (rotation callable is a later nicety).
 */

const GOAL_SPACE_MAX_MEMBERS = 8;
const GOAL_SPACE_TEXT_MAX = 200;
const GOAL_SPACE_TYPES = Object.freeze([
  "race",
  "strength_block",
  "body_composition",
  "nutrition_consistency",
  "hybrid",
]);

/** Typed error the callable wrappers map to HttpsError codes. */
class GoalSpaceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // "invalid-argument" | "not-found" | "permission-denied" | "failed-precondition"
  }
}

function sanitizeDisplay(value, fallback) {
  if (typeof value !== "string" || value.trim().length === 0) return fallback;
  return value.trim().slice(0, GOAL_SPACE_TEXT_MAX);
}

function memberDoc({ uid, displayName, photoURL, role, now }) {
  return {
    uid,
    displayName: sanitizeDisplay(displayName, "Member"),
    photoURL: typeof photoURL === "string" ? photoURL : null,
    role,
    joinedAt: now,
  };
}

/**
 * Both-direction block check between `uid` and every existing member.
 * ≤8 members → ≤16 point reads; runs inside the join transaction so
 * membership can't change underneath it.
 */
async function assertNoBlockedPair({ tx, firestore, uid, memberUids }) {
  for (const other of memberUids) {
    if (other === uid) continue;
    const [a, b] = await Promise.all([
      tx.get(firestore.doc(`blocks/${uid}/users/${other}`)),
      tx.get(firestore.doc(`blocks/${other}/users/${uid}`)),
    ]);
    if (a.exists || b.exists) {
      throw new GoalSpaceError(
        "permission-denied",
        "blocked-pair: cannot share a Circle"
      );
    }
  }
}

/**
 * Create a Circle: space doc + owner membership + 'joined' event, one
 * batch. `makeId` injected for testability.
 */
async function createGoalSpace({
  firestore,
  uid,
  displayName,
  photoURL,
  input,
  now,
  makeId,
}) {
  if (!GOAL_SPACE_TYPES.includes(input?.type)) {
    throw new GoalSpaceError("invalid-argument", "unknown goal space type");
  }
  const title = sanitizeDisplay(input.title, null);
  if (!title) {
    throw new GoalSpaceError("invalid-argument", "title required");
  }
  const targetDate =
    typeof input.targetDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(input.targetDate)
      ? input.targetDate
      : null;

  const spaceId = makeId();
  const inviteCode = makeId();
  const batch = firestore.batch();
  batch.set(firestore.doc(`goalSpaces/${spaceId}`), {
    id: spaceId,
    type: input.type,
    title,
    visibility: "invite_only",
    ownerId: uid,
    memberCount: 1,
    maxMembers: GOAL_SPACE_MAX_MEMBERS,
    targetDate,
    active: true,
    inviteCode,
    createdAt: now,
  });
  batch.set(
    firestore.doc(`goalSpaces/${spaceId}/members/${uid}`),
    memberDoc({ uid, displayName, photoURL, role: "owner", now })
  );
  batch.set(firestore.doc(`goalSpaces/${spaceId}/events/${makeId()}`), {
    uid,
    kind: "joined",
    text: null,
    weekKey: null,
    createdAt: now,
  });
  await batch.commit();
  return { spaceId, inviteCode };
}

/** Join via invite code — capacity + blocked-pair + idempotency. */
async function joinGoalSpace({
  firestore,
  uid,
  displayName,
  photoURL,
  spaceId,
  inviteCode,
  now,
  makeId,
}) {
  if (typeof spaceId !== "string" || typeof inviteCode !== "string") {
    throw new GoalSpaceError("invalid-argument", "spaceId + inviteCode required");
  }
  await firestore.runTransaction(async (tx) => {
    const spaceRef = firestore.doc(`goalSpaces/${spaceId}`);
    const spaceSnap = await tx.get(spaceRef);
    if (!spaceSnap.exists) {
      throw new GoalSpaceError("not-found", "no such circle");
    }
    const space = spaceSnap.data();
    if (space.active !== true) {
      throw new GoalSpaceError("failed-precondition", "circle inactive");
    }
    if (space.inviteCode !== inviteCode) {
      throw new GoalSpaceError("permission-denied", "bad invite");
    }
    const selfSnap = await tx.get(
      firestore.doc(`goalSpaces/${spaceId}/members/${uid}`)
    );
    if (selfSnap.exists) return; // idempotent re-join: no-op
    if (space.memberCount >= (space.maxMembers ?? GOAL_SPACE_MAX_MEMBERS)) {
      throw new GoalSpaceError("failed-precondition", "circle full");
    }
    const membersSnap = await tx.get(
      firestore.collection(`goalSpaces/${spaceId}/members`)
    );
    const memberUids = membersSnap.docs.map((d) => d.id);
    await assertNoBlockedPair({ tx, firestore, uid, memberUids });

    tx.set(
      firestore.doc(`goalSpaces/${spaceId}/members/${uid}`),
      memberDoc({ uid, displayName, photoURL, role: "member", now })
    );
    tx.update(spaceRef, { memberCount: space.memberCount + 1 });
    tx.set(firestore.doc(`goalSpaces/${spaceId}/events/${makeId()}`), {
      uid,
      kind: "joined",
      text: null,
      weekKey: null,
      createdAt: now,
    });
  });
}

/**
 * Leave a Circle. Owner leaving deactivates the space (v1 policy —
 * explicit and simple; ownership transfer is a later feature).
 */
async function leaveGoalSpace({ firestore, uid, spaceId }) {
  await firestore.runTransaction(async (tx) => {
    const spaceRef = firestore.doc(`goalSpaces/${spaceId}`);
    const spaceSnap = await tx.get(spaceRef);
    if (!spaceSnap.exists) {
      throw new GoalSpaceError("not-found", "no such circle");
    }
    const memberRef = firestore.doc(`goalSpaces/${spaceId}/members/${uid}`);
    const memberSnap = await tx.get(memberRef);
    if (!memberSnap.exists) return; // idempotent
    const space = spaceSnap.data();
    tx.delete(memberRef);
    const update = { memberCount: Math.max(0, space.memberCount - 1) };
    if (space.ownerId === uid) update.active = false;
    tx.update(spaceRef, update);
  });
}

/** Owner-only member removal. */
async function removeGoalSpaceMember({ firestore, uid, spaceId, memberUid }) {
  if (typeof memberUid !== "string" || memberUid === uid) {
    throw new GoalSpaceError("invalid-argument", "memberUid required");
  }
  await firestore.runTransaction(async (tx) => {
    const spaceRef = firestore.doc(`goalSpaces/${spaceId}`);
    const spaceSnap = await tx.get(spaceRef);
    if (!spaceSnap.exists) {
      throw new GoalSpaceError("not-found", "no such circle");
    }
    const space = spaceSnap.data();
    if (space.ownerId !== uid) {
      throw new GoalSpaceError("permission-denied", "owner only");
    }
    const memberRef = firestore.doc(
      `goalSpaces/${spaceId}/members/${memberUid}`
    );
    const memberSnap = await tx.get(memberRef);
    if (!memberSnap.exists) return; // idempotent
    tx.delete(memberRef);
    tx.update(spaceRef, { memberCount: Math.max(0, space.memberCount - 1) });
  });
}

module.exports = {
  GOAL_SPACE_MAX_MEMBERS,
  GOAL_SPACE_TYPES,
  GoalSpaceError,
  createGoalSpace,
  joinGoalSpace,
  leaveGoalSpace,
  removeGoalSpaceMember,
};
