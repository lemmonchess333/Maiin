import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const enabled = process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8080";
describe.skipIf(!enabled)(
  "workout correction projections — real triggers",
  () => {
    let db, created, updated, deleted, admin;
    const uid = "workout-correction-integration";
    const challengeId = "correction-volume";
    const source = () => db.doc(`users/${uid}/workouts/lift`);
    const total = () => db.doc(`users/${uid}/lifetime/totals`);
    const participant = () =>
      db.doc(`challenges/${challengeId}/participants/${uid}`);
    const context = { params: { uid, workoutId: "lift" } };
    beforeAll(() => {
      const index = require("../../index");
      created = index.onWorkoutCreated;
      updated = index.onWorkoutUpdated;
      deleted = index.onWorkoutDeleted;
      admin = require("firebase-admin");
      db = admin.firestore();
    });
    beforeEach(async () => {
      await db.recursiveDelete(db.doc(`users/${uid}`));
      await db.recursiveDelete(db.doc(`challenges/${challengeId}`));
      await db.doc("activities/corrected-lift").delete();
      await db.doc(`users/${uid}`).set({
        uid,
        weightKg: 80,
        heightCm: 180,
        age: 30,
        sex: "male",
        program: { goal: "recomp" },
      });
      await db.doc(`challenges/${challengeId}`).set({
        metric: "total_volume",
        tiers: { bronze: 1000, silver: 2000, gold: 5000 },
        startDate: admin.firestore.Timestamp.fromDate(new Date("2026-01-01")),
        endDate: admin.firestore.Timestamp.fromDate(new Date("2030-01-01")),
      });
      await participant().set({
        currentValue: 0,
        tierAchieved: null,
        joinedAt: admin.firestore.Timestamp.fromDate(new Date("2026-01-01")),
      });
    });
    afterAll(async () => {
      await db.recursiveDelete(db.doc(`users/${uid}`));
      await db.recursiveDelete(db.doc(`challenges/${challengeId}`));
      await db.doc("activities/corrected-lift").delete();
    });
    async function log(weight = 100) {
      await source().set({
        date: "2026-09-10",
        durationMinutes: 40,
        totalVolume: weight * 24,
        totalCalories: 240,
        exercises: [
          {
            exerciseId: "bench",
            exerciseName: "Bench",
            sets: Array.from({ length: 3 }, () => ({
              weightKg: weight,
              reps: 8,
            })),
          },
        ],
      });
      const snap = await source().get();
      await created.run(snap, context);
      return snap;
    }
    async function correction(revision, volume) {
      const before = await source().get();
      await source().update({
        revision,
        totalVolume: volume,
        sourceVolumeAtFirstCorrection:
          before.data().sourceVolumeAtFirstCorrection ??
          before.data().totalVolume,
      });
      const after = await source().get();
      return { before, after };
    }
    it("adjusts totals and tiers down and up exactly once despite reordered deliveries", async () => {
      await log();
      expect((await total().get()).data().liftVolumeKg).toBe(2400);
      expect((await participant().get()).data()).toMatchObject({
        currentValue: 2400,
        tierAchieved: "silver",
      });
      const first = await correction(1, 900);
      await updated.run(first, context);
      expect((await total().get()).data().liftVolumeKg).toBe(900);
      expect((await participant().get()).data()).toMatchObject({
        currentValue: 900,
        tierAchieved: null,
      });
      const second = await correction(2, 1800);
      await updated.run(second, context);
      await updated.run(first, context);
      await updated.run(second, context);
      expect((await total().get()).data().liftVolumeKg).toBe(1800);
      expect((await participant().get()).data()).toMatchObject({
        currentValue: 1800,
        tierAchieved: "bronze",
      });
      const last = await source().get();
      await source().delete();
      await deleted.run(last, context);
      await updated.run(first, context);
      expect((await total().get()).data().liftVolumeKg).toBe(0);
      expect((await participant().get()).data().currentValue).toBe(0);
      expect((await source().get()).exists).toBe(false);
    }, 30000);
    it("credits a corrected zero-volume workout and converges when creation arrives late", async () => {
      await log(0);
      expect((await total().get()).exists).toBe(false);
      const change = await correction(1, 1200);
      await updated.run(change, context);
      await created.run(change.before, context);
      await updated.run(change, context);
      expect((await total().get()).data().liftVolumeKg).toBe(1200);
      expect((await participant().get()).data().currentValue).toBe(1200);
    }, 30000);
    it("updates an existing owned feed summary even when the share link arrives after correction", async () => {
      await log();
      const change = await correction(1, 1200);
      await source().update({
        durationMinutes: 30,
        exercises: [
          {
            exerciseId: "bench",
            exerciseName: "Bench",
            sets: [{ reps: 6, weightKg: 50 }],
          },
        ],
      });
      await updated.run(change, context);
      await db.doc("activities/corrected-lift").set({
        authorId: uid,
        caption: "Keep this note",
        visibility: "followers",
        totalVolume: 2400,
      });
      const before = await source().get();
      await source().update({ sharedActivityId: "corrected-lift" });
      await updated.run({ before, after: await source().get() }, context);
      expect(
        (await db.doc("activities/corrected-lift").get()).data()
      ).toMatchObject({
        caption: "Keep this note",
        visibility: "followers",
        totalVolume: 1200,
        duration: 1800,
        exercises: [
          {
            name: "Bench",
            reps: 6,
            weightKg: 50,
            targetReps: 6,
            targetWeightKg: 50,
          },
        ],
      });
      await db
        .doc("activities/corrected-lift")
        .update({ authorId: "someone-else", totalVolume: 7 });
      await updated.run(change, context);
      expect(
        (await db.doc("activities/corrected-lift").get()).data().totalVolume
      ).toBe(7);
    }, 30000);
  }
);
