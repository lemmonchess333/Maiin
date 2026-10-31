"use strict";

/** The exporting phone can be offline when a run is removed elsewhere. Keep
 * a server marker until it confirms native HealthKit cleanup. */
async function markDeletedRun(db, uid, runId, serverTimestamp) {
  const ref = db.doc(`users/${uid}/healthWorkoutExports/${runId}`);
  return db.runTransaction(async (tx) => {
    const receipt = await tx.get(ref);
    if (!receipt.exists || receipt.data().state === "pending-delete") return false;
    tx.update(ref, {
      state: "pending-delete",
      updatedAt: serverTimestamp(),
    });
    return true;
  });
}

module.exports = { markDeletedRun };
