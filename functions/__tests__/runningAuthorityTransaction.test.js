// Deterministic adapter checks. The memory store does NOT prove contention.
import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const {
  NOW,
  runningAuthorityFixture,
} = require("./helpers/runningAuthorityFixture.cjs");
const {
  acceptRunningProposalTransaction: accept,
} = require("../lib/runningAuthorityTransaction");
function setup() {
  const fixture = runningAuthorityFixture();
  const firestore = memoryFirestore(fixture.seed);
  return {
    fixture,
    firestore,
    input: {
      firestore,
      context: { auth: { uid: "runner" } },
      data: fixture.data,
      clock: () => NOW,
    },
  };
}
describe("dormant authenticated running acceptance adapter", () => {
  it("writes authority and receipt, then replays without another write", async () => {
    const { firestore, input } = setup();
    const first = await accept(input);
    expect(first).toMatchObject({
      outcome: "applied",
      receipt: { appliedRevision: 9 },
    });
    expect(firestore.operations).toEqual([
      ["set", "users/runner/runningState/current"],
      ["create", "users/runner/runningReceipts/accept1"],
    ]);
    expect(await accept(input)).toEqual({ ...first, outcome: "replayed" });
    expect(firestore.operations).toHaveLength(2);
    expect(
      firestore.data.get("users/runner/runningState/current").history
    ).toEqual([{ id: "historical" }]);
  });
  it.each([
    [{}, {}, "unauthenticated"],
    [{ auth: { uid: "runner" } }, {}, "cancelled"],
    [{ auth: { uid: "other" } }, { expectedUid: "runner" }, "cancelled"],
    [{ auth: { uid: "runner" } }, { uid: "other" }, "invalid-argument"],
    [
      { auth: { uid: "runner" } },
      { idempotencyKey: "bad/path" },
      "invalid-argument",
    ],
    [{ auth: { uid: "runner" } }, { accepted: false }, "invalid-argument"],
  ])(
    "rejects auth/payload problems before Firestore access",
    async (context, patch, code) => {
      const { input } = setup();
      const collection = vi.fn();
      const data = Object.keys(patch).length ? { ...input.data, ...patch } : {};
      await expect(
        accept({ ...input, firestore: { collection }, context, data })
      ).rejects.toMatchObject({ code });
      expect(collection).not.toHaveBeenCalled();
    }
  );
  it.each(["users/runner", "users/runner/runningState/current"])(
    "does not recreate missing %s",
    async (path) => {
      const { firestore, input } = setup();
      firestore.data.delete(path);
      await expect(accept(input)).rejects.toMatchObject({
        code: "failed-precondition",
      });
      expect(firestore.operations).toEqual([]);
    }
  );
  it.each([false, true])(
    "checks deletion before application or replay=%s",
    async (replay) => {
      const { firestore, input } = setup();
      if (replay) await accept(input);
      const prior = firestore.operations.length;
      firestore.data.set("accountDeletionRequests/runner", {
        status: "running",
      });
      await expect(accept(input)).rejects.toMatchObject({
        details: { errorCode: "account-deleting" },
      });
      expect(firestore.operations).toHaveLength(prior);
    }
  );
  it("blocks live/malformed tombstones", async () => {
    const { firestore, input } = setup();
    firestore.data.set("deletedAccounts/runner", { expiresAt: "not-a-date" });
    await expect(accept(input)).rejects.toMatchObject({
      details: { errorCode: "account-deleted" },
    });
    expect(firestore.operations).toEqual([]);
  });
  it("fails both writes if receipt creation fails", async () => {
    const { firestore, input } = setup();
    firestore.failures.set(
      "create:users/runner/runningReceipts/accept1",
      new Error("injected")
    );
    await expect(accept(input)).rejects.toThrow("injected");
    expect(
      firestore.data.get("users/runner/runningState/current").revision
    ).toBe(8);
    expect(firestore.operations).toEqual([]);
  });
  it("maps stale/expired domain decisions without changing state", async () => {
    const { firestore, input } = setup();
    await expect(
      accept({ ...input, clock: () => NOW + 60000 })
    ).rejects.toMatchObject({
      code: "failed-precondition",
      details: { errorCode: "proposal-expired" },
    });
    expect(firestore.operations).toEqual([]);
  });
  it("checks fresh server time after transaction reads", async () => {
    const { firestore, input } = setup();
    let now = NOW;
    const original = firestore.runTransaction;
    firestore.runTransaction = (callback) =>
      original((tx) => {
        const get = tx.get;
        tx.get = async (ref) => {
          const snap = await get(ref);
          now = NOW + 60000;
          return snap;
        };
        return callback(tx);
      });
    await expect(accept({ ...input, clock: () => now })).rejects.toMatchObject({
      details: { errorCode: "proposal-expired" },
    });
    expect(firestore.operations).toEqual([]);
  });
});
