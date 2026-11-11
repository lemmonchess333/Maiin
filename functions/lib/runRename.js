"use strict";
/**
 * A renamed run's post takes the new name.
 *
 * The runner renames a saved run on its page (RunDetail), which writes
 * `name` on `users/{uid}/runs/{runId}`. A post is server-owned past its
 * visibility (the rules let its author change nothing else), so the name
 * reaches the post here, from onRunUpdated, as a corrected workout's
 * figures reach its post in workoutCorrections.
 *
 * Read in one transaction from the current documents, never the event's
 * snapshot, so a retried or out-of-order update writes the newest name and
 * a second delivery writes nothing. The post must be the runner's own run
 * post. A follower's feed holds only the post's id (feedIndex), so the
 * post is the one copy of its title.
 *
 * The new name passes the same word filter a post's name passed when it
 * was created (onActivityCreated): a name it refuses flags the post and
 * makes it private, and a flagged post stays flagged whatever it is
 * renamed to after.
 */
/** The longest name a run is saved under, as the app cuts it
 *  (`RUN_NAME_MAX`, src/lib/runNameLimit.ts; pinned equal by
 *  src/lib/__tests__/runRename.cross.test.ts). */
const RUN_NAME_MAX = 80;

/** The name as a post may carry it: trimmed and cut, or null for none. */
function postableRunName(value) {
  if (typeof value !== "string") return null;
  const name = value.trim().slice(0, RUN_NAME_MAX).trim();
  return name || null;
}

/** True when an update changed what a post's name reads from. */
function runNameMayHaveChanged(before = {}, after = {}) {
  return (
    before.name !== after.name ||
    before.sharedActivityId !== after.sharedActivityId
  );
}

/**
 * Carries the run's current name to its post. Returns what it did:
 * "renamed", "flagged", or "unchanged" when there was nothing to write.
 */
async function syncSharedRunName(db, uid, runId, { serverTimestamp } = {}) {
  // Required here, not at the top: the app's cross-test reads this module's
  // cut without the functions' installed packages.
  const profanityFilter = require("../profanityFilter");
  const runRef = db.doc(`users/${uid}/runs/${runId}`);
  return db.runTransaction(async (tx) => {
    const run = await tx.get(runRef);
    if (!run.exists) return "unchanged";
    const data = run.data();
    const name = postableRunName(data.name);
    const activityId = data.sharedActivityId;
    if (!name || typeof activityId !== "string" || !activityId)
      return "unchanged";
    const activityRef = db.collection("activities").doc(activityId);
    const activity = await tx.get(activityRef);
    if (!activity.exists) return "unchanged";
    const post = activity.data();
    if (post.authorId !== uid || post.type !== "run") return "unchanged";
    if (post.runName === name && post.activityTitle === name)
      return "unchanged";
    const update = { runName: name, activityTitle: name };
    if (
      post.flagged !== true &&
      profanityFilter.findProfaneField({ runName: name }, ["runName"])
    ) {
      tx.update(activityRef, {
        ...update,
        flagged: true,
        autoFlagged: true,
        flaggedField: "runName",
        ...(serverTimestamp ? { flaggedAt: serverTimestamp() } : {}),
        visibility: "private",
      });
      return "flagged";
    }
    tx.update(activityRef, update);
    return "renamed";
  });
}

module.exports = {
  RUN_NAME_MAX,
  postableRunName,
  runNameMayHaveChanged,
  syncSharedRunName,
};
