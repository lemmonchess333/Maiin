/** Real Firestore transactions and deployed trigger handlers, without mocks. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

describe.skipIf(!enabled)(
  "participation goals — real source and membership events",
  () => {
    let db, admin, fns;
    const uid = "participation-progress-integration";
    const id = (metric) => `participation-integration-${metric}`;
    const source = (kind, key = "same-id") =>
      db.doc(`users/${uid}/${kind}/${key}`);
    const member = (metric) =>
      db.doc(`challenges/${id(metric)}/participants/${uid}`);
    const ts = (iso) => admin.firestore.Timestamp.fromDate(new Date(iso));
    const context = { params: { uid, workoutId: "same-id", runId: "same-id" } };
    const workout = { date: "2025-01-10", durationMinutes: 45, exercises: [] };
    const run = { date: "2025-01-10", duration: 1800, distance: 5000 };

    beforeAll(() => {
      fns = require("../../index");
      admin = require("firebase-admin");
      db = admin.firestore();
    });

    async function wipe() {
      await db.recursiveDelete(db.doc(`users/${uid}`));
      for (const metric of ["active_days", "training_minutes"])
        await db.recursiveDelete(db.doc(`challenges/${id(metric)}`));
    }

    beforeEach(async () => {
      await wipe();
      await db.doc(`users/${uid}`).set({ uid });
      for (const metric of ["active_days", "training_minutes"]) {
        await db.doc(`challenges/${id(metric)}`).set({
          metric,
          startDate: ts("2025-01-01"),
          endDate: ts("2025-02-01"),
          tiers: { bronze: 1, silver: 2, gold: 60 },
        });
        await member(metric).set({
          currentValue: 0,
          tierAchieved: null,
          joinedAt: ts("2025-01-01"),
        });
      }
    });
    afterAll(async () => {
      await wipe();
    });

    async function values() {
      return Promise.all(
        ["active_days", "training_minutes"].map(
          async (metric) => (await member(metric).get()).data()?.currentValue
        )
      );
    }

    async function create(kind, data) {
      const ref = source(kind);
      await ref.set({
        ...data,
        completedAt: ts(`${data.date}T12:00:00Z`),
      });
      const snap = await ref.get();
      await fns[kind === "workouts" ? "onWorkoutCreated" : "onRunCreated"].run(
        snap,
        context
      );
      return snap;
    }

    it("deduplicates same-day run/lift IDs and ignores stale create snapshots after edits", async () => {
      const original = await create("workouts", workout);
      await create("runs", run);
      expect(await values()).toEqual([1, 75]);
      await source("workouts").update({ durationMinutes: 10 });
      const change = {
        before: original,
        after: await source("workouts").get(),
      };
      await fns.onWorkoutUpdated.run(change, context);
      await fns.onWorkoutCreated.run(original, context);
      await fns.onWorkoutUpdated.run(change, context);
      expect(await values()).toEqual([1, 40]);
    });

    it("updates run eligibility and local dates using current source facts", async () => {
      const original = await create("runs", run);
      await source("runs").update({ isInvalid: true });
      const invalid = { before: original, after: await source("runs").get() };
      await fns.onRunUpdated.run(invalid, context);
      expect(await values()).toEqual([0, 0]);
      await source("runs").update({ isInvalid: false, date: "2025-02-01" });
      await fns.onRunUpdated.run(
        { before: invalid.after, after: await source("runs").get() },
        context
      );
      expect(await values()).toEqual([0, 0]);
      await source("runs").update({ date: "2025-01-11", duration: 30 });
      await fns.onRunUpdated.run(
        { before: invalid.after, after: await source("runs").get() },
        context
      );
      await fns.onRunUpdated.run(invalid, context);
      expect(await values()).toEqual([1, 0.5]);
    });

    it("keeps a day when one source is deleted, and stale deletes respect re-logged IDs", async () => {
      const lift = await create("workouts", workout);
      const jog = await create("runs", run);
      await source("workouts").delete();
      await fns.onWorkoutDeleted.run(lift, context);
      expect(await values()).toEqual([1, 30]);
      await source("runs").delete();
      await fns.onRunDeleted.run(jog, context);
      expect(await values()).toEqual([0, 0]);
      await source("runs").set({ ...run, duration: 600 });
      await fns.onRunDeleted.run(jog, context);
      expect(await values()).toEqual([1, 10]);
    });

    it("backfills a midmonth join and rejoin without creating source markers", async () => {
      await source("workouts").set(workout);
      await source("runs").set(run);
      for (const metric of ["active_days", "training_minutes"]) {
        await member(metric).delete();
        await member(metric).set({
          currentValue: 0,
          tierAchieved: null,
          joinedAt: ts("2025-01-20"),
        });
        const event = {
          params: { uid, challengeId: id(metric) },
          timestamp: new Date().toISOString(),
        };
        await fns.onChallengeParticipantCreated.run(null, event);
        await fns.onChallengeParticipantCreated.run(null, event);
        expect((await member(metric).collection("applied").get()).empty).toBe(
          true
        );
      }
      expect(await values()).toEqual([1, 75]);
    });

    it("concurrent events converge on distinct current days", async () => {
      await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          source("workouts", `lift-${index}`).set({
            date: `2025-01-${String(index + 10).padStart(2, "0")}`,
            durationMinutes: 10,
          })
        )
      );
      const {
        reconcileParticipationChallenges,
      } = require("../../lib/challengeParticipationProgress");
      await Promise.all(
        Array.from({ length: 5 }, () =>
          reconcileParticipationChallenges(db, uid, ["2025-01-10"])
        )
      );
      expect(await values()).toEqual([5, 50]);
    });
  }
);
