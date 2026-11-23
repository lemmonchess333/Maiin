// memoryFirestore clones what a read hands back, and a clone of a Timestamp
// is a plain object without `toMillis`; Firestore hands back the Timestamp
// itself. This wraps a fake so a transaction's reads return the stored
// values as they are, with each document's `updateTime`, which the fake
// does not keep and the Admin SDK always gives.
//
// `updateTime` is the path's entry in `updateTimes` when it has one (an
// entry set to undefined reads as none), and otherwise the document's own
// `deletedAt` when that is a Timestamp: a soft delete that reached the
// server the moment the phone stamped it, the ordinary case.
// `beforeTransaction` runs as each transaction starts: a test uses it to
// land a write between a query and the transaction that acts on what the
// query found.
function withStoredTimestamps(
  db,
  { updateTimes = {}, beforeTransaction } = {}
) {
  const updateTimeOf = (path) => {
    if (path in updateTimes) return updateTimes[path];
    const deletedAt = db.data.get(path)?.deletedAt;
    return deletedAt && typeof deletedAt.toMillis === "function"
      ? deletedAt
      : undefined;
  };
  const runTransaction = db.runTransaction;
  db.runTransaction = (fn) =>
    runTransaction(async (tx) => {
      if (beforeTransaction) beforeTransaction();
      return fn({
        ...tx,
        get: async (ref) => {
          const snap = await tx.get(ref);
          return {
            ...snap,
            data: () => db.data.get(ref.path),
            updateTime: updateTimeOf(ref.path),
          };
        },
      });
    });
  return db;
}

module.exports = { withStoredTimestamps };
