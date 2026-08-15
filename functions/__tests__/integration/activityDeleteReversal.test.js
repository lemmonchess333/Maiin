/**
 * Integration: deleting a logged session reverses the accumulators.
 *
 * ADR-0012, driven end-to-end through the REAL create and delete triggers
 * against the emulator. The bug this closes was never a wrong formula — it
 * was an absence. `onWorkoutCreated` / `onRunCreated` were onCreate ONLY,
 * so deleting a workout fired nothing: the log shrank, and challenge
 * standing and lifetime totals kept the deleted session's contribution
 * forever. That is why no delete affordance existed anywhere in the app
 * (`useWorkouts.deleteWorkout` was written and wired to nothing; runs had
 * no delete function at all) — a delete button in front of an unreversed
 * accumulator is worse than no button, because the damage is silent and
 * the user has been told the record is gone.
 *
 * Driven against the emulator, not stubbed, for the same reason the
 * re-join test is: the behaviour lives in the INTERACTION of a trigger, a
 * marker whose key is namespaced by membership, and a transaction. A unit
 * test of any single piece passes both before and after.
 *
 * Every reversal assertion is PAIRED with the accrual it undoes. Asserting
 * "the value is 0 after the delete" alone would pass just as happily
 * against a create trigger that never credited anything — the tautology
 * shape CLAUDE.md warns about, and the one that let a race predicate
 * compare metres to kilometres under a green suite for months.
 *
 * Gated on FIRESTORE_EMULATOR_HOST — skips in an ordinary unit run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { markerDocId } from "../../lib/challengeMarkers";

const require = createRequire(import.meta.url);

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

let admin;
let db;
let onWorkoutCreated;
let onWorkoutDeleted;
let onRunCreated;
let onRunDeleted;

const UID = "u-del-rev-1";
const VOL_CHALLENGE = "aug-del-volume";
const KM_CHALLENGE = "aug-del-km";
const FAST_CHALLENGE = "aug-del-fastest";

const tsFromIso = (iso) => admin.firestore.Timestamp.fromDate(new Date(iso));
const JOINED_AT = "2026-08-01T00:00:00Z";

const participantRef = (challengeId) =>
  db
    .collection("challenges")
    .doc(challengeId)
    .collection("participants")
    .doc(UID);

const lifetimeTotalsRef = () =>
  db.collection("users").doc(UID).collection("lifetime").doc("totals");

const lifetimeMarkerRef = (kind, sourceId) =>
  db
    .collection("users")
    .doc(UID)
    .collection("lifetime")
    .doc(`applied_${kind}_${sourceId}`);

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  const idx = require("../../index");
  onWorkoutCreated = idx.onWorkoutCreated;
  onWorkoutDeleted = idx.onWorkoutDeleted;
  onRunCreated = idx.onRunCreated;
  onRunDeleted = idx.onRunDeleted;
  admin = require("firebase-admin");
  db = admin.firestore();
});

async function wipeChallenge(id) {
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

async function wipe() {
  for (const id of [VOL_CHALLENGE, KM_CHALLENGE, FAST_CHALLENGE]) {
    await wipeChallenge(id);
  }
  for (const sub of ["workouts", "runs", "lifetime"]) {
    const docs = await db
      .collection("users")
      .doc(UID)
      .collection(sub)
      .listDocuments();
    for (const d of docs) await d.delete().catch(() => {});
  }
  await db
    .collection("accountDeletionRequests")
    .doc(UID)
    .delete()
    .catch(() => {});
  await db
    .collection("deletedAccounts")
    .doc(UID)
    .delete()
    .catch(() => {});
}

async function seedChallenges() {
  const window = {
    startDate: tsFromIso("2026-08-01T00:00:00Z"),
    endDate: tsFromIso("2026-09-01T00:00:00Z"),
  };
  await db
    .collection("challenges")
    .doc(VOL_CHALLENGE)
    .set({
      ...window,
      metric: "total_volume",
      tiers: { bronze: 1000, silver: 5000, gold: 20000 },
    });
  await db
    .collection("challenges")
    .doc(KM_CHALLENGE)
    .set({
      ...window,
      metric: "total_km",
      tiers: { bronze: 5, silver: 20, gold: 50 },
    });
  await db
    .collection("challenges")
    .doc(FAST_CHALLENGE)
    .set({
      ...window,
      metric: "fastest_effort",
      targetDistance: 5000,
      tiers: { bronze: 1800, silver: 1500, gold: 1200 },
    });
}

async function join(challengeId) {
  await participantRef(challengeId).set({
    currentValue: 0,
    tierAchieved: null,
    joinedAt: tsFromIso(JOINED_AT),
    displayName: "Athlete",
  });
}

async function logWorkout(
  id,
  { date = "2026-08-05", totalVolume = 6000 } = {}
) {
  const ref = db.collection("users").doc(UID).collection("workouts").doc(id);
  await ref.set({ date, totalVolume, exercises: [] });
  const snap = await ref.get();
  await onWorkoutCreated.run(snap, { params: { uid: UID, workoutId: id } });
}

/** Delete the doc exactly as a client would, then fire the trigger on it. */
async function deleteWorkout(id) {
  const ref = db.collection("users").doc(UID).collection("workouts").doc(id);
  const snap = await ref.get();
  await ref.delete();
  await onWorkoutDeleted.run(snap, { params: { uid: UID, workoutId: id } });
}

