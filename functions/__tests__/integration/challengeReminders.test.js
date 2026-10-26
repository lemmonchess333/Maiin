/** Closing reminder eligibility and claims against real Firestore. */
import { afterAll, beforeAll, beforeEach, describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const campaigns = require("../../lib/challengeAnnouncements");
const NOW = new Date("2048-11-28T09:00:00Z");
const PROFILE = { timezone: "Europe/London" };
const CONSENT = { enabled: true, challengeReminders: true };
const candidate = campaigns.reminderCandidate(PROFILE, CONSENT, NOW);

describe.skipIf(!enabled)(
  "monthly closing reminder claims — real transactions",
  () => {
    const uid = "monthly-reminder-integration";
    let db, admin;
    const state = () =>
      db.doc(`users/${uid}/settings/challengeReminder-2048-11`);
    const participant = (definition = candidate.definitions[0], owner = uid) =>
      db.doc(`challenges/${definition.id}/participants/${owner}`);
    const timestamp = () => admin.firestore.FieldValue.serverTimestamp();
    const claim = (now = NOW) =>
      campaigns.claimReminder(
        db,
        uid,
        campaigns.reminderCandidate(PROFILE, CONSENT, now),
        now,
        timestamp()
      );

    beforeAll(() => {
      require("../../index");
      admin = require("firebase-admin");
      db = admin.firestore();
    });
    async function wipe() {
      await Promise.all([
        db.recursiveDelete(db.doc(`users/${uid}`)),
        db.doc(`accountDeletionRequests/${uid}`).delete(),
        db.doc(`deletedAccounts/${uid}`).delete(),
        ...candidate.definitions.map((definition) =>
          db.recursiveDelete(db.doc(`challenges/${definition.id}`))
        ),
      ]);
    }
    beforeEach(async () => {
      await wipe();
      await Promise.all([
        db.doc(`users/${uid}`).set(PROFILE),
        db.doc(`users/${uid}/settings/push`).set(CONSENT),
        ...candidate.definitions.map((definition) =>
          db.doc(`challenges/${definition.id}`).set(definition)
        ),
      ]);
      await participant().set({ currentValue: 0, tierAchieved: null });
    });
    afterAll(async () => {
      if (db) await wipe();
    });

    it("allows only one of six simultaneous claims and keeps the launch ledger separate", async () => {
      const results = await Promise.all(
        Array.from({ length: 6 }, () => claim())
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      await campaigns.finishAnnouncement(
        db,
        uid,
        results.find(Boolean),
        "sent",
        NOW,
        timestamp()
      );
      expect((await state().get()).data().status).toBe("sent");
      expect(
        (
          await db
            .doc(`users/${uid}/settings/challengeAnnouncement-2048-11`)
            .get()
        ).exists
      ).toBe(false);
      expect(await claim()).toBeNull();
    });

    it("rechecks membership, progress and consent before acquiring a claim", async () => {
      await participant().delete();
      expect(await claim()).toBeNull();
      await participant().set({
        currentValue: candidate.definitions[0].tiers.gold,
        tierAchieved: null,
      });
      expect(await claim()).toBeNull();
      await participant().update({ currentValue: 0 });
      await db
        .doc(`users/${uid}/settings/push`)
        .update({ challengeReminders: false });
      expect(await claim()).toBeNull();
      expect((await state().get()).exists).toBe(false);
      await db
        .doc(`users/${uid}/settings/push`)
        .update({ challengeReminders: true });
      expect(await claim()).toBeTruthy();
    });

    it("checks the real shared SUM rather than an individual runner's value", async () => {
      await participant().delete();
      const group = candidate.definitions.find(
        (definition) => definition.collectiveTarget
      );
      await participant(group).set({ currentValue: 1 });
      await participant(group, "monthly-reminder-peer").set({
        currentValue: 999,
      });
      expect(await claim()).toBeNull();
      await participant(group, "monthly-reminder-peer").update({
        currentValue: 998,
      });
      const result = await claim();
      expect(result.definitions.map((definition) => definition.id)).toEqual([
        group.id,
      ]);
    });

    it("fences a later morning retry and never recreates an erased ledger", async () => {
      const first = await claim();
      await campaigns.finishAnnouncement(
        db,
        uid,
        first,
        "retryable",
        NOW,
        timestamp()
      );
      expect(await claim()).toBeNull();
      const tomorrow = new Date("2048-11-29T09:00:00Z");
      const second = await claim(tomorrow);
      expect(second.attemptId).not.toBe(first.attemptId);
      await campaigns.finishAnnouncement(
        db,
        uid,
        first,
        "sent",
        NOW,
        timestamp()
      );
      expect((await state().get()).data().attemptId).toBe(second.attemptId);
      await state().delete();
      await db.doc(`accountDeletionRequests/${uid}`).set({ status: "running" });
      await campaigns.finishAnnouncement(
        db,
        uid,
        second,
        "sent",
        tomorrow,
        timestamp()
      );
      expect((await state().get()).exists).toBe(false);
      expect(await claim(tomorrow)).toBeNull();
    });
  }
);
