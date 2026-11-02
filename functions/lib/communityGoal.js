"use strict";

/**
 * The community goal ("Together: 1,000 km"): one total that every saved
 * run adds to, whoever ran it, joined or not.
 *
 * A challenge is a community goal when it has a `collectiveTarget` and the
 * `total_km` metric (`group-goal-…` in challengeDefs.js). The per-person
 * challenge path (`applyChallengeProgressIncrement`) credits members only,
 * and nothing in the app offers a Join for this goal, so a total built
 * from members stayed at 0. This path credits the goal itself instead.
 *
 * WHAT IS STORED
 *
 *   challenges/{id}.collectiveMeters   the total, in whole metres
 *   challenges/{id}.collectiveRunners  how many people have a run in it
 *   users/{uid}/communityGoal/{id}_{runId}
 *       one run's credit: { challengeId, runId, meters, activityDateKey }
 *   users/{uid}/communityGoal/{id}
 *       one person's tally in one goal: { challengeId, runs, meters }
 *
 * Whole metres, not kilometres: every change is a FieldValue.increment,
 * and integer increments are exact where decimal ones are not. A total of
 * kilometres that had every run taken back off could stand at 1e-13
 * rather than 0, and the app would draw the goal at "0 of 1,000 km".
 *
 * The person's tally is what counts them once. Their first run in a goal
 * creates it and adds one runner; a delete that takes their last run out
 * removes it and takes the runner back. It is read inside the same
 * transaction as the run's marker, so two of one person's runs saved
 * together cannot both count as the first.
 *
 * Both live under the runner, not under the challenge. The account
 * deletion sweep erases `users/{uid}/communityGoal` with the rest of the
 * user's tree (USER_SUBCOLLECTIONS), a run's delete finds its markers with
 * one equality query on `runId`, and the challenge document itself is only
 * ever incremented, never read, inside a credit: it is the one document
 * every run in the app writes to, so a transaction that read it would hold
 * every other runner's credit up behind it. What an erased account added
 * stays in the total, which carries no name, as a run deleted with an
 * account stays in a finished race's result.
 *
 * WHAT COUNTS. The runs the per-person path counts, by the same functions:
 * eligible (`isVolumeEligibleRun`), held to the shared-credit bounds
 * (`runChallengeIncrements` → `runMetersFor`), dated inside the goal's
 * window (`challengeContainsActivityDate`), and still saved when the
 * transaction runs. A restricted account adds nothing: a restriction
 * refuses adding to what other people see, and taking away stays open, so
 * a run counted before the restriction still comes off when deleted.
 *
 * IDEMPOTENCY. The run's marker is written in the transaction that adds
 * its metres, so a redelivered trigger finds it and adds nothing. The
 * reversal reads the metres back off the marker (ADR-0012: read the
 * applied amount, never re-derive it) and deletes it in the transaction
 * that takes them away, so a redelivered delete finds nothing to undo,
 * and the same run saved again under the same id counts afresh.
 *
 * COST, per saved run: one query of the challenges still open on its day
 * (about ten documents), then per community goal a transaction of four
 * reads (the marker, the tally, the restriction, the run) and three
 * writes. Per deleted run: one query of the person's markers for that run
 * and a transaction of three reads and up to three writes.
 */

const { isVolumeEligibleRun } = require("./runEligibility");
const { runChallengeIncrements } = require("./challengeBackfill");
const {
  challengeContainsActivityDate,
  instantToDateKey,
  openOnDayBound,
  sourceActivityDateKey,
} = require("./challengeActivityWindow");
const accountDeletionLocks = require("./accountDeletionLocks");

/** Whether a challenge doc is a community goal. */
function isCommunityGoal(challenge) {
  return (
    !!challenge &&
    Number(challenge.collectiveTarget) > 0 &&
    challenge.metric === "total_km"
  );
}

/**
 * A community goal's total in kilometres, read off its challenge doc. The
 * app reads the same field the same way (src/features/challenges/
 * collectiveGoal.ts `collectiveTotal`, pinned by
 * collectiveGoal.cross.test.ts).
 */
function communityGoalKm(challenge) {
  const meters = Number(challenge && challenge.collectiveMeters);
  return Number.isFinite(meters) && meters > 0 ? meters / 1000 : 0;
}

