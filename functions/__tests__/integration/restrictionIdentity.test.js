/**
 * Integration: the identity rows a restricted account could still write
 * (survey item 18), through the real triggers and callable against the
 * emulators.
 *
 *   - A public name the word filter refuses, written straight to the
 *     profile past the app's own check, is taken back to none.
 *   - A new Auth account carrying a deleted restricted account's email or
 *     sign-in id is restricted as it is created; Lift forgets the kept
 *     identities with the restriction (S4e, STATUS 2026-10-20).
 *
 * Gated on FIRESTORE_EMULATOR_HOST — skips in an ordinary unit run.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

let db;
let idx;
let priorSecret;
const SECRET = "integration-secret-0123456789abcdef";
const UID = "restriction-identity-new";

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  priorSecret = process.env.BILLING_HMAC_SECRET;
  process.env.BILLING_HMAC_SECRET = SECRET;
  idx = require("../../index");
  db = require("firebase-admin").firestore();
});
afterAll(() => {
  if (priorSecret === undefined) delete process.env.BILLING_HMAC_SECRET;
  else process.env.BILLING_HMAC_SECRET = priorSecret;
});

const { computeBillingHash } = require("../../lib/billingIdentityHash");
const kept = (kind, value) =>
  db.doc(`restrictedIdentities/${computeBillingHash(kind, value, SECRET)}`);

suite("a public name the filter refuses", () => {
  beforeEach(async () => {
    await db.recursiveDelete(db.doc(`users/${UID}`));
  });

  async function rename(name) {
    const ref = db.doc(`users/${UID}/public/profile`);
    const before = await ref.get();
    await ref.set(
      { uid: UID, displayName: name, displayNameLower: name.toLowerCase() },
      { merge: true }
    );
    const after = await ref.get();
    await idx.onPublicProfileWritten.run(
      { before, after },
      { params: { uid: UID, docId: "profile" } }
    );
    return (await ref.get()).data();
  }

  it("is taken back to none, the rest of the profile untouched", async () => {
    await db
      .doc(`users/${UID}/public/profile`)
      .set({ uid: UID, displayName: "Sam", currentStreak: 4 });
    const profile = await rename("shit head");
    expect(profile).toMatchObject({
      displayName: null,
      displayNameLower: null,
      currentStreak: 4,
    });
  });

  it("a clean name stays as written", async () => {
    expect((await rename("Maya Chen")).displayName).toBe("Maya Chen");
  });

  it("an old refused-name delivery preserves a correction already saved to Firestore", async () => {
    const ref = db.doc(`users/${UID}/public/profile`);
    await ref.set({ displayName: "Sam", currentStreak: 4 });
    const before = await ref.get();
    await ref.update({ displayName: "shit head", displayNameLower: "shit head" });
    const after = await ref.get();
    await ref.update({ displayName: "Maya Chen", displayNameLower: "maya chen" });

    await idx.onPublicProfileWritten.run(
      { before, after },
      { params: { uid: UID, docId: "profile" } }
    );

    expect((await ref.get()).data()).toMatchObject({
      displayName: "Maya Chen",
      displayNameLower: "maya chen",
      currentStreak: 4,
    });
  });

  it("an old refused-name delivery never recreates a deleted profile", async () => {
    const ref = db.doc(`users/${UID}/public/profile`);
    const before = await ref.get();
    await ref.set({ displayName: "shit head", displayNameLower: "shit head" });
    const after = await ref.get();
    await ref.delete();

    await idx.onPublicProfileWritten.run(
      { before, after },
      { params: { uid: UID, docId: "profile" } }
    );

    expect((await ref.get()).exists).toBe(false);
  });
});

suite("a restriction carried to a new account", () => {
  const userRecord = {
    uid: UID,
    email: "returning@example.com",
    providerData: [{ providerId: "google.com", uid: "google-sub-9" }],
  };

  beforeEach(async () => {
    await db.doc(`globalRestrictedUids/${UID}`).delete();
    for (const [kind, value] of [
      ["restriction-email", "returning@example.com"],
      ["restriction-google.com", "google-sub-9"],
    ]) {
      await kept(kind, value).delete();
    }
  });

  it("restricts a new account with a kept identity, as it is created", async () => {
    await kept("restriction-google.com", "google-sub-9").set({
      reason: "restricted-account-deleted",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    });
    await idx.onAuthUserCreated.run(userRecord, {});
    const restriction = await db.doc(`globalRestrictedUids/${UID}`).get();
    expect(restriction.exists).toBe(true);
    expect(restriction.data().carriedFromDeletedAccount).toBe(true);
  });

  it("leaves a new account with no kept identity alone", async () => {
    await idx.onAuthUserCreated.run(userRecord, {});
    expect((await db.doc(`globalRestrictedUids/${UID}`).get()).exists).toBe(
      false
    );
  });
});
