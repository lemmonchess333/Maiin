/**
 * Integration: the active-user sweep the scheduled jobs share (survey item
 * 44) reaches the most recently active first, hands each worker the user's
 * own document, and stops starting new users at its time limit rather than
 * being cut off mid-page.
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
let sweep;
const PREFIX = "sweep-order-";
const HOUR = 3_600_000;

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  ({ _sweepActiveUsers: sweep } = require("../../index"));
  admin = require("firebase-admin");
  db = admin.firestore();
});

suite("the active-user sweep", () => {
  beforeEach(async () => {
    const stale = await db.collection("users").get();
    for (const doc of stale.docs) {
      if (doc.id.startsWith(PREFIX)) await doc.ref.delete();
    }
    const at = (hoursAgo) =>
      admin.firestore.Timestamp.fromMillis(Date.now() - hoursAgo * HOUR);
    await db
      .doc(`users/${PREFIX}old`)
      .set({ lastActiveAt: at(200), timezone: "UTC" });
    await db
      .doc(`users/${PREFIX}new`)
      .set({ lastActiveAt: at(1), timezone: "Europe/London" });
    await db
      .doc(`users/${PREFIX}mid`)
      .set({ lastActiveAt: at(50), timezone: "UTC" });
    // Outside the window: never reached.
    await db.doc(`users/${PREFIX}gone`).set({ lastActiveAt: at(24 * 40) });
  });

  const ours = (seen) => seen.filter((s) => s.uid.startsWith(PREFIX));

  it("reaches the most recently active first, with each user's own document", async () => {
    const seen = [];
    const summary = await sweep({
      name: "test",
      cutoffDays: 14,
      perUser: async (uid, data) => {
        seen.push({ uid, timezone: data.timezone });
      },
    });
    expect(ours(seen)).toEqual([
      { uid: `${PREFIX}new`, timezone: "Europe/London" },
      { uid: `${PREFIX}mid`, timezone: "UTC" },
      { uid: `${PREFIX}old`, timezone: "UTC" },
    ]);
    expect(summary.failed).toBe(0);
    expect(summary.stoppedAtTimeLimit).toBe(false);
  });

  it("stops starting new users at its time limit, and says so", async () => {
    const seen = [];
    const summary = await sweep({
      name: "test",
      cutoffDays: 14,
      timeLimitMs: -1,
      perUser: async (uid) => {
        seen.push({ uid });
      },
    });
    expect(seen).toEqual([]);
    expect(summary).toMatchObject({ users: 0, stoppedAtTimeLimit: true });
  });

  it("counts a worker's failure without stopping the others", async () => {
    const seen = [];
    const summary = await sweep({
      name: "test",
      cutoffDays: 14,
      perUser: async (uid) => {
        if (uid === `${PREFIX}mid`) throw new Error("boom");
        seen.push({ uid });
      },
    });
    expect(ours(seen).map((s) => s.uid)).toEqual([
      `${PREFIX}new`,
      `${PREFIX}old`,
    ]);
    expect(summary.failed).toBeGreaterThanOrEqual(1);
  });
});
