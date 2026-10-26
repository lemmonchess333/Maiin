/**
 * Integration: starting a partner streak through the real
 * startPartnerStreak callable, against the emulator.
 *
 * Driven here, not only in memory, because the parts worth holding meet
 * only in Firestore: the members array-contains counts read inside the
 * transaction that creates the bond, the server timestamp on it, the
 * callable's own gates (a restricted account, the refusal's reason in
 * its details), and two starts racing for the last place one person has.
 *
 * Gated on FIRESTORE_EMULATOR_HOST — skips in an ordinary unit run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

let db;
let startPartnerStreak;
let MAX_PARTNERS;

const ME = "pstart-me";
const BOB = "pstart-bob";
const CAL = "pstart-cal";
const PEOPLE = [ME, BOB, CAL];
const as = (uid) => ({ auth: { uid, token: { email_verified: true } } });

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  ({ startPartnerStreak } = require("../../index"));
  ({ MAX_PARTNERS } = require("../../lib/partnerBonds"));
  db = require("firebase-admin").firestore();
});

async function follow(a, b) {
  await db.doc(`following/${a}/users/${b}`).set({ createdAt: new Date() });
  await db.doc(`following/${b}/users/${a}`).set({ createdAt: new Date() });
}

/** `count` bonds for `uid` with partners nobody else here uses. */
async function seedBonds(uid, count) {
  for (let i = 0; i < count; i++) {
    const members = [uid, `${uid}-p${i}`].sort();
    await db.doc(`partnerBonds/${members.join("__")}`).set({
      members,
      streak: 0,
      lastSharedDay: null,
      lastActive: {},
      freezeWeek: {},
      createdAt: new Date(),
    });
  }
}

async function wipe() {
  for (const uid of PEOPLE) {
    const bonds = await db
      .collection("partnerBonds")
      .where("members", "array-contains", uid)
      .get();
    await Promise.all(bonds.docs.map((d) => d.ref.delete()));
    await db.recursiveDelete(db.doc(`following/${uid}`));
    await db.doc(`rateLimits/${uid}_partnerStreakStart`).delete();
    await db.doc(`globalRestrictedUids/${uid}`).delete();
  }
}

const bondOf = async (a, b) =>
  (await db.doc(`partnerBonds/${[a, b].sort().join("__")}`).get()).data();

suite("starting a partner streak", () => {
  // A first write to a cold emulator can take longer than the default.
  beforeEach(async () => {
    await wipe();
    await follow(ME, BOB);
    await follow(ME, CAL);
  }, 30_000);

  it("makes a cold bond, stamped by the server", async () => {
    const result = await startPartnerStreak.run({ partnerUid: BOB }, as(ME));
    expect(result).toEqual({
      bondId: [ME, BOB].sort().join("__"),
      created: true,
    });
    const bond = await bondOf(ME, BOB);
    expect(bond).toMatchObject({
      members: [ME, BOB].sort(),
      streak: 0,
      lastSharedDay: null,
      lastActive: {},
      freezeWeek: {},
    });
    expect(typeof bond.createdAt.toMillis).toBe("function");
    // Asked again, from either side, it is the same bond.
    await expect(
      startPartnerStreak.run({ partnerUid: ME }, as(BOB))
    ).resolves.toMatchObject({ created: false });
  });

  it("refuses past the partner's limit, with the reason in its details", async () => {
    await seedBonds(BOB, MAX_PARTNERS);
    const err = await startPartnerStreak
      .run({ partnerUid: BOB }, as(ME))
      .catch((e) => e);
    expect(err.code).toBe("failed-precondition");
    expect(err.details).toEqual({ reason: "partner-limit-theirs" });
    expect(await bondOf(ME, BOB)).toBeUndefined();
  });

  it("refuses a restricted account before anything is read", async () => {
    await db.doc(`globalRestrictedUids/${ME}`).set({ at: Date.now() });
    const err = await startPartnerStreak
      .run({ partnerUid: BOB }, as(ME))
      .catch((e) => e);
    expect(err.code).toBe("permission-denied");
    expect(err.details).toEqual({ reason: "account-restricted" });
    expect(await bondOf(ME, BOB)).toBeUndefined();
  });

  it("two starts racing for one person's last place: one bond, not two", async () => {
    // Me with one place left, and two friends asking for it at once.
    await seedBonds(ME, MAX_PARTNERS - 1);
    const results = await Promise.allSettled([
      startPartnerStreak.run({ partnerUid: BOB }, as(ME)),
      startPartnerStreak.run({ partnerUid: ME }, as(CAL)),
    ]);
    const made = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter((r) => r.status === "rejected");
    expect(made).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(refused[0].reason.details?.reason).toMatch(/^partner-limit-/);
    const mine = await db
      .collection("partnerBonds")
      .where("members", "array-contains", ME)
      .get();
    expect(mine.size).toBe(MAX_PARTNERS);
  });
});
