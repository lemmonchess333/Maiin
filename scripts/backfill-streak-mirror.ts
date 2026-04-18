/**
 * One-time backfill to mirror currentStreak and longestStreak from
 * users/{uid}/streaks/data onto users/{uid}.
 *
 * Idempotent — safe to re-run. Race-safe via per-user transactions.
 *
 * ORDER OF OPERATIONS (critical):
 *   1. Deploy the useStreaks.ts batch-write change first.
 *   2. Verify mirror writes are firing: log a meal on a test account and
 *      confirm the user doc gets the updated fields (check via another
 *      account's view of that profile once rules permit, or inspect in
 *      Firestore console directly).
 *   3. THEN run this backfill to catch pre-existing users.
 *
 * Running this script before step 1 is pointless and misleading — the
 * mirror code path isn't live, so the backfill's correctness guarantees
 * immediately drift.
 *
 * Recommended execution window: low-activity hours (02:00–05:00 UK time)
 * to minimise transaction contention with live mirror writes.
 *
 * Log output contains UIDs and streak numbers only. Do not commit logs
 * to the repo or upload them externally without review.
 *
 * Credentials:
 *   Local:  export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   GCP VM: applicationDefault() works without setup.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     npx tsx scripts/backfill-streak-mirror.ts
 */

import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

// Page size for iterating users. Firestore per-transaction cost is fixed
// regardless of this value; pagination is purely a memory concern.
const USER_PAGE_SIZE = 500;

interface Summary {
  mirrored: number;
  skippedNoStreaksDoc: number;
  skippedAlreadyInSync: number;
  errors: number;
}

async function backfillOne(
  uid: string,
): Promise<
  | { status: "mirrored"; currentStreak: number; longestStreak: number }
  | { status: "skipped-no-streaks-doc" }
  | { status: "skipped-in-sync" }
  | { status: "error"; reason: string }
> {
  const streaksRef = db.doc(`users/${uid}/streaks/data`);
  const userRef = db.doc(`users/${uid}`);

  try {
    return await db.runTransaction(async (tx) => {
      const [streaksSnap, userSnap] = await Promise.all([
        tx.get(streaksRef),
        tx.get(userRef),
      ]);

      if (!streaksSnap.exists) {
        return { status: "skipped-no-streaks-doc" as const };
      }

      const streaksData = streaksSnap.data() ?? {};
      const currentStreak =
        typeof streaksData.currentStreak === "number" ? streaksData.currentStreak : 0;
      const longestStreak =
        typeof streaksData.longestStreak === "number" ? streaksData.longestStreak : 0;

      const userData = userSnap.exists ? userSnap.data() ?? {} : {};
      const userCurrent =
        typeof userData.currentStreak === "number" ? userData.currentStreak : null;
      const userLongest =
        typeof userData.longestStreak === "number" ? userData.longestStreak : null;

      if (userCurrent === currentStreak && userLongest === longestStreak) {
        return { status: "skipped-in-sync" as const };
      }

      tx.set(
        userRef,
        { currentStreak, longestStreak },
        { merge: true },
      );

      return {
        status: "mirrored" as const,
        currentStreak,
        longestStreak,
      };
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { status: "error" as const, reason };
  }
}

async function main() {
  const summary: Summary = {
    mirrored: 0,
    skippedNoStreaksDoc: 0,
    skippedAlreadyInSync: 0,
    errors: 0,
  };

  // Get total count up-front for [n/total] logging. If this is expensive
  // on very large collections, replace with a rolling counter.
  const totalSnap = await db.collection("users").count().get();
  const total = totalSnap.data().count;
  console.log(`[backfill] scanning ${total} users`);

  let processed = 0;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  while (true) {
    let q: FirebaseFirestore.Query = db
      .collection("users")
      .orderBy("__name__")
      .limit(USER_PAGE_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      processed++;
      const uid = doc.id;
      const result = await backfillOne(uid);

      switch (result.status) {
        case "mirrored":
          summary.mirrored++;
          console.log(
            `[${processed}/${total}] uid=${uid} mirrored currentStreak=${result.currentStreak} longestStreak=${result.longestStreak}`,
          );
          break;
        case "skipped-no-streaks-doc":
          summary.skippedNoStreaksDoc++;
          console.log(`[${processed}/${total}] uid=${uid} skipped (no streaks/data doc)`);
          break;
        case "skipped-in-sync":
          summary.skippedAlreadyInSync++;
          console.log(`[${processed}/${total}] uid=${uid} skipped (already in sync)`);
          break;
        case "error":
          summary.errors++;
          console.error(
            `[${processed}/${total}] uid=${uid} error: ${result.reason}`,
          );
          break;
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < USER_PAGE_SIZE) break;
  }

  console.log("");
  console.log(
    `Backfill complete. Mirrored: ${summary.mirrored}. Skipped: ${summary.skippedNoStreaksDoc + summary.skippedAlreadyInSync} (${summary.skippedNoStreaksDoc} no streaks/data, ${summary.skippedAlreadyInSync} in sync). Errors: ${summary.errors}.`,
  );
}

main().catch((err) => {
  console.error("[backfill] fatal:", err);
  process.exit(1);
});
