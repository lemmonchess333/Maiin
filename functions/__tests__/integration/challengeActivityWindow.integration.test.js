/**
 * Integration tests: challenge progress is bound to the SOURCE ACTIVITY DAY,
 * not trigger delivery/execution time. Drives the real onWorkoutCreated /
 * onRunCreated triggers against the Firestore emulator (like
 * configurePlan.test.js drives the callables) and asserts the participant's
 * currentValue reflects the challenge's half-open [startDate, endDate) window.
 *
 * These prove the end-to-end wiring (trigger computes activityDateKey from the
 * doc's own `date` and passes it through both engines); the window predicate
 * itself is unit-tested exhaustively in ../challengeActivityWindow.test.js.
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
let onWorkoutCreated;
let onRunCreated;

const UID = "u-caw-1";

// A "July" monthly challenge and a future "September" one. Windows are
// half-open [start, end) UTC.
function tsFromIso(iso) {
  return admin.firestore.Timestamp.fromDate(new Date(iso));
}

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  const idx = require("../../index");
  onWorkoutCreated = idx.onWorkoutCreated;
  onRunCreated = idx.onRunCreated;
  admin = require("firebase-admin");
  db = admin.firestore();
});

async function seedChallenge(id, { metric, start, end, extra = {} }) {
  await db
    .collection("challenges")
    .doc(id)
    .set({
      metric,
      startDate: tsFromIso(start),
      endDate: tsFromIso(end),
      tiers: {},
      ...extra,
    });
}

async function seedParticipant(challengeId, currentValue = 0) {
  await db
    .collection("challenges")
    .doc(challengeId)
    .collection("participants")
    .doc(UID)
    .set({
      currentValue,
      tierAchieved: null,
      joinedAt: tsFromIso("2026-07-01T00:00:00Z"),
    });
}

async function participantValue(challengeId) {
  const snap = await db
    .collection("challenges")
    .doc(challengeId)
    .collection("participants")
    .doc(UID)
    .get();
  return snap.exists ? snap.data().currentValue || 0 : null;
}

async function clearChallenges() {
  for (const id of ["july-wc", "sept-wc", "july-km", "july-fast"]) {
    const parts = await db
      .collection("challenges")
      .doc(id)
      .collection("participants")
      .listDocuments();
    for (const p of parts) {
      const markers = await p.collection("applied").listDocuments();
      for (const m of markers) await m.delete().catch(() => {});
      await p.delete().catch(() => {});
    }
    await db
      .collection("challenges")
      .doc(id)
      .delete()
      .catch(() => {});
  }
}

// Write a workout/run doc and return the real DocumentSnapshot the trigger
// receives, plus the context params.
async function makeWorkoutSnap(workoutId, data) {
  const ref = db
    .collection("users")
    .doc(UID)
    .collection("workouts")
    .doc(workoutId);
  await ref.set(data);
  const snap = await ref.get();
  return { snap, context: { params: { uid: UID, workoutId } } };
}

async function makeRunSnap(runId, data) {
  const ref = db.collection("users").doc(UID).collection("runs").doc(runId);
  await ref.set(data);
  const snap = await ref.get();
  return { snap, context: { params: { uid: UID, runId } } };
}

suite("challenge activity-window — onWorkoutCreated", () => {
  beforeEach(async () => {
    await clearChallenges();
    // July 2026 workout_count challenge + a future September one.
    await seedChallenge("july-wc", {
      metric: "workout_count",
      start: "2026-07-01T00:00:00Z",
      end: "2026-08-01T00:00:00Z",
    });
    await seedChallenge("sept-wc", {
      metric: "workout_count",
      start: "2026-09-01T00:00:00Z",
      end: "2026-10-01T00:00:00Z",
    });
    await seedParticipant("july-wc", 0);
    await seedParticipant("sept-wc", 0);
  });

  it("credits the challenge whose window contains the workout's date", async () => {
    const { snap, context } = await makeWorkoutSnap("w-in", {
      date: "2026-07-02",
      exercises: [],
      totalVolume: 0,
      createdAt: admin.firestore.Timestamp.now(),
    });
    await onWorkoutCreated.run(snap, context);
    expect(await participantValue("july-wc")).toBe(1);
    // Future challenge must NOT receive progress just because its endDate > now.
    expect(await participantValue("sept-wc")).toBe(0);
  });

  it("a June workout delivered in July credits June's window only (not July)", async () => {
    // The bug scenario: offline June session flushed now. Its date is June,
    // so the July challenge must NOT be credited.
    const { snap, context } = await makeWorkoutSnap("w-june", {
      date: "2026-06-30",
      exercises: [],
      totalVolume: 0,
      createdAt: admin.firestore.Timestamp.now(),
    });
    await onWorkoutCreated.run(snap, context);
    expect(await participantValue("july-wc")).toBe(0);
  });

  it("excludes the end boundary (Aug 1 is not in July's [Jul 1, Aug 1))", async () => {
    const { snap, context } = await makeWorkoutSnap("w-end", {
      date: "2026-08-01",
      exercises: [],
      totalVolume: 0,
      createdAt: admin.firestore.Timestamp.now(),
    });
    await onWorkoutCreated.run(snap, context);
    expect(await participantValue("july-wc")).toBe(0);
  });

  it("fails closed on a workout with no usable source day (no increment)", async () => {
    const { snap, context } = await makeWorkoutSnap("w-nodate", {
      exercises: [],
      totalVolume: 0,
      // no date, no completedAt, no createdAt
    });
    await onWorkoutCreated.run(snap, context);
    expect(await participantValue("july-wc")).toBe(0);
  });

  it("redelivery of the same workout still credits exactly once", async () => {
    const { snap, context } = await makeWorkoutSnap("w-dup", {
      date: "2026-07-05",
      exercises: [],
      totalVolume: 0,
      createdAt: admin.firestore.Timestamp.now(),
    });
    await onWorkoutCreated.run(snap, context);
    await onWorkoutCreated.run(snap, context);
    expect(await participantValue("july-wc")).toBe(1);
    // Marker carries the activity day.
    const marker = await db
      .collection("challenges")
      .doc("july-wc")
      .collection("participants")
      .doc(UID)
      .collection("applied")
      .doc("w-dup")
      .get();
    expect(marker.exists).toBe(true);
    expect(marker.data().activityDateKey).toBe("2026-07-05");
  });
});

suite("challenge activity-window — onRunCreated", () => {
  beforeEach(async () => {
    await clearChallenges();
    await seedChallenge("july-km", {
      metric: "total_km",
      start: "2026-07-01T00:00:00Z",
      end: "2026-08-01T00:00:00Z",
    });
    await seedChallenge("july-fast", {
      metric: "fastest_effort",
      start: "2026-07-01T00:00:00Z",
      end: "2026-08-01T00:00:00Z",
      extra: { targetDistance: 5000 },
    });
    await seedParticipant("july-km", 0);
    await seedParticipant("july-fast", 0);
  });

  it("credits total_km + fastest_effort for an in-window run", async () => {
    const { snap, context } = await makeRunSnap("r-in", {
      date: "2026-07-03",
      distance: 5000, // metres
      distanceKm: 5,
      duration: 1500, // seconds
      completedAt: admin.firestore.Timestamp.now(),
    });
    await onRunCreated.run(snap, context);
    expect(await participantValue("july-km")).toBe(5);
    expect(await participantValue("july-fast")).toBe(1500);
  });

  it("a delayed July run delivered in August credits July only", async () => {
    // Simulate a July run whose trigger fires now — its date is July, so it
    // must credit the July window regardless of when the trigger ran.
    const { snap, context } = await makeRunSnap("r-july", {
      date: "2026-07-31",
      distance: 5000,
      distanceKm: 5,
      duration: 1400,
      completedAt: admin.firestore.Timestamp.now(),
    });
    await onRunCreated.run(snap, context);
    expect(await participantValue("july-km")).toBe(5);
    expect(await participantValue("july-fast")).toBe(1400);
  });

  it("an out-of-window run credits neither km nor fastest", async () => {
    const { snap, context } = await makeRunSnap("r-june", {
      date: "2026-06-15",
      distance: 5000,
      distanceKm: 5,
      duration: 1200,
      completedAt: admin.firestore.Timestamp.now(),
    });
    await onRunCreated.run(snap, context);
    expect(await participantValue("july-km")).toBe(0);
    expect(await participantValue("july-fast")).toBe(0);
  });
});