async function logRun(
  id,
  { date = "2026-08-05", distance = 6000, duration = 1700 } = {}
) {
  const ref = db.collection("users").doc(UID).collection("runs").doc(id);
  await ref.set({
    date,
    distance,
    duration,
    completedAt: tsFromIso(`${date}T09:00:00Z`),
  });
  const snap = await ref.get();
  await onRunCreated.run(snap, { params: { uid: UID, runId: id } });
}

async function deleteRun(id) {
  const ref = db.collection("users").doc(UID).collection("runs").doc(id);
  const snap = await ref.get();
  await ref.delete();
  await onRunDeleted.run(snap, { params: { uid: UID, runId: id } });
}

async function participant(challengeId) {
  const snap = await participantRef(challengeId).get();
  return snap.exists ? snap.data() : null;
}

async function markerIds(challengeId) {
  const docs = await participantRef(challengeId)
    .collection("applied")
    .listDocuments();
  return docs.map((d) => d.id).sort();
}

async function lifetime(field) {
  const snap = await lifetimeTotalsRef().get();
  return snap.exists ? snap.data()[field] || 0 : null;
}

suite("deleting a session reverses the accumulators", () => {
  beforeEach(async () => {
    await wipe();
    await seedChallenges();
  });

  it("reverses challenge progress and lifetime volume for a deleted workout", async () => {
    await join(VOL_CHALLENGE);
    await logWorkout("w-1");

    // The accrual half. Without these the reversal assertions below would
    // pass against a trigger that credited nothing.
    expect((await participant(VOL_CHALLENGE)).currentValue).toBe(6000);
    expect((await participant(VOL_CHALLENGE)).tierAchieved).toBe("silver");
    expect(await lifetime("liftVolumeKg")).toBe(6000);
    expect(await markerIds(VOL_CHALLENGE)).toHaveLength(1);

    await deleteWorkout("w-1");

    expect((await participant(VOL_CHALLENGE)).currentValue).toBe(0);
    // Recomputed, not left standing — the visible half of the drift.
    expect((await participant(VOL_CHALLENGE)).tierAchieved).toBeNull();
    expect(await lifetime("liftVolumeKg")).toBe(0);

    // Both markers gone, so a re-log under the same (deterministic) id
    // credits again rather than hitting a surviving marker and silently
    // no-oping — the leave/re-join failure, one collection over.
    expect(await markerIds(VOL_CHALLENGE)).toEqual([]);
    expect((await lifetimeMarkerRef("lift", "w-1").get()).exists).toBe(false);
  });

  it("only reverses the deleted session — the others keep their credit", async () => {
    await join(VOL_CHALLENGE);
    await logWorkout("w-1", { totalVolume: 6000 });
    await logWorkout("w-2", { totalVolume: 4000 });
    expect((await participant(VOL_CHALLENGE)).currentValue).toBe(10000);
    expect(await lifetime("liftVolumeKg")).toBe(10000);

    await deleteWorkout("w-1");

    expect((await participant(VOL_CHALLENGE)).currentValue).toBe(4000);
    expect(await lifetime("liftVolumeKg")).toBe(4000);
    // w-2's marker survives; only w-1's went.
    expect(await markerIds(VOL_CHALLENGE)).toEqual([
      markerDocId(new Date(JOINED_AT), "w-2", "unused"),
    ]);
  });

  it("is idempotent under trigger redelivery", async () => {
    // A SECOND session stays logged throughout, deliberately. With only
    // one, both totals land on 0 and the zero floor hides a double
    // decrement — the assertion would pass against a reversal with no
    // idempotency guard at all. Keeping 4000 on the board makes the second
    // subtraction visible (it would read -2000, floored to 0).
    await join(VOL_CHALLENGE);
    await logWorkout("w-1", { totalVolume: 6000 });
    await logWorkout("w-2", { totalVolume: 4000 });
    await deleteWorkout("w-1");
    expect((await participant(VOL_CHALLENGE)).currentValue).toBe(4000);
    expect(await lifetime("liftVolumeKg")).toBe(4000);

    // At-least-once delivery: the same delete arrives again. Firestore
    // gives the trigger the same snapshot, so nothing distinguishes this
    // from the first call except the marker being gone.
    const snap = await db
      .collection("users")
      .doc(UID)
      .collection("workouts")
      .doc("w-1")
      .get();
    await onWorkoutDeleted.run(snap, {
      params: { uid: UID, workoutId: "w-1" },
    });
    await onWorkoutDeleted.run(snap, {
      params: { uid: UID, workoutId: "w-1" },
    });

    expect((await participant(VOL_CHALLENGE)).currentValue).toBe(4000);
    expect(await lifetime("liftVolumeKg")).toBe(4000);
  });

  it("re-logging after a delete credits again", async () => {
    // The point of deleting the markers rather than leaving them: session
    // ids are deterministic (`programme-{completionId}`), so a mis-log
    // that is deleted and re-logged reuses the id.
    await join(VOL_CHALLENGE);
    await logWorkout("w-1", { totalVolume: 6000 });
    await deleteWorkout("w-1");
    await logWorkout("w-1", { totalVolume: 2500 });

    expect((await participant(VOL_CHALLENGE)).currentValue).toBe(2500);
    expect(await lifetime("liftVolumeKg")).toBe(2500);
  });

  it("reverses what was APPLIED, not what the document says at delete time", async () => {
    // The case that justifies stamping `appliedValue` on the lifetime
    // marker, and it is reachable rather than theoretical: session ids are
    // deterministic, so a resumed programme Finish re-`set`s the SAME
    // workout doc. That overwrite is not a create, so it accrues nothing —
    // the counter still holds the first figure while the document now
    // shows the second.
    //
    // A reversal that re-derived from the deleted snapshot would subtract
    // 2000 from a total built with 6000 and leave 4000 of a deleted
    // workout standing forever. Reading the marker back subtracts exactly
    // what went in. (The challenge marker has recorded its `incrementBy`
    // all along, which is why the same test holds for both counters.)
    await join(VOL_CHALLENGE);
    await logWorkout("w-1", { totalVolume: 6000 });
    expect(await lifetime("liftVolumeKg")).toBe(6000);

    await db
      .collection("users")
      .doc(UID)
      .collection("workouts")
      .doc("w-1")
      .set({ date: "2026-08-05", totalVolume: 2000, exercises: [] });

    await deleteWorkout("w-1");

    expect(await lifetime("liftVolumeKg")).toBe(0);
    expect((await participant(VOL_CHALLENGE)).currentValue).toBe(0);
  });

  it("falls back to re-derivation for a marker written before appliedValue", async () => {
    // Every lifetime marker in production today predates the field, so the
    // fallback is not a defensive branch — it is the path all existing
    // data takes. Simulated by stripping the field, which is exactly what
    // those documents look like.
    await logWorkout("w-1", { totalVolume: 6000 });
    expect(await lifetime("liftVolumeKg")).toBe(6000);

    await lifetimeMarkerRef("lift", "w-1").update({
      appliedValue: admin.firestore.FieldValue.delete(),
    });
    expect(
      (await lifetimeMarkerRef("lift", "w-1").get()).data().appliedValue
    ).toBeUndefined();

    await deleteWorkout("w-1");

    expect(await lifetime("liftVolumeKg")).toBe(0);
  });

  it("reverses km progress and lifetime metres for a deleted run", async () => {
    await join(KM_CHALLENGE);
    await logRun("r-1", { distance: 6000, duration: 1700 });

    expect((await participant(KM_CHALLENGE)).currentValue).toBe(6);
    expect((await participant(KM_CHALLENGE)).tierAchieved).toBe("bronze");
    expect(await lifetime("runMeters")).toBe(6000);

    await deleteRun("r-1");

    expect((await participant(KM_CHALLENGE)).currentValue).toBe(0);
    expect((await participant(KM_CHALLENGE)).tierAchieved).toBeNull();
    expect(await lifetime("runMeters")).toBe(0);
    expect(await markerIds(KM_CHALLENGE)).toEqual([]);
  });

  it("rebuilds a fastest_effort best from surviving runs when the driver is deleted", async () => {
    // ADR-0012, third amendment. The best cannot be REVERSED (the marker
    // records the run's own time, never what it displaced), so deleting
    // the driving run triggers the rebuild the second amendment named:
    // re-derive the true best from the runs that still exist.
    await join(FAST_CHALLENGE);
    await logRun("r-slow", { distance: 6000, duration: 1600 });
    await logRun("r-fast", { distance: 6000, duration: 1400 });
    // A run below the 5000m target must count neither live nor in rebuild.
    await logRun("r-short", { distance: 3000, duration: 900 });
    expect((await participant(FAST_CHALLENGE)).currentValue).toBe(1400);
    expect((await participant(FAST_CHALLENGE)).tierAchieved).toBe("silver");

    await deleteRun("r-fast");

    // The bogus best is gone; the surviving qualifying run's time stands.
    expect((await participant(FAST_CHALLENGE)).currentValue).toBe(1600);
    expect((await participant(FAST_CHALLENGE)).tierAchieved).toBe("bronze");
    // The deleted run's marker is gone (re-log stays creditable); the
    // surviving QUALIFYING run's marker stays consistent with the rebuilt
    // best. r-short never minted one — the apply path's target gate
    // returns before any marker write.
    const remaining = await markerIds(FAST_CHALLENGE);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toContain("r-slow");
  });

  it("clears the best entirely when the only qualifying run is deleted", async () => {
    await join(FAST_CHALLENGE);
    await logRun("r-only", { distance: 6000, duration: 1400 });
    expect((await participant(FAST_CHALLENGE)).currentValue).toBe(1400);

    await deleteRun("r-only");

    expect((await participant(FAST_CHALLENGE)).currentValue).toBe(0);
    expect((await participant(FAST_CHALLENGE)).tierAchieved).toBeNull();
    expect(await markerIds(FAST_CHALLENGE)).toEqual([]);
  });

  it("skips the rebuild when the deleted run was slower than the best", async () => {
    // A run slower than the standing best cannot have set it (MIN), so
    // the common case costs nothing beyond the reversal. The value AND
    // tier stay; only the deleted run's marker goes.
    await join(FAST_CHALLENGE);
    await logRun("r-fast", { distance: 6000, duration: 1400 });
    await logRun("r-slow", { distance: 6000, duration: 1600 });
    expect((await participant(FAST_CHALLENGE)).currentValue).toBe(1400);

    await deleteRun("r-slow");

    expect((await participant(FAST_CHALLENGE)).currentValue).toBe(1400);
    expect((await participant(FAST_CHALLENGE)).tierAchieved).toBe("silver");
    expect(await markerIds(FAST_CHALLENGE)).toHaveLength(1);
  });

  it("does not run while the account is being deleted", async () => {
    // The precondition ADR-0012's first amendment adds. The executor
    // sweeps `workouts`, `runs` AND `lifetime` in one pass, so these
    // triggers fire once per document for a user whose accumulators are
    // already being erased. The serious half is resurrection: an
    // unguarded reversal racing the sweep could re-create a
    // `lifetime/totals` document the executor had removed.
    await join(VOL_CHALLENGE);
    await logWorkout("w-1", { totalVolume: 6000 });

    await db
      .collection("accountDeletionRequests")
      .doc(UID)
      .set({ uid: UID, status: "running" });

    await deleteWorkout("w-1");

    // Untouched: the guard returned before any reversal ran.
    expect((await participant(VOL_CHALLENGE)).currentValue).toBe(6000);
    expect(await lifetime("liftVolumeKg")).toBe(6000);
    expect(await markerIds(VOL_CHALLENGE)).toHaveLength(1);
  });

  it("never re-creates a lifetime totals doc the deletion sweep removed", async () => {
    // Defence in depth behind the guard above: a guard that passes and
    // then loses the race still lands here. The reversal writes with
    // `update` under an existence check, so a missing totals doc stays
    // missing — the accrual's own `set(..., {merge: true})` is what could
    // resurrect one, and this path deliberately does not mirror it.
    await join(VOL_CHALLENGE);
    await logWorkout("w-1", { totalVolume: 6000 });
    expect(await lifetime("liftVolumeKg")).toBe(6000);

    // The sweep gets there first: totals gone, marker still standing.
    await lifetimeTotalsRef().delete();

    await deleteWorkout("w-1");

    expect((await lifetimeTotalsRef().get()).exists).toBe(false);
    // The marker is still cleaned up — leaving it would strand a record
    // of an accrual whose counter no longer exists.
    expect((await lifetimeMarkerRef("lift", "w-1").get()).exists).toBe(false);
  });

  it("is a no-op for a session that never credited", async () => {
    // An ineligible run (isInvalid + savedAnyway) accrues nothing on
    // create, so it has no markers and the reversal has nothing to find.
    // This is why the delete side does not re-check eligibility.
    await join(KM_CHALLENGE);
    await logRun("r-good", { distance: 6000, duration: 1700 });
    expect((await participant(KM_CHALLENGE)).currentValue).toBe(6);

    const ref = db.collection("users").doc(UID).collection("runs").doc("r-bad");
    await ref.set({
      date: "2026-08-06",
      distance: 20000,
      duration: 480,
      isInvalid: true,
      savedAnyway: true,
    });
    const bad = await ref.get();
    await onRunCreated.run(bad, { params: { uid: UID, runId: "r-bad" } });
    expect((await participant(KM_CHALLENGE)).currentValue).toBe(6);

    await ref.delete();
    await onRunDeleted.run(bad, { params: { uid: UID, runId: "r-bad" } });

    // The good run's credit is untouched — the reversal did not go
    // looking for something to decrement and settle on the wrong marker.
    expect((await participant(KM_CHALLENGE)).currentValue).toBe(6);
    expect(await lifetime("runMeters")).toBe(6000);
  });

  it("does not touch a challenge the user is not in", async () => {
    // No membership, no participant doc, nothing to decrement — and the
    // fast-path skip must not create one on the way past.
    await logWorkout("w-1", { totalVolume: 6000 });
    expect(await participant(VOL_CHALLENGE)).toBeNull();

    await deleteWorkout("w-1");

    expect(await participant(VOL_CHALLENGE)).toBeNull();
  });
});
