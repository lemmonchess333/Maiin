/**
 * Idempotency-marker keys for challenge progress.
 *
 * Progress is credited by `applyChallengeProgressIncrement` and
 * `syncFastestEffortProgress`, each guarded by a marker doc under
 * `challenges/{id}/participants/{uid}/applied/{key}`. The marker is what
 * makes an at-least-once Firestore trigger safe to redeliver, and what
 * lets the join-time backfill replay a user's whole history without
 * double-counting.
 *
 * WHY THE KEY CARRIES A MEMBERSHIP, not just the source activity id.
 *
 * `leaveChallenge` deletes `participants/{uid}`. Firestore document
 * deletes do NOT cascade to subcollections, so every `applied/{sourceId}`
 * marker survives as an orphan under a path whose parent is gone.
 *
 * Re-joining then created a participant at `currentValue: 0` and fired
 * `onChallengeParticipantCreated`, whose whole purpose is to credit the
 * user's existing in-window activity. That backfill replays each source
 * through the same apply helpers — and every one of them hit a surviving
 * marker and returned a transactional no-op. So the re-joined user sat at
 * zero for their entire history in that window, permanently, while the
 * card read "no qualifying run yet".
 *
 * That is the exact symptom the backfill was written to fix (a day-20
 * joiner getting no credit for a day-5 run), reintroduced through the
 * side door for anyone who had ever left the challenge.
 *
 * Namespacing the marker by the membership makes a re-join a clean slate
 * by construction: a new membership cannot see the previous one's
 * markers, while a redelivery WITHIN one membership still lands on the
 * same key and stays a no-op. It needs no cleanup pass, and therefore no
 * ordering race between a delete-sweep and a concurrent re-join — the
 * failure mode a "delete the markers on leave" fix would have introduced,
 * where a late sweep wipes the markers a fresh backfill just wrote and
 * the next redelivery double-counts.
 *
 * `joinedAt` is the membership identity because it is already written by
 * BOTH creators of a participant doc — the client's `joinChallenge` and
 * the server's auto-enrol path — and is never rewritten for an existing
 * participant. Nothing new has to be persisted for this to work.
 */

/**
 * Stable membership component of a marker key.
 *
 * Accepts a Firestore `Timestamp`, a `Date`, or a millisecond number, so
 * callers can pass `snap.data().joinedAt` without knowing which of those
 * the document happens to hold. Anything unusable — a participant doc
 * predating `joinedAt`, or a malformed value — collapses to `"m0"`.
 *
 * That fallback is deliberately a CONSTANT rather than something derived
 * from the clock. A key that varied per call would make every delivery
 * look new and double-count on every redelivery, which is strictly worse
 * than the bug this fixes. A constant merely means such a participant
 * keeps one stable namespace, which is the pre-existing behaviour.
 */
function membershipKey(joinedAt) {
  let ms = null;
  if (joinedAt && typeof joinedAt.toMillis === "function") {
    ms = joinedAt.toMillis();
  } else if (joinedAt instanceof Date) {
    ms = joinedAt.getTime();
  } else if (typeof joinedAt === "number") {
    ms = joinedAt;
  }
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "m0";
  return `m${Math.trunc(ms)}`;
}

/**
 * Full marker document id for one (membership, source) pair.
 *
 * `sourceId` is the driving activity's document id. When it is absent the
 * caller supplies a deterministic fallback, so a missing id degrades to
 * "credited at most once per membership for this metric" rather than
 * silently disabling the guard entirely.
 */
function markerDocId(joinedAt, sourceId, fallback) {
  const source = sourceId || fallback;
  return `${membershipKey(joinedAt)}_${source}`;
}

module.exports = { membershipKey, markerDocId };
