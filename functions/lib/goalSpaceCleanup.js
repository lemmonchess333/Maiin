/**
 * GOALS-CORE-01 — account-deletion cleanup for Goal Spaces.
 *
 * The membership module's own header defers this ("goalSpaces
 * membership/event cleanup is a separate server concern") — without it,
 * deleting an account leaves three artefacts behind:
 *   - the member doc under every circle they were in (ghost member row,
 *     and the seat stays consumed because memberCount never decrements);
 *   - their authored events (frozen displayName snapshots);
 *   - an active circle whose owner no longer exists.
 *
 * `cleanupGoalSpacesForUser` runs inside the deletion executor BEFORE
 * the users/{uid}/* subcollection sweep (the sweep deletes journeys —
 * the membership index this cleanup enumerates from):
 *   1. per membership (journey doc id == spaceId):
 *      a. delete the user's authored events in that space
 *      b. leaveGoalSpace — the SAME transaction the live product uses:
 *         member doc + journey deleted, memberCount decremented, and
 *         the space deactivated when the departing user is the owner
 *         (v1 policy — ownership transfer is a later feature).
 *   2. per-space failures are logged and skipped — one bad space must
 *      never wedge an account deletion; leftover journey docs are
 *      caught by the executor's normal subcollection sweep right after.
 *
 * No invite cleanup needed in this model: the invite code lives ON the
 * space doc (rotated by recreating), there is no separate invites
 * collection.
 */

const { leaveGoalSpace, GoalSpaceError } = require("./goalSpaceMembership");

async function cleanupGoalSpacesForUser({ firestore, uid, logger = console }) {
  const journeysSnap = await firestore
    .collection("users")
    .doc(uid)
    .collection("journeys")
    .get();

  for (const journeyDoc of journeysSnap.docs) {
    const spaceId = journeyDoc.id;
    try {
      // 1a. Authored events — subcollection where-query (no
      // collection-group index needed; event docs carry `uid`).
      const eventsSnap = await firestore
        .collection("goalSpaces")
        .doc(spaceId)
        .collection("events")
        .where("uid", "==", uid)
        .get();
      for (const eventDoc of eventsSnap.docs) {
        await eventDoc.ref.delete();
      }
      // 1b. Leave — deletes member + journey, decrements memberCount,
      // deactivates if owner. Idempotent for a missing member doc.
      await leaveGoalSpace({ firestore, uid, spaceId });
    } catch (err) {
      if (err instanceof GoalSpaceError && err.code === "not-found") {
        // The space itself is gone — just drop the stale journey
        // pointer so the index doesn't dangle.
        await journeyDoc.ref.delete().catch(() => {});
      } else {
        logger.warn(
          `cleanupGoalSpacesForUser: space ${spaceId} cleanup failed`,
          err && err.message
        );
      }
    }
  }
}

module.exports = { cleanupGoalSpacesForUser };
