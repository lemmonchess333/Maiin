/**
 * Integration tests for server-owned FCM token ownership (packet 19) against
 * the Firestore emulator. Exercises the REAL transactions (claim transfer,
 * legacy cleanup, deletion gate) that the in-memory unit fake can only
 * approximate.
 *
 * Gated on FIRESTORE_EMULATOR_HOST; skips otherwise.
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const own = require("../../lib/pushTokenOwnership");
const crypto = require("crypto");

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

const TOKEN = "emu-fcm-token-abcdefghijklmnop";
const HASH = crypto.createHash("sha256").update(TOKEN).digest("hex");
const BIND_A = "bind-aaaaaaaaaaaaaa1";
const BIND_B = "bind-bbbbbbbbbbbbbb2";

let db;

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: process.env.GCLOUD_PROJECT || "demo-tropos",
    });
  }
  db = admin.firestore();
});

async function reset() {
  await db.recursiveDelete(db.collection("users").doc("A"));
  await db.recursiveDelete(db.collection("users").doc("B"));
  await db
    .collection("fcmTokenClaims")
    .doc(HASH)
    .delete()
    .catch(() => {});
  await db
    .collection("accountDeletionRequests")
    .doc("B")
    .delete()
    .catch(() => {});
}

const claim = (uid, bindingId) =>
  own.claimToken({
    firestore: db,
    uid,
    token: TOKEN,
    platform: "web",
    bindingId,
    serverTimestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

suite("pushTokenOwnership — emulator", () => {
  beforeEach(() => reset());

  it("claim A then B leaves exactly one matching device doc (B's) + a B-owned claim", async () => {
    await claim("A", BIND_A);
    await claim("B", BIND_B);

    const aDev = await db
      .collection("users")
      .doc("A")
      .collection("devices")
      .doc(HASH)
      .get();
    const bDev = await db
      .collection("users")
      .doc("B")
      .collection("devices")
      .doc(HASH)
      .get();
    expect(aDev.exists).toBe(false);
    expect(bDev.exists).toBe(true);
    expect(bDev.data().bindingId).toBe(BIND_B);

    const claimDoc = await db.collection("fcmTokenClaims").doc(HASH).get();
    expect(claimDoc.data()).toMatchObject({
      uid: "B",
      status: "claimed",
      bindingId: BIND_B,
    });

    // Cross-group: exactly one device doc anywhere carries this token.
    const group = await db
      .collectionGroup("devices")
      .where("token", "==", TOKEN)
      .get();
    expect(group.size).toBe(1);
  });

  it("removes a legacy raw-token device doc on the first canonical claim", async () => {
    await db.collection("users").doc("A").collection("devices").doc(TOKEN).set({
      token: TOKEN,
      platform: "web",
    });
    await claim("B", BIND_B);
    const legacy = await db
      .collection("users")
      .doc("A")
      .collection("devices")
      .doc(TOKEN)
      .get();
    expect(legacy.exists).toBe(false);
    const group = await db
      .collectionGroup("devices")
      .where("token", "==", TOKEN)
      .get();
    expect(group.size).toBe(1);
  });

  it("rejects a claim while the account is being deleted; writes nothing", async () => {
    await db
      .collection("accountDeletionRequests")
      .doc("B")
      .set({ status: "running" });
    await expect(claim("B", BIND_B)).rejects.toBeTruthy();
    const bDev = await db
      .collection("users")
      .doc("B")
      .collection("devices")
      .doc(HASH)
      .get();
    expect(bDev.exists).toBe(false);
    const claimDoc = await db.collection("fcmTokenClaims").doc(HASH).get();
    expect(claimDoc.exists).toBe(false);
  });

  it("releaseTokenIfOwned by the owner removes the device + revokes the claim", async () => {
    await claim("A", BIND_A);
    await own.releaseTokenIfOwned({
      firestore: db,
      uid: "A",
      token: TOKEN,
      bindingId: BIND_A,
      serverTimestamp: admin.firestore.FieldValue.serverTimestamp(),
      revocationExpiresAt: admin.firestore.Timestamp.fromMillis(
        Date.now() + 60_000
      ),
    });
    const aDev = await db
      .collection("users")
      .doc("A")
      .collection("devices")
      .doc(HASH)
      .get();
    expect(aDev.exists).toBe(false);
    const claimDoc = await db.collection("fcmTokenClaims").doc(HASH).get();
    expect(claimDoc.data().status).toBe("revoked");
  });
});
