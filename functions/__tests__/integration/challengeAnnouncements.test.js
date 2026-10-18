/** Monthly notification claims against real Firestore transaction semantics. */
import { afterAll, beforeAll, beforeEach, describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const announcements = require("../../lib/challengeAnnouncements");
const NOW = new Date("2048-11-01T09:00:00Z");
const PROFILE = { timezone: "Europe/London" };
const CONSENT = { enabled: true, challenges: true };
const candidate = announcements.announcementCandidate(PROFILE, CONSENT, NOW);

describe.skipIf(!enabled)(
  "monthly announcement claims — real transactions",
  () => {
    const uid = "monthly-announcement-integration";
    let db, admin;
    const state = () =>
      db.doc(`users/${uid}/settings/challengeAnnouncement-2048-11`);
    beforeAll(() => {
      require("../../index");
      admin = require("firebase-admin");
      db = admin.firestore();
    });
    const timestamp = () => admin.firestore.FieldValue.serverTimestamp();
    async function wipe() {
      await db.recursiveDelete(db.doc(`users/${uid}`));
      await db.doc(`accountDeletionRequests/${uid}`).delete();
      await db.doc(`deletedAccounts/${uid}`).delete();
      await db.doc(`challenges/${candidate.definition.id}`).delete();
    }
    beforeEach(async () => {
      await wipe();
      await db.doc(`users/${uid}`).set(PROFILE);
      await db.doc(`users/${uid}/settings/push`).set(CONSENT);
      await db
        .doc(`challenges/${candidate.definition.id}`)
        .set(candidate.definition);
    });
    afterAll(async () => {
      if (db) await wipe();
    });
    const claim = (value = candidate, now = NOW) =>
      announcements.claimAnnouncement(db, uid, value, now, timestamp());

    it("only one of six concurrent transactions acquires the month", async () => {
      const claims = await Promise.all(
        Array.from({ length: 6 }, () => claim())
      );
      expect(claims.filter(Boolean)).toHaveLength(1);
      expect((await state().get()).data().status).toBe("sending");
      await announcements.finishAnnouncement(
        db,
        uid,
        claims.find(Boolean),
        "sent",
        NOW,
        timestamp()
      );
      expect(await claim()).toBeNull();
    });

    it("explicit no-acceptance permits only a later morning retry", async () => {
      const first = await claim();
      await announcements.finishAnnouncement(
        db,
        uid,
        first,
        "retryable",
        NOW,
        timestamp()
      );
      expect(await claim()).toBeNull();
      const tomorrow = new Date("2048-11-02T09:00:00Z");
      const second = await claim(
        announcements.announcementCandidate(PROFILE, CONSENT, tomorrow),
        tomorrow
      );
      expect(second.attemptId).not.toBe(first.attemptId);
      await announcements.finishAnnouncement(
        db,
        uid,
        first,
        "sent",
        NOW,
        timestamp()
      );
      expect((await state().get()).data().attemptId).toBe(second.attemptId);
      expect((await state().get()).data().status).toBe("sending");
    });

    it("definition availability and persisted opt-in are read in the claim transaction", async () => {
      await db.doc(`challenges/${candidate.definition.id}`).delete();
      expect(await claim()).toBeNull();
      expect((await state().get()).exists).toBe(false);
      await db
        .doc(`challenges/${candidate.definition.id}`)
        .set(candidate.definition);
      await db.doc(`users/${uid}/settings/push`).update({ challenges: false });
      expect(await claim()).toBeNull();
      await db.doc(`users/${uid}/settings/push`).update({ challenges: true });
      expect(await claim()).toBeTruthy();
    });

    it("completion cannot recreate a ledger removed during erasure", async () => {
      const first = await claim();
      await state().delete();
      await db.doc(`accountDeletionRequests/${uid}`).set({ status: "running" });
      await announcements.finishAnnouncement(
        db,
        uid,
        first,
        "sent",
        NOW,
        timestamp()
      );
      expect((await state().get()).exists).toBe(false);
      expect(await claim()).toBeNull();
    });
  }
);
