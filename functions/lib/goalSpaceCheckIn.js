/**
 * SOCIAL-FOCUS-01 — server-owned Circle weekly check-in + focus backing.
 *
 * Replaces the client-direct weekly_check_in event write with a
 * callable-only path (the rules drop 'weekly_check_in' from the
 * client-creatable kinds in the same change), which is what makes the
 * two contract points enforceable:
 *
 *   - ONE check-in event per member per week: the event doc ID is the
 *     deterministic `${uid}_${weekKey}`, so re-checking-in the same
 *     week can only land on the same doc — setting or changing the
 *     weekly focus UPDATES that doc in place (no second event, no
 *     notification) and reports { duplicate } / { updated } instead.
 *   - The optional weeklyFocus is a CLOSED six-value enum — a themed
 *     intent, never data. Counts, calories, loads, photos and routes
 *     structurally cannot ride along because the server writes the
 *     event from validated fields only; nothing is copied from the
 *     personal Momentum Check-in (users/{uid}/checkins).
 *
 * Backing ("Back this focus") is the bounded response loop: a member
 * other than the author appends their uid to the event's supporterIds
 * exactly once. Self, non-members, blocked pairs and departed authors
 * are rejected; the array is hard-bounded. The caller (index.js) sends
 * the recipient a GENERIC in-app notification — copy never includes
 * the focus, and this path has no push.
 *
 * House pattern: injected-firestore lib (unit-tested with stubs); the
 * thin index.js callables add auth, the deletion actor-lock, rate
 * limits and HttpsError mapping via mapGoalSpaceError.
 */

const { GoalSpaceError, assertNoBlockedPair } = require("./goalSpaceMembership");

/** The COMPLETE weekly-focus allowlist — mirror of the client enum in
 *  src/features/goalSpace/goalSpaceTypes.ts. Adding a value is a
 *  reviewed schema change on both sides. */
const WEEKLY_FOCUS_VALUES = Object.freeze([
  "strength",
  "running",
  "nutrition",
  "progress",
  "recovery",
  "balanced",
]);

/** Hard bound on supporterIds. Circles cap at 8 members (7 possible
 *  supporters) — this is a defensive ceiling, not a target. */
const MAX_FOCUS_SUPPORTERS = 16;

/** The client's local week (Sunday-start localWeekKey) can sit up to a
 *  day ahead of server UTC and a week behind it — ±10 days accepts
 *  every real timezone without letting a client back-date history. */
const WEEK_KEY_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;

/**
 * The client computes weekKey with its LOCAL calendar (localWeekKey —
 * the late-night-PST rule: never re-derive a user's local week from
 * server UTC). The server therefore validates shape + plausibility
 * instead of recomputing: strict YYYY-MM-DD, a real date, within the
 * skew window of now.
 */
function assertValidWeekKey(weekKey, now) {
  if (typeof weekKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) {
    throw new GoalSpaceError("invalid-argument", "weekKey required");
  }
  const parsed = Date.parse(`${weekKey}T00:00:00Z`);
  if (!Number.isFinite(parsed)) {
    throw new GoalSpaceError("invalid-argument", "weekKey invalid");
  }
  if (Math.abs(now - parsed) > WEEK_KEY_WINDOW_MS) {
    throw new GoalSpaceError("invalid-argument", "weekKey out of window");
  }
}

/** null/undefined → null; anything else must be in the closed enum. */
function normalizeWeeklyFocus(value) {
  if (value == null) return null;
  if (!WEEKLY_FOCUS_VALUES.includes(value)) {
    throw new GoalSpaceError("invalid-argument", "unknown weekly focus");
  }
  return value;
}

/**
 * Create-or-update the member's check-in event for one week.
 * Returns { ok, eventId, duplicate, updated }:
 *   - first check-in of the week   → duplicate:false, updated:false
 *   - re-submit with same focus    → duplicate:true,  updated:false (no write)
 *   - set/changed focus            → duplicate:false, updated:true
 *     (in-place update — createdAt and supporterIds are preserved,
 *      no second event exists to notify anyone about)
 */
