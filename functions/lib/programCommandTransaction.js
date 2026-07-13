"use strict";

/**
 * Programme command transaction (packet 18).
 *
 * The authoritative read-modify-write for users/{uid}/programState/current,
 * extracted from the applyProgramCommand callable so it can be exercised
 * directly against the Firestore emulator (integration tests) as well as run in
 * production. Reads receipt + ProgramState + profile + deletion ledger +
 * tombstone BEFORE any write, applies exactly one validated command via the
 * pure reducer, and atomically writes sanitized state + the optional
 * deterministic workout doc + the idempotency receipt.
 *
 * NOT a client mirror — this is server-only orchestration (it uses HttpsError +
 * admin Timestamp). Callers pass an already-validated command
 * (programCommands.assertClientProgramCommand) and a single `now`.
 */

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const programCommands = require("./programCommands");
const accountDeletionStatus = require("./accountDeletionStatus");
const accountDeletionLocks = require("./accountDeletionLocks");
const deletedAccountsTombstone = require("./deletedAccountsTombstone");
const accountDeletionLedger = require("./accountDeletionLedger");
const {
  sanitizeProgramState,
  programStateTooLarge,
} = require("./programStateSanitizer");

/**
 * @param {object} args
 * @param {FirebaseFirestore.Firestore} args.firestore
 * @param {string} args.uid
 * @param {object} args.command - already validated by assertClientProgramCommand
 * @param {number} args.now - single timestamp reused across contention retries
 * @returns {Promise<{ duplicate: boolean, committedUpdatedAt: number|null }>}
 */
async function runProgramCommandTransaction({ firestore, uid, command, now }) {
  const programRef = firestore
    .collection("users")
    .doc(uid)
    .collection("programState")
    .doc("current");
  const receiptRef = programRef
    .collection("commandReceipts")
    .doc(command.commandId);

  let duplicate = false;
  let committedUpdatedAt = null;

  await firestore.runTransaction(async (tx) => {
    const deletionRef = firestore
      .collection(accountDeletionLedger.COLLECTION)
      .doc(uid);
    const tombstoneRef = firestore
      .collection(deletedAccountsTombstone.COLLECTION)
      .doc(uid);
    const profileRef = firestore.collection("users").doc(uid);
    const [receiptSnap, programSnap, profileSnap, deletionSnap, tombstoneSnap] =
      await Promise.all([
        tx.get(receiptRef),
        tx.get(programRef),
        tx.get(profileRef),
        tx.get(deletionRef),
        tx.get(tombstoneRef),
      ]);

    // Idempotency: a completed command's receipt short-circuits.
    if (receiptSnap.exists) {
      duplicate = true;
      return;
    }
    // In-transaction deletion gate (closes the entry-to-commit race the
    // callable-entry lock can't).
    if (
      deletionSnap.exists &&
      accountDeletionStatus.isStatusActive(deletionSnap.get("status"))
    ) {
      throw accountDeletionLocks.wrapAsHttpsError(
        accountDeletionStatus.makeAccountDeletingError(uid)
      );
    }
    if (
      tombstoneSnap.exists &&
      accountDeletionStatus.isTombstoneLive(tombstoneSnap.data(), now)
    ) {
      throw accountDeletionLocks.wrapAsHttpsError(
        accountDeletionStatus.makeAccountDeletedError(uid)
      );
    }
    if (!programSnap.exists) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Your programme is not ready. Refresh and try again."
      );
    }

    const result = programCommands.applyProgramCommand({
      state: programSnap.data(),
      profile: profileSnap.data() || {},
      command,
      now,
    });

    const sanitized = sanitizeProgramState(result.state);
    if (sanitized.dropped.length > 0 || programStateTooLarge(sanitized.value)) {
      functions.logger.warn("applyProgramCommand.invalid_state", {
        uid,
        kind: command.kind,
        dropped: sanitized.dropped,
      });
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Programme command produced invalid state."
      );
    }

    tx.set(programRef, sanitized.value);
    // completeWorkoutDay's effect: the deterministic programme workout doc. The
    // reducer omits createdAt (it is pure) — inject the admin Timestamp here so
    // both docs commit atomically.
    if (result.effects.workout) {
      const workoutRef = profileRef
        .collection("workouts")
        .doc("programme-" + command.completion.completionId);
      tx.set(workoutRef, {
        ...result.effects.workout,
        createdAt: admin.firestore.Timestamp.now(),
      });
    }
    tx.create(receiptRef, programCommands.makeCommandReceipt({ command, now }));
    committedUpdatedAt = now;
  });

  return { duplicate, committedUpdatedAt };
}

module.exports = { runProgramCommandTransaction };
