/**
 * Integration: a brand-new user's FIRST milestone badge is awarded.
 *
 * The bug, driven end-to-end here through the real triggers:
 *
 *   `awardMilestoneBadges` returned early when `users/{uid}/streaks/data`
 *   did not exist, under a comment claiming "the client materialises +
 *   reconciles it on next load". The client does no such thing for these
 *   badges — `badgeEarning.ts:badgesToAward` never evaluates `first_5k`,
 *   `10k_club`, `plate_club` or any other single-session milestone,
 *   because they are server-owned PRECISELY because the client's snapshots
 *   are windowed. There was nothing to reconcile.
 *
 *   Nothing on the server creates that document either: this function is
 *   its only server-side writer, and it bailed before writing. The client
 *   creates it only when the streak CHANGES — and `useStreaks` explicitly
 *   skips the write when the computed streak already equals the stored
 *   one, which for a brand-new user is 0 === 0. So on a user's first ever
 *   logged session the doc does not exist, the trigger finds nothing, and
 *   every one of the three `awardMilestoneBadges` call sites is inside an
 *   `onCreate` trigger — no retry, no backfill, no scheduled recompute.
 *
 *   A first run of 5 km earns `first_5k`. A first workout with a 60 kg
 *   compound set earns `plate_club`. Both were routine, and both were
 *   silently lost, permanently, on the app's welcome moment.
 *
 * Driven against the emulator rather than unit-tested because the failure
 * is in the INTERACTION of a trigger, a document nobody creates, and a
 * client reconciliation that does not cover these ids. Nothing is wrong in
 * isolation, and `badgeRules.test.js` passes either way — it tests which
 * ids a run QUALIFIES for, never whether the award lands.
 *
 * Gated on FIRESTORE_EMULATOR_HOST — skips in an ordinary unit run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

let admin;
let db;
let onRunCreated;
let onWorkoutCreated;
let awardMilestoneBadges;

const UID = "u-cold-badge-1";

const streaksRef = () =>
  db.collection("users").doc(UID).collection("streaks").doc("data");
const publicProfileRef = () =>
  db.collection("users").doc(UID).collection("public").doc("profile");

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  const idx = require("../../index");
  onRunCreated = idx.onRunCreated;
  onWorkoutCreated = idx.onWorkoutCreated;
  awardMilestoneBadges = idx._awardMilestoneBadges;
  admin = require("firebase-admin");
  db = admin.firestore();
});

async function wipe() {
  for (const sub of ["runs", "workouts", "streaks", "public", "lifetime"]) {
    const docs = await db
      .collection("users")
      .doc(UID)
      .collection(sub)
      .listDocuments();
    for (const d of docs) await d.delete().catch(() => {});
  }
  await db.collection("users").doc(UID).delete().catch(() => {});
  await db
    .collection("accountDeletionRequests")
    .doc(UID)
    .delete()
    .catch(() => {});
}

async function earnedBadgeIds() {
  const snap = await streaksRef().get();
  if (!snap.exists) return null;
  return (snap.data().badges || [])
    .filter((b) => b && b.earnedAt)
    .map((b) => b.id)
    .sort();
}

async function logRun(id, distance, duration) {
  const ref = db.collection("users").doc(UID).collection("runs").doc(id);
  await ref.set({ date: "2026-08-05", distance, duration });
  const snap = await ref.get();
  await onRunCreated.run(snap, { params: { uid: UID, runId: id } });
}

async function logWorkout(id, heaviestKg) {
  const ref = db.collection("users").doc(UID).collection("workouts").doc(id);
  await ref.set({
    date: "2026-08-05",
    totalVolume: 3000,
    exercises: [
      {
        exerciseId: "squat",
        sets: [{ reps: 5, weightKg: heaviestKg }],
      },
    ],
  });
  const snap = await ref.get();
  await onWorkoutCreated.run(snap, { params: { uid: UID, workoutId: id } });
}

suite("cold-start milestone badges", () => {
  beforeEach(async () => {
    await wipe();
  });

  it("awards a first-ever 5K when the user has no streak document yet", async () => {
    // The precondition IS the bug. Asserted rather than assumed — if some
    // other path started creating this document, the test would still pass
    // while covering nothing.
    expect((await streaksRef().get()).exists).toBe(false);

    await logRun("r-1", 5200, 1600);

    // Pre-fix: null — the trigger returned before writing anything.
    expect(await earnedBadgeIds()).toEqual(["first_5k"]);
  });

  it("awards a first-ever plate_club on a cold-start workout", async () => {
    expect((await streaksRef().get()).exists).toBe(false);

    await logWorkout("w-1", 60);

    expect(await earnedBadgeIds()).toEqual(["plate_club"]);
  });

  it("mirrors the award onto the public badge summary", async () => {
    // The cross-user projection has to be created too, or the badge exists
    // for the owner and is invisible on their profile to everyone else.
    // 10.5 km in 50:00 is 4:45/km, so this run clears the sub-5:00
    // speed_demon gate as well — all three land in one award call.
    await logRun("r-1", 10500, 3000);

    const pub = await publicProfileRef().get();
    expect(pub.exists).toBe(true);
    expect(pub.data().badgeSummary.count).toBe(3);
    expect(Object.keys(pub.data().badgeSummary.earnedMap).sort()).toEqual([
      "10k_club",
      "first_5k",
      "speed_demon",
    ]);
  });

  it("still does not re-award on trigger redelivery", async () => {
    // The idempotency the early return was incidentally providing has to
    // survive its removal: `earnedAt` is the real guard, not doc absence.
    await logRun("r-1", 5200, 1600);
    const first = await streaksRef().get();
    const firstEarnedAt = first
      .data()
      .badges.find((b) => b.id === "first_5k").earnedAt;

    const snap = await db
      .collection("users")
      .doc(UID)
      .collection("runs")
      .doc("r-1")
      .get();
    await onRunCreated.run(snap, { params: { uid: UID, runId: "r-1" } });

    const after = await streaksRef().get();
    expect(after.data().badges.filter((b) => b.id === "first_5k")).toHaveLength(
      1
    );
    // Unchanged timestamp — a re-award would move it and rewrite history.
    expect(
      after.data().badges.find((b) => b.id === "first_5k").earnedAt
    ).toBe(firstEarnedAt);
  });

  it("does not create the streak document while the account is being deleted", async () => {
    // The guard that removing the early return made load-bearing. While
    // this could only ever UPDATE an existing doc it had no way to
    // resurrect one; now that it can create, an unguarded award would
    // re-create a document the deletion executor had already swept.
    //
    // Called DIRECTLY rather than through onRunCreated, and that detail is
    // the whole test. Driven through the trigger, this passed for the
    // wrong reason — the trigger's own entry guard returns first, so a
    // mutation deleting the guard inside awardMilestoneBadges left it
    // green. The guard is not redundant with the trigger's: a deletion
    // that STARTS mid-trigger (challenge sync loops every challenge, then
    // performance recomputes — seconds of work) is invisible to a check
    // taken at entry, which is why the deletion rails require one
    // immediately before each write commit.
    await db
      .collection("accountDeletionRequests")
      .doc(UID)
      .set({ uid: UID, status: "running" });

    await awardMilestoneBadges(UID, ["first_5k"]);

    expect((await streaksRef().get()).exists).toBe(false);
    expect((await publicProfileRef().get()).exists).toBe(false);
  });

  it("awards through the same direct path when no deletion is in flight", async () => {
    // The positive control for the test above. Without it, that assertion
    // would pass just as happily against a function that never writes at
    // all — the shape this file exists to stop shipping.
    await awardMilestoneBadges(UID, ["first_5k"]);
    expect(await earnedBadgeIds()).toEqual(["first_5k"]);
  });

  it("leaves an existing document's other fields alone", async () => {
    // The award writes with merge, so a user who already has streak state
    // keeps it. This is the case that worked before the fix, kept honest.
    await streaksRef().set({
      currentStreak: 4,
      longestStreak: 9,
      totalActiveDays: 30,
      badges: [{ id: "week_warrior", earnedAt: "2026-07-01T00:00:00.000Z" }],
    });

    await logRun("r-1", 5200, 1600);

    const data = (await streaksRef().get()).data();
    expect(data.currentStreak).toBe(4);
    expect(data.longestStreak).toBe(9);
    expect(data.totalActiveDays).toBe(30);
    expect(await earnedBadgeIds()).toEqual(["first_5k", "week_warrior"]);
  });
});