/**
 * The whole metres one run adds to a community goal: its `total_km`
 * credit, the figure a member's own progress gets, so the goal and a
 * member's line never disagree about a run. Zero for a run that counts
 * nowhere (ineligible, or past the shared-credit bounds).
 */
function communityGoalMeters(data) {
  if (!isVolumeEligibleRun(data)) return 0;
  const km = runChallengeIncrements(data).find(
    (inc) => inc.metric === "total_km"
  );
  return km ? Math.round(km.value * 1000) : 0;
}

/** The person's markers. Spelled out, not built from a constant, so the
 *  account-deletion sweep's guard (accountDeletionSubcollections.test.js)
 *  can read the path. */
function markers(db, uid) {
  return db.collection("users").doc(uid).collection("communityGoal");
}

function markerRef(db, uid, challengeId, runId) {
  return markers(db, uid).doc(`${challengeId}_${runId}`);
}

function tallyRef(db, uid, challengeId) {
  return markers(db, uid).doc(challengeId);
}

/**
 * Add one saved run to every community goal whose window holds its day.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {object} args
 * @param {string} args.uid
 * @param {string} args.runId
 * @param {object} args.data           the run document
 * @param {string|null} args.activityDateKey  the run's day (sourceActivityDateKey)
 * @param {FirebaseFirestore.DocumentReference} [args.sourceRef]  the run
 * @param {{increment: Function, serverTimestamp: Function}} args.fieldValue
 * @returns {Promise<number>} how many goals this call added the run to
 */
async function creditRunToCommunityGoals(
  db,
  { uid, runId, data, activityDateKey, sourceRef = null, fieldValue }
) {
  if (!uid || !runId) return 0;
  const meters = communityGoalMeters(data);
  if (!(meters > 0)) return 0;
  // Without the run's day there is no telling which month it belongs to.
  const dayBound = openOnDayBound(activityDateKey);
  if (!dayBound) return 0;

  const open = await db
    .collection("challenges")
    .where("endDate", ">", dayBound)
    .get();
  let credited = 0;
  for (const doc of open.docs) {
    const challenge = doc.data() || {};
    if (!isCommunityGoal(challenge)) continue;
    if (!challengeContainsActivityDate(challenge, activityDateKey)) continue;
    const added = await creditOne(db, doc.ref, {
      uid,
      runId,
      meters,
      activityDateKey,
      sourceRef,
      fieldValue,
    });
    if (added) credited += 1;
  }
  return credited;
}

async function creditOne(
  db,
  challengeRef,
  { uid, runId, meters, activityDateKey, sourceRef, fieldValue }
) {
  const marker = markerRef(db, uid, challengeRef.id, runId);
  const tally = tallyRef(db, uid, challengeRef.id);
  const restricted = db.collection("globalRestrictedUids").doc(uid);
  return db.runTransaction(async (tx) => {
    const [markerSnap, tallySnap, restrictedSnap, sourceSnap] =
      await Promise.all([
        tx.get(marker),
        tx.get(tally),
        tx.get(restricted),
        sourceRef ? tx.get(sourceRef) : null,
      ]);
    if (markerSnap.exists) return false; // already counted
    if (restrictedSnap.exists) return false;
    // A run deleted before this lands credits nothing: its delete either
    // committed first (nothing to count) or comes after (finds the marker).
    if (sourceSnap && !sourceSnap.exists) return false;

    const before = tallySnap.exists ? tallySnap.data() || {} : {};
    const runsBefore = Math.max(0, Number(before.runs) || 0);
    tx.set(marker, {
      challengeId: challengeRef.id,
      runId,
      meters,
      activityDateKey,
      appliedAt: fieldValue.serverTimestamp(),
    });
    tx.set(tally, {
      challengeId: challengeRef.id,
      runs: runsBefore + 1,
      meters: Math.max(0, Number(before.meters) || 0) + meters,
    });
    tx.update(challengeRef, {
      collectiveMeters: fieldValue.increment(meters),
      ...(runsBefore === 0
        ? { collectiveRunners: fieldValue.increment(1) }
        : {}),
    });
    return true;
  });
}

/**
 * Take one deleted run back off every community goal it was added to.
 * Throws when any of them could not be undone, after trying the rest, so
 * the delete trigger fails and is delivered again; the ones that landed
 * have no marker left and are not undone twice.
 *
 * @returns {Promise<number>} how many goals the run came off
 */
