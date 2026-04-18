#!/usr/bin/env node
/**
 * One-time backfill to populate users/{uid}/public/profile with the safe,
 * cross-user-readable projection of user-profile fields, AND to mirror
 * currentStreak / longestStreak from users/{uid}/streaks/data onto
 * users/{uid} (pattern P2) in the same transaction.
 *
 * Idempotent — safe to re-run. Race-safe via per-user transactions.
 *
 * ORDER OF OPERATIONS (critical):
 *   1. Deploy the Architecture B changes first (firestore.rules +
 *      useStreaks + auth.tsx + Onboarding + UserProfile).
 *   2. Verify the public doc is being created/updated live: sign up a
 *      test account and confirm users/{uid}/public/profile exists in
 *      Firestore console. Log a meal on a second test account and
 *      verify currentStreak ticks on its public doc.
 *   3. THEN run this backfill to populate the public doc for all
 *      pre-existing users and to reconcile any users missed by the
 *      earlier mirror-only backfill.
 *
 * Running this script before step 1 is pointless — the public-doc rule
 * block wouldn't be deployed and every write would reject.
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

const USER_PAGE_SIZE = 500;

interface Summary {
  mirrored: number;
  skippedNoStreaksDoc: number;
  skippedAlreadyInSync: number;
  errors: number;
}

interface BadgeSummary {
  earnedMap: Record<string, string>;
  count: number;
}

// Mirror of the toIsoString helper in src/features/streaks/useStreaks.ts.
// Kept inline since this script runs outside the src/ module graph. If the
// runtime shape of EarnedBadge.earnedAt ever broadens, keep the two in sync.
function toIsoString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
}

function computeBadgeSummary(
  badges: unknown,
): BadgeSummary | undefined {
  if (!Array.isArray(badges) || badges.length === 0) return undefined;
  const earnedMap: Record<string, string> = {};
  for (const b of badges) {
    if (!b || typeof b !== "object") continue;
    const id = (b as { id?: unknown }).id;
    const earnedAt = (b as { earnedAt?: unknown }).earnedAt;
    if (typeof id !== "string" || id.length === 0) continue;
    if (earnedAt == null) continue;
    earnedMap[id] = toIsoString(earnedAt);
  }
  const count = Object.keys(earnedMap).length;
  if (count === 0) return undefined;
  return { earnedMap, count };
}

function badgeSummariesEqual(
  a: BadgeSummary | undefined,
  b: BadgeSummary | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.count !== b.count) return false;
  const aKeys = Object.keys(a.earnedMap).sort();
  const bKeys = Object.keys(b.earnedMap).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k, i) => k === bKeys[i]);
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
  const publicRef = db.doc(`users/${uid}/public/profile`);

  try {
    return await db.runTransaction(async (tx) => {
      const [streaksSnap, userSnap, publicSnap] = await Promise.all([
        tx.get(streaksRef),
        tx.get(userRef),
        tx.get(publicRef),
      ]);

      if (!streaksSnap.exists) {
        return { status: "skipped-no-streaks-doc" as const };
      }

      const streaksData = streaksSnap.data() ?? {};
      const currentStreak =
        typeof streaksData.currentStreak === "number" ? streaksData.currentStreak : 0;
      const longestStreak =
        typeof streaksData.longestStreak === "number" ? streaksData.longestStreak : 0;
      const computedBadgeSummary = computeBadgeSummary(streaksData.badges);

      const userData = userSnap.exists ? userSnap.data() ?? {} : {};
      const userCurrent =
        typeof userData.currentStreak === "number" ? userData.currentStreak : null;
      const userLongest =
        typeof userData.longestStreak === "number" ? userData.longestStreak : null;

      // Public-doc projection. Falls back to user-doc values for the
      // non-streak fields since users/{uid} is where displayName etc. live.
      const displayName = typeof userData.displayName === "string" ? userData.displayName : null;
      const photoURL = typeof userData.photoURL === "string" ? userData.photoURL : null;
      const athleteType =
        typeof userData.athleteType === "string" ? userData.athleteType : "Lifter";
      const createdAt =
        userData.createdAt ?? admin.firestore.FieldValue.serverTimestamp();

      const publicData = publicSnap.exists ? publicSnap.data() ?? {} : {};
      const publicCurrent =
        typeof publicData.currentStreak === "number" ? publicData.currentStreak : null;
      const publicLongest =
        typeof publicData.longestStreak === "number" ? publicData.longestStreak : null;
      const publicDisplayName =
        publicData.displayName === undefined ? "__missing__" : publicData.displayName;
      const publicPhotoURL =
        publicData.photoURL === undefined ? "__missing__" : publicData.photoURL;
      const publicAthleteType =
        typeof publicData.athleteType === "string" ? publicData.athleteType : null;
      const publicBadgeSummary =
        publicData.badgeSummary && typeof publicData.badgeSummary === "object"
          ? (publicData.badgeSummary as BadgeSummary)
          : undefined;

      const userInSync =
        userCurrent === currentStreak && userLongest === longestStreak;
      const publicInSync =
        publicSnap.exists &&
        publicCurrent === currentStreak &&
        publicLongest === longestStreak &&
        publicDisplayName === displayName &&
        publicPhotoURL === photoURL &&
        publicAthleteType === athleteType &&
        badgeSummariesEqual(publicBadgeSummary, computedBadgeSummary);

      if (userInSync && publicInSync) {
        return { status: "skipped-in-sync" as const };
      }

      if (!userInSync) {
        tx.set(userRef, { currentStreak, longestStreak }, { merge: true });
      }
      if (!publicInSync) {
        tx.set(
          publicRef,
          {
            uid,
            displayName,
            photoURL,
            athleteType,
            currentStreak,
            longestStreak,
            // Write badgeSummary when there are earned badges. When there are
            // none but the public doc has a stale summary, explicitly clear
            // it — otherwise merge: true would leave the stale value.
            ...(computedBadgeSummary
              ? { badgeSummary: computedBadgeSummary }
              : publicBadgeSummary
                ? { badgeSummary: admin.firestore.FieldValue.delete() }
                : {}),
            ...(publicSnap.exists ? {} : { createdAt }),
          },
          { merge: true },
        );
      }

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
