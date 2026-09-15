"use strict";
const { isStatusActive, isTombstoneLive } = require("./accountDeletionStatus");

/** Read the freeze in the SAME transaction as a social write. A request
 * arriving after these reads forces Firestore to retry the transaction. */
async function transactionAccountsLive({ firestore, tx, uids }) {
  const accounts = [...new Set(uids.filter((uid) => typeof uid === "string" && uid))];
  const snapshots = await Promise.all(accounts.flatMap((uid) => [
    tx.get(firestore.collection("accountDeletionRequests").doc(uid)),
    tx.get(firestore.collection("deletedAccounts").doc(uid)),
  ]));
  return snapshots.every((snapshot, index) => !snapshot.exists || (index % 2 === 0
    ? !isStatusActive(snapshot.data()?.status)
    : !isTombstoneLive(snapshot.data())));
}

async function assertTransactionAccountsLive(args) {
  if (await transactionAccountsLive(args)) return;
  const error = new Error("Account deletion is in progress.");
  error.code = "failed-precondition";
  throw error;
}
module.exports = { transactionAccountsLive, assertTransactionAccountsLive };