async function weeklyCheckIn({ firestore, uid, spaceId, weekKey, weeklyFocus, now }) {
  if (typeof spaceId !== "string" || spaceId.length === 0) {
    throw new GoalSpaceError("invalid-argument", "spaceId required");
  }
  assertValidWeekKey(weekKey, now);
  const focus = normalizeWeeklyFocus(weeklyFocus);

  const eventId = `${uid}_${weekKey}`;
  return firestore.runTransaction(async (tx) => {
    const memberSnap = await tx.get(
      firestore.doc(`goalSpaces/${spaceId}/members/${uid}`)
    );
    if (!memberSnap.exists) {
      throw new GoalSpaceError("permission-denied", "not a member");
    }
    const eventRef = firestore.doc(`goalSpaces/${spaceId}/events/${eventId}`);
    const eventSnap = await tx.get(eventRef);
    if (!eventSnap.exists) {
      tx.set(eventRef, {
        uid,
        kind: "weekly_check_in",
        text: null,
        weekKey,
        weeklyFocus: focus,
        supporterIds: [],
        createdAt: now,
      });
      return { ok: true, eventId, duplicate: false, updated: false };
    }
    const existing = eventSnap.data();
    if ((existing.weeklyFocus ?? null) === focus) {
      return { ok: true, eventId, duplicate: true, updated: false };
    }
    // A focus change touches weeklyFocus + updatedAt ONLY — createdAt
    // and supporterIds are preserved, and no second event exists for
    // anything to notify about.
    tx.update(eventRef, { weeklyFocus: focus, updatedAt: now });
    return { ok: true, eventId, duplicate: false, updated: true };
  });
}

/**
 * Back another member's weekly focus — append the caller's uid to the
 * event's supporterIds, at most once. Returns { alreadyBacked,
 * authorUid }; the callable sends the generic notification only when
 * alreadyBacked is false.
 */
async function backWeeklyCheckIn({ firestore, uid, spaceId, eventId }) {
  if (typeof spaceId !== "string" || spaceId.length === 0) {
    throw new GoalSpaceError("invalid-argument", "spaceId required");
  }
  if (typeof eventId !== "string" || eventId.length === 0) {
    throw new GoalSpaceError("invalid-argument", "eventId required");
  }

  return firestore.runTransaction(async (tx) => {
    const callerSnap = await tx.get(
      firestore.doc(`goalSpaces/${spaceId}/members/${uid}`)
    );
    if (!callerSnap.exists) {
      throw new GoalSpaceError("permission-denied", "not a member");
    }
    const eventRef = firestore.doc(`goalSpaces/${spaceId}/events/${eventId}`);
    const eventSnap = await tx.get(eventRef);
    if (!eventSnap.exists || eventSnap.data().kind !== "weekly_check_in") {
      throw new GoalSpaceError("not-found", "no such check-in");
    }
    const event = eventSnap.data();
    if (!WEEKLY_FOCUS_VALUES.includes(event.weeklyFocus)) {
      // Backing exists for the FOCUS response loop only — a plain
      // check-in (weeklyFocus null, incl. all pre-focus events) has
      // nothing to back.
      throw new GoalSpaceError("failed-precondition", "no focus to back");
    }
    const authorUid = event.uid;
    if (authorUid === uid) {
      throw new GoalSpaceError("invalid-argument", "cannot back your own focus");
    }
    const authorSnap = await tx.get(
      firestore.doc(`goalSpaces/${spaceId}/members/${authorUid}`)
    );
    if (!authorSnap.exists) {
      // Author left the Circle (or their account was deleted, which
      // removes the membership) — the stale event stays readable but
      // is no longer a live social surface.
      throw new GoalSpaceError("failed-precondition", "author no longer a member");
    }
    await assertNoBlockedPair({ tx, firestore, uid, memberUids: [authorUid] });

    const supporterIds = Array.isArray(event.supporterIds)
      ? event.supporterIds.filter((s) => typeof s === "string")
      : [];
    if (supporterIds.includes(uid)) {
      return { alreadyBacked: true, authorUid };
    }
    if (supporterIds.length >= MAX_FOCUS_SUPPORTERS) {
      // Unreachable at the 8-member cap — a defensive bound, kept loud.
      throw new GoalSpaceError("failed-precondition", "supporter bound reached");
    }
    tx.update(eventRef, { supporterIds: [...supporterIds, uid] });
    return { alreadyBacked: false, authorUid };
  });
}

module.exports = {
  WEEKLY_FOCUS_VALUES,
  MAX_FOCUS_SUPPORTERS,
  weeklyCheckIn,
  backWeeklyCheckIn,
};
