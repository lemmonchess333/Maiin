/**
 * Integration: leaving a challenge and re-joining must credit your history.
 *
 * The bug, driven end-to-end here through the real triggers:
 *
 *   `leaveChallenge` deletes `challenges/{id}/participants/{uid}`. Firestore
 *   document deletes do NOT cascade to subcollections, so every
 *   `applied/{sourceId}` idempotency marker survived as an orphan.
 *
 *   Re-joining fires `onChallengeParticipantCreated`, whose entire purpose is
 *   to credit the user's existing in-window activity — it replays each source
 *   through the same apply helpers. Every replay hit a surviving marker and
 *   returned a transactional no-op, so the re-joined user stayed at ZERO for
 *   their whole history in that window, permanently, while the card read "no
 *   qualifying run yet".
 *
 *   That is precisely the symptom the join-time backfill was written to fix
 *   (a day-20 joiner getting no credit for a day-5 run), reintroduced through
 *   the side door for anyone who had ever left.
 *
 * Driven against the emulator rather than unit-tested because the failure is
 * in the INTERACTION of three things — a non-cascading delete, a marker
 * lookup, and a trigger — and no one of them is wrong on its own. A unit test
 * of any single piece passes both before and after the fix.
 *
 * The redelivery controls matter as much as the fix: an at-least-once trigger
 * that stopped being idempotent would be a worse bug than the one being
 * fixed, so every "credits again" assertion is paired with a "does not
 * double-count" one.
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
let onChallengeParticipantCreated;

const UID = "u-rejoin-1";
const CHALLENGE = "july-rejoin-wc";

const tsFromIso = (iso) => admin.firestore.Timestamp.fromDate(new Date(iso));

const participantRef = () =>
  db.collection("challenges").doc(CHALLENGE).collection("participants").doc(UID);

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  const idx = require("../../index");
  onWorkoutCreated = idx.onWorkoutCreated;
  onChallengeParticipantCreated = idx.onChallengeParticipantCreated;
  admin = require("firebase-admin");
  db = admin.firestore();
});

async function wipe() {
  const parts = await db
    .collection("challenges")
    .doc(CHALLENGE)
    .collection("participants")
    .listDocuments();
  for (const p of parts) {
    const markers = await p.collection("applied").listDocuments();
    for (const m of markers) await m.delete().catch(() => {});
    await p.delete().catch(() => {});
  }
  await db.collection("challenges").doc(CHALLENGE).delete().catch(() => {});
  const workouts = await db
    .collection("users")
    .doc(UID)
    .collection("workouts")
    .listDocuments();
  for (const w of workouts) await w.delete().catch(() => {});
}

async function seedChallenge() {
  await db
    .collection("challenges")
    .doc(CHALLENGE)
    .set({
      metric: "workout_count",
      startDate: tsFromIso("2026-07-01T00:00:00Z"),
      endDate: tsFromIso("2026-08-01T00:00:00Z"),
      tiers: {},
    });
}

/** The shape `joinChallenge` writes, with an explicit membership stamp. */
async function join(joinedAtIso) {
  await participantRef().set({
    currentValue: 0,
    tierAchieved: null,
    joinedAt: tsFromIso(joinedAtIso),
    displayName: "Athlete",
  });
}

/** Exactly what `leaveChallenge` does: delete the doc, nothing else. */
async function leave() {
  await participantRef().delete();
}

async function fireJoinTrigger() {
  await onChallengeParticipantCreated.run(null, {
    params: { challengeId: CHALLENGE, uid: UID },
    timestamp: new Date().toISOString(),
  });
}

async function logWorkout(id, date) {
  const ref = db.collection("users").doc(UID).collection("workouts").doc(id);
  await ref.set({
    date,
    exercises: [{ name: "Bench", sets: [{ reps: 8, weight: 60 }] }],
  });
  const snap = await ref.get();
  await onWorkoutCreated.run(snap, { params: { uid: UID, workoutId: id } });
}

async function value() {
  const snap = await participantRef().get();
  return snap.exists ? snap.data().currentValue || 0 : null;
}

async function markerIds() {
  const docs = await participantRef().collection("applied").listDocuments();
  return docs.map((d) => d.id).sort();
}

suite("challenge progress survives leave → re-join", () => {
  beforeEach(async () => {
    await wipe();
    await seedChallenge();
  });

  it("credits history again after a re-join, and the old markers are inert", async () => {
    await join("2026-07-01T00:00:00Z");
    await logWorkout("w-1", "2026-07-02");
    expect(await value()).toBe(1);

    const beforeLeave = await markerIds();
    expect(beforeLeave).toHaveLength(1);

    await leave();

    // The orphaned marker is still there — a delete does not cascade.
    // Asserted rather than assumed, because the entire bug rests on it and
    // "the marker was cleaned up somehow" would make this test vacuous.
    expect(await markerIds()).toEqual(beforeLeave);

    // Re-join as a NEW membership, then the join trigger backfills.
    await join("2026-07-15T00:00:00Z");
    await fireJoinTrigger();

    // Pre-fix this was 0: the backfill replayed w-1, hit the surviving
    // marker, and no-op'd.
    expect(await value()).toBe(1);

    // Both memberships' markers now coexist, and the credit came from a
    // marker under the NEW membership — not from the old one being
    // rewritten. Derived from the module rather than a hand-computed
    // millisecond literal, so a key-format change fails the module's own
    // unit tests instead of silently rotting this assertion.
    const after = await markerIds();
    expect(after).toHaveLength(2);
    expect(after).toContain(
      markerDocId(new Date("2026-07-15T00:00:00Z"), "w-1", "unused")
    );
    expect(after).toContain(
      markerDocId(new Date("2026-07-01T00:00:00Z"), "w-1", "unused")
    );
  });

  it("does NOT double-count when the join trigger is redelivered", async () => {
    // At-least-once delivery. If the fix had been "wipe the markers on
    // leave", a late sweep could land after a re-join and this would climb.
    await join("2026-07-01T00:00:00Z");
    await logWorkout("w-1", "2026-07-02");
    await leave();
    await join("2026-07-15T00:00:00Z");

    await fireJoinTrigger();
    await fireJoinTrigger();
    await fireJoinTrigger();

    expect(await value()).toBe(1);
  });

  it("does NOT double-count a redelivered activity trigger within one membership", async () => {
    // The property the markers exist for in the first place — unchanged.
    await join("2026-07-01T00:00:00Z");
    await logWorkout("w-1", "2026-07-02");

    const ref = db.collection("users").doc(UID).collection("workouts").doc("w-1");
    const snap = await ref.get();
    await onWorkoutCreated.run(snap, {
      params: { uid: UID, workoutId: "w-1" },
    });

    expect(await value()).toBe(1);
  });

  it("a re-join with no history credits nothing", async () => {
    // The backfill must not invent progress; only replay what exists.
    await join("2026-07-01T00:00:00Z");
    await leave();
    await join("2026-07-15T00:00:00Z");
    await fireJoinTrigger();

    expect(await value()).toBe(0);
  });

  it("still respects the challenge window on the re-credit", async () => {
    // The re-join path must not become a way to credit out-of-window
    // activity that the live path would have refused.
    await join("2026-07-01T00:00:00Z");
    await logWorkout("w-june", "2026-06-15");
    expect(await value()).toBe(0);

    await leave();
    await join("2026-07-15T00:00:00Z");
    await fireJoinTrigger();

    expect(await value()).toBe(0);
  });
});