async function reverseRunFromCommunityGoals(db, { uid, runId, fieldValue }) {
  if (!uid || !runId) return 0;
  const credits = await markers(db, uid).where("runId", "==", runId).get();

  let reversed = 0;
  const failed = [];
  for (const doc of credits.docs) {
    const challengeId = (doc.data() || {}).challengeId;
    if (typeof challengeId !== "string" || !challengeId) continue;
    try {
      if (await reverseOne(db, doc.ref, challengeId, uid, fieldValue))
        reversed += 1;
    } catch (err) {
      failed.push(challengeId);
      console.error(
        `communityGoal: reversal failed for ${uid}/${runId} in ${challengeId}:`,
        err.message
      );
    }
  }
  if (failed.length > 0) {
    throw new Error(
      `communityGoal: ${failed.length} goal(s) not reversed for ${uid}/${runId}: ${failed.join(", ")}`
    );
  }
  return reversed;
}

async function reverseOne(db, marker, challengeId, uid, fieldValue) {
  const tally = tallyRef(db, uid, challengeId);
  const challengeRef = db.collection("challenges").doc(challengeId);
  return db.runTransaction(async (tx) => {
    const [markerSnap, tallySnap, challengeSnap] = await Promise.all([
      tx.get(marker),
      tx.get(tally),
      tx.get(challengeRef),
    ]);
    if (!markerSnap.exists) return false; // already taken back
    const meters = Math.max(0, Math.round(Number(markerSnap.data().meters) || 0));
    const before = tallySnap.exists ? tallySnap.data() || {} : {};
    const runsLeft = Math.max(0, (Number(before.runs) || 0) - 1);
    // The last of this person's runs in the goal takes them out of the
    // runner count. A tally already gone has nobody left to take out.
    const lastRun = tallySnap.exists && runsLeft === 0;

    tx.delete(marker);
    if (lastRun) tx.delete(tally);
    else if (tallySnap.exists)
      tx.set(tally, {
        challengeId,
        runs: runsLeft,
        meters: Math.max(0, (Number(before.meters) || 0) - meters),
      });
    // Challenges are never deleted, but an update of a missing document
    // fails, and would fail every redelivery of this delete with it.
    if (challengeSnap.exists)
      tx.update(challengeRef, {
        collectiveMeters: fieldValue.increment(-meters),
        ...(lastRun ? { collectiveRunners: fieldValue.increment(-1) } : {}),
      });
    return true;
  });
}

/**
 * Add the runs saved before this path existed to one community goal: every
 * person's runs dated inside its window, each through
 * `creditRunToCommunityGoals`, so a run already counted adds nothing and
 * the script can be run again at any time. Skips an account being deleted.
 *
 * Reads each person's runs by `date` (YYYY-MM-DD, which every saved run
 * carries); a legacy run with no `date` is left out.
 *
 * @returns {Promise<{users:number, runs:number, credited:number}>}
 */
async function backfillCommunityGoal(db, { challengeId, fieldValue }) {
  const totals = { users: 0, runs: 0, credited: 0 };
  const goal = await db.collection("challenges").doc(challengeId).get();
  if (!goal.exists || !isCommunityGoal(goal.data())) {
    throw new Error(`${challengeId} is not a community goal`);
  }
  const startKey = instantToDateKey(goal.data().startDate);
  const endKey = instantToDateKey(goal.data().endDate);
  if (!startKey || !endKey || startKey >= endKey) {
    throw new Error(`${challengeId} has no readable window`);
  }
  const users = await db.collection("users").select().get();
  for (const user of users.docs) {
    const uid = user.id;
    if (
      !(await accountDeletionLocks.shouldSystemWriteProceed(
        db,
        uid,
        "backfillCommunityGoal"
      ))
    )
      continue;
    const runs = await db
      .collection("users")
      .doc(uid)
      .collection("runs")
      .where("date", ">=", startKey)
      .where("date", "<", endKey)
      .get();
    totals.users += 1;
    for (const run of runs.docs) {
      totals.runs += 1;
      totals.credited += await creditRunToCommunityGoals(db, {
        uid,
        runId: run.id,
        data: run.data(),
        activityDateKey: sourceActivityDateKey(run.data()),
        sourceRef: run.ref,
        fieldValue,
      });
    }
  }
  return totals;
}

module.exports = {
  isCommunityGoal,
  communityGoalKm,
  communityGoalMeters,
  creditRunToCommunityGoals,
  reverseRunFromCommunityGoals,
  backfillCommunityGoal,
};
