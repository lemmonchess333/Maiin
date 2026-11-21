// memoryFirestore clones what a read hands back, and a clone of a Timestamp
// is a plain object without `toMillis`; Firestore hands back the Timestamp
// itself. This wraps a fake so a transaction's reads return the stored
// values as they are, and each document's `updateTime` from `updateTimes`
// (path to Timestamp), which the fake does not keep. `beforeTransaction`
// runs as each transaction starts: a test uses it to land a write between a
// query and the transaction that acts on what the query found.
function withStoredTimestamps(
  db,
  { updateTimes = {}, beforeTransaction } = {}
) {
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
            updateTime: updateTimes[ref.path],
          };
        },
      });
    });
  return db;
}

module.exports = { withStoredTimestamps };
