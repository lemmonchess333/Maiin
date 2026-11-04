/**
 * Integration: medals and the trophy case (Soc15), through the real
 * `onChallengeParticipantWritten` trigger and the real Admin SDK.
 *
 * The unit suite (medals.test.js) holds every decision on an in-memory
 * store; what only the emulator can show is the part the store imitates:
 * a transaction's read of the participant's `updateTime`, `mergeFields`
 * replacing the summary and nothing else on the public profile, and the
 * backfill's paged query. Challenge windows are derived from the clock.
 *
 * Gated on FIRESTORE_EMULATOR_HOST — skips in an ordinary unit run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

let db;
let admin;
let onChallengeParticipantWritten;
let backfillMedals;

const UID = "medals-runner";
const RUNNING = "medals-it-running";
const ENDED = "medals-it-ended";

function utcMonth(offset) {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)
  );
}

function mileage(offset) {
  return {
    name: "Mileage",
    type: "monthly",
    metric: "total_km",
    tiers: { bronze: 10, silver: 25, gold: 50 },
    startDate: admin.firestore.Timestamp.fromDate(utcMonth(offset)),
    endDate: admin.firestore.Timestamp.fromDate(utcMonth(offset + 1)),
  };
}

const participant = (id) => db.doc(`challenges/${id}/participants/${UID}`);
const medal = (id) => db.doc(`users/${UID}/medals/${id}`);
const profile = () => db.doc(`users/${UID}/public/profile`);

/** A write to the participant, then the trigger's delivery of it. */
async function deliver(id, before) {
  const after = await participant(id).get();
  await onChallengeParticipantWritten.run(
    {
      before: before
        ? { exists: true, data: () => before }
        : { exists: false, data: () => undefined },
      after,
    },
    {
      params: { challengeId: id, uid: UID },
      timestamp: new Date().toISOString(),
    }
  );
}

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  ({ onChallengeParticipantWritten } = require("../../index"));
  ({ backfillMedals } = require("../../lib/medals"));
  admin = require("firebase-admin");
  db = admin.firestore();
});

suite(
  "onChallengeParticipantWritten keeps the medal and the trophy case",
  () => {
    beforeEach(async () => {
      for (const id of [RUNNING, ENDED]) {
        await db.recursiveDelete(db.doc(`challenges/${id}`));
      }
      await db.recursiveDelete(db.doc(`users/${UID}`));
      await db.doc(`challenges/${RUNNING}`).set(mileage(0));
      await db.doc(`challenges/${ENDED}`).set(mileage(-3));
      await profile().set({
        uid: UID,
        displayName: "Runner",
        badgeSummary: { earnedMap: { first_step: "2026-01-01" }, count: 1 },
      });
    }, 60_000);

    it("a tier reached makes the medal and its line, and leaves the profile's other fields", async () => {
      await participant(RUNNING).set({
        tierAchieved: "bronze",
        currentValue: 12,
      });
      await deliver(RUNNING, { tierAchieved: null, currentValue: 8 });

      const stored = (await medal(RUNNING).get()).data();
      expect(stored).toMatchObject({ tier: "bronze", value: 12, goal: 10 });
      const updateTime = (await participant(RUNNING).get()).updateTime;
      // toMillis, as the trigger reads it: toDate() rounds to the nearest
      // millisecond and toMillis() floors, so the two differ by 1 ms
      // whenever the write landed in the second half of one.
      expect(stored.earnedAt).toBe(
        new Date(updateTime.toMillis()).toISOString()
      );

      const pub = (await profile().get()).data();
      expect(pub.medalSummary[RUNNING]).toMatchObject({ tier: "bronze" });
      expect(pub.displayName).toBe("Runner");
      expect(pub.badgeSummary.count).toBe(1);
    });

    it("a second delivery writes nothing", async () => {
      await participant(RUNNING).set({
        tierAchieved: "silver",
        currentValue: 26,
      });
      await deliver(RUNNING, null);
      const first = await medal(RUNNING).get();
      const firstProfile = await profile().get();
      await deliver(RUNNING, null);
      expect(
        (await medal(RUNNING).get()).updateTime.isEqual(first.updateTime)
      ).toBe(true);
      expect(
        (await profile().get()).updateTime.isEqual(firstProfile.updateTime)
      ).toBe(true);
    });

    it("a reversal below bronze while the month runs removes it and its line", async () => {
      await participant(RUNNING).set({
        tierAchieved: "bronze",
        currentValue: 12,
      });
      await deliver(RUNNING, null);
      await participant(RUNNING).set({ tierAchieved: null, currentValue: 4 });
      await deliver(RUNNING, { tierAchieved: "bronze", currentValue: 12 });
      expect((await medal(RUNNING).get()).exists).toBe(false);
      expect((await profile().get()).data().medalSummary).toEqual({});
    });

    it("leaves a settled challenge's medal as it is", async () => {
      await medal(ENDED).set({
        challengeId: ENDED,
        name: "Mileage",
        metric: "total_km",
        type: "monthly",
        tier: "gold",
        value: 52,
        goal: 50,
        startDate: "2000-01-01",
        endDate: "2000-02-01",
        earnedAt: "2000-01-20T00:00:00.000Z",
        reachedAt: {},
      });
      // An old run deleted today: the row falls to bronze, written now.
      await participant(ENDED).set({
        tierAchieved: "bronze",
        currentValue: 12,
      });
      await deliver(ENDED, { tierAchieved: "gold", currentValue: 52 });
      expect((await medal(ENDED).get()).data().tier).toBe("gold");
    });

    it("the backfill gives a medal its participant earned before, then writes nothing", async () => {
      await participant(ENDED).set({
        tierAchieved: "silver",
        currentValue: 30,
      });
      await participant(RUNNING).set({ tierAchieved: null, currentValue: 3 });
      const first = await backfillMedals(db, {
        challengeId: ENDED,
        documentId: () => admin.firestore.FieldPath.documentId(),
      });
      expect(first).toMatchObject({
        challenges: 1,
        participants: 1,
        written: 1,
      });
      expect((await medal(ENDED).get()).data().tier).toBe("silver");
      expect(Object.keys((await profile().get()).data().medalSummary)).toEqual([
        ENDED,
      ]);
      const second = await backfillMedals(db, {
        challengeId: ENDED,
        documentId: () => admin.firestore.FieldPath.documentId(),
      });
      expect(second.written).toBe(0);
    });
  }
);
