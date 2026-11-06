/** Real Admin Firestore transactions. Skipped without emulator, never mocked. */
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const {
  NOW,
  runningAuthorityFixture,
} = require("../helpers/runningAuthorityFixture.cjs");
const {
  acceptRunningProposalTransaction: accept,
} = require("../../lib/runningAuthorityTransaction");
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (process.env.REQUIRE_FIRESTORE_EMULATOR === "1" && !host)
  throw new Error(
    "FIRESTORE_EMULATOR_HOST required; transactions did not run."
  );
if (host && !/^(127\.0\.0\.1|localhost):\d+$/.test(host))
  throw new Error("Local emulator required.");
const suite = host ? describe : describe.skip;
suite("running authority real transaction contention", () => {
  let app;
  let db;
  let fixture;
  const uid = "authority-integration";
  const statePath = `users/${uid}/runningState/current`;
  beforeAll(() => {
    app = admin.initializeApp(
      { projectId: "demo-running-authority-transactions" },
      "running-authority-integration"
    );
    db = app.firestore();
  });
  afterAll(async () => {
    await app?.delete();
  });
  beforeEach(async () => {
    await db.recursiveDelete(db.doc(`users/${uid}`));
    await db.doc(`accountDeletionRequests/${uid}`).delete();
    await db.doc(`deletedAccounts/${uid}`).delete();
    fixture = runningAuthorityFixture(uid);
    for (const [path, value] of Object.entries(fixture.seed))
      await db.doc(path).set(value);
  });
  const input = () => ({
    firestore: db,
    context: { auth: { uid } },
    data: fixture.data,
    clock: () => NOW,
  });
  it("parallel duplicate accepts create exactly one receipt and one revision", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => accept(input()))
    );
    expect(results.filter((row) => row.outcome === "applied")).toHaveLength(1);
    expect(results.filter((row) => row.outcome === "replayed")).toHaveLength(7);
    expect((await db.doc(statePath).get()).data().revision).toBe(9);
    expect(
      (await db.collection(`users/${uid}/runningReceipts`).get()).size
    ).toBe(1);
  });
  it("two proposals for one revision cannot both apply", async () => {
    const other = { ...fixture.proposal, id: "preview2" };
    await db.doc(`users/${uid}/runningProposals/preview2`).set(other);
    const results = await Promise.allSettled([
      accept(input()),
      accept({
        ...input(),
        data: {
          ...fixture.data,
          proposalId: "preview2",
          idempotencyKey: "accept2",
        },
      }),
    ]);
    expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((row) => row.status === "rejected")).toHaveLength(1);
    expect((await db.doc(statePath).get()).data().revision).toBe(9);
    expect(
      (await db.collection(`users/${uid}/runningReceipts`).get()).size
    ).toBe(1);
  });
  it("later holds invalidate stale preview; replay never clears a new hold", async () => {
    await accept(input());
    await db.doc(statePath).update({ revision: 10, holds: ["injury"] });
    expect((await accept(input())).outcome).toBe("replayed");
    await expect(
      accept({
        ...input(),
        data: { ...fixture.data, idempotencyKey: "other-key" },
      })
    ).rejects.toMatchObject({ details: { errorCode: "revision-conflict" } });
    expect((await db.doc(statePath).get()).data().holds).toEqual(["injury"]);
  });
  it("deletion prevents receipt replay and missing accounts are not recreated", async () => {
    await accept(input());
    await db.doc(`accountDeletionRequests/${uid}`).set({ status: "running" });
    await expect(accept(input())).rejects.toMatchObject({
      details: { errorCode: "account-deleting" },
    });
    await db.doc(`accountDeletionRequests/${uid}`).delete();
    await db.doc(`users/${uid}`).delete();
    await expect(accept(input())).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect((await db.doc(`users/${uid}`).get()).exists).toBe(false);
  });
  it("concurrent hold updates cannot be overwritten by acceptance", async () => {
    const results = await Promise.allSettled([
      accept(input()),
      db.runTransaction(async (tx) => {
        const ref = db.doc(statePath);
        const snapshot = await tx.get(ref);
        tx.update(ref, {
          revision: snapshot.data().revision + 1,
          holds: ["injury"],
        });
      }),
    ]);
    expect(results[1].status).toBe("fulfilled");
    const final = (await db.doc(statePath).get()).data();
    expect(final.holds).toEqual(["injury"]);
    expect(final.revision).toBe(results[0].status === "fulfilled" ? 10 : 9);
  });
  it("concurrent deletion does not let acceptance resurrect authority", async () => {
    const results = await Promise.allSettled([
      accept(input()),
      db.runTransaction(async (tx) => {
        const stateRef = db.doc(statePath);
        await tx.get(stateRef);
        tx.set(db.doc(`accountDeletionRequests/${uid}`), { status: "running" });
        tx.delete(stateRef);
        tx.delete(db.doc(`users/${uid}`));
      }),
    ]);
    expect(results[1].status).toBe("fulfilled");
    expect((await db.doc(statePath).get()).exists).toBe(false);
    expect((await db.doc(`users/${uid}`).get()).exists).toBe(false);
  });
});
