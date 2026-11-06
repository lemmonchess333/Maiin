// Adapter control-flow tests only. The injected domain stub is NOT catalogue or
// clinical proof; cross-layer tests use the generated shared planner separately.
import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const {
  NOW,
  runningAuthorityFixture,
} = require("./helpers/runningAuthorityFixture.cjs");
const {
  createRunningProposalTransaction: create,
} = require("../lib/runningProposalTransaction");
function setup() {
  const fixture = runningAuthorityFixture();
  const firestore = memoryFirestore(fixture.seed);
  const domainPlanner = vi.fn(({ authority }) => ({
    plan: fixture.proposal.plan,
    preview: {
      status: "preview",
      accountId: authority.accountId,
      revision: authority.revision,
      raceGoalId: authority.plan.raceGoalId,
      after: fixture.proposal.plan.sessions,
    },
  }));
  return {
    fixture,
    firestore,
    domainPlanner,
    input: {
      firestore,
      context: { auth: { uid: "runner" } },
      data: {
        expectedUid: "runner",
        expectedRevision: 8,
        requestId: "preview-request",
        windowStart: "2026-11-09",
        selections: [
          { sessionId: "run1", maxMinutes: 15, format: { kind: "easy" } },
        ],
      },
      clock: () => NOW,
      domainPlanner,
    },
  };
}
describe("dormant immutable proposal creator", () => {
  it("creates only a proposal from canonical inputs and exactly replays without regenerating", async () => {
    const { firestore, fixture, input, domainPlanner } = setup();
    const first = await create(input);
    expect(first).toMatchObject({
      replayed: false,
      proposal: {
        accountId: "runner",
        baseRevision: 8,
        expiresAtMs: NOW + 300000,
        validation: { policyVersion: 1, authorityRevision: 8 },
      },
    });
    expect(firestore.operations).toEqual([
      ["create", `users/runner/runningProposals/${first.proposal.id}`],
    ]);
    expect(firestore.data.get("users/runner/runningState/current")).toEqual(
      fixture.authority
    );
    expect(domainPlanner).toHaveBeenCalledWith({
      authority: fixture.authority,
      windowStart: input.data.windowStart,
      selections: input.data.selections,
      nowMs: NOW,
    });
    expect(await create(input)).toEqual({
      proposal: first.proposal,
      replayed: true,
    });
    expect(domainPlanner).toHaveBeenCalledTimes(1);
    expect(firestore.operations).toHaveLength(1);
  });
  it.each(["constraints", "authority", "plan", "validation", "preview"])(
    "rejects client %s injection before DB",
    async (key) => {
      const { input } = setup();
      const doc = vi.fn();
      const collection = vi.fn();
      await expect(
        create({
          ...input,
          firestore: { doc, collection },
          data: { ...input.data, [key]: {} },
        })
      ).rejects.toMatchObject({ code: "invalid-argument" });
      expect(doc).not.toHaveBeenCalled();
      expect(collection).not.toHaveBeenCalled();
    }
  );
  it("requires authenticated matching account before storage", async () => {
    const { input } = setup();
    const doc = vi.fn();
    await expect(
      create({ ...input, firestore: { doc }, context: {} })
    ).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(
      create({
        ...input,
        firestore: { doc },
        context: { auth: { uid: "other" } },
      })
    ).rejects.toMatchObject({ code: "cancelled" });
    expect(doc).not.toHaveBeenCalled();
  });
  it("does not reuse a request ID for edited selections", async () => {
    const { input, firestore } = setup();
    await create(input);
    input.data.selections[0].maxMinutes = 10;
    await expect(create(input)).rejects.toMatchObject({
      details: { errorCode: "preview-request-conflict" },
    });
    expect(firestore.operations).toHaveLength(1);
  });
  it("does not renew an expired immutable preview", async () => {
    const { input, firestore } = setup();
    await create(input);
    await expect(
      create({ ...input, clock: () => NOW + 300000 })
    ).rejects.toMatchObject({ details: { errorCode: "proposal-expired" } });
    expect(firestore.operations).toHaveLength(1);
  });
  it.each([false, true])(
    "deletion blocks create and replay=%s",
    async (replay) => {
      const { input, firestore } = setup();
      if (replay) await create(input);
      const count = firestore.operations.length;
      firestore.data.set("accountDeletionRequests/runner", {
        status: "running",
      });
      await expect(create(input)).rejects.toMatchObject({
        details: { errorCode: "account-deleting" },
      });
      expect(firestore.operations).toHaveLength(count);
    }
  );
  it.each([
    "hold",
    "revision",
    "missing-profile",
    "missing-authority",
    "tombstone",
  ])("fails closed for %s", async (reason) => {
    const { input, firestore } = setup();
    const state = firestore.data.get("users/runner/runningState/current");
    if (reason === "hold") state.holds = ["injury"];
    if (reason === "revision") state.revision++;
    if (reason === "missing-profile") firestore.data.delete("users/runner");
    if (reason === "missing-authority")
      firestore.data.delete("users/runner/runningState/current");
    if (reason === "tombstone")
      firestore.data.set("deletedAccounts/runner", {});
    await expect(create(input)).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(firestore.operations).toEqual([]);
  });
  it("does not produce a validation marker if the domain fails", async () => {
    const { input, firestore } = setup();
    await expect(
      create({
        ...input,
        domainPlanner: () => {
          throw new Error("missing canonical review");
        },
      })
    ).rejects.toMatchObject({
      details: { errorCode: "domain-preview-unavailable" },
    });
    expect(firestore.operations).toEqual([]);
  });
  it("rejects a domain result for another account", async () => {
    const { input, firestore, domainPlanner } = setup();
    const result = domainPlanner({
      authority: runningAuthorityFixture().authority,
    });
    result.preview.accountId = "other";
    await expect(
      create({ ...input, domainPlanner: () => result })
    ).rejects.toMatchObject({
      details: { errorCode: "domain-preview-unavailable" },
    });
    expect(firestore.operations).toEqual([]);
  });
  it("rechecks time after domain generation before creating", async () => {
    const { input, firestore } = setup();
    const clock = vi
      .fn()
      .mockReturnValueOnce(NOW)
      .mockReturnValue(NOW + 300000);
    await expect(create({ ...input, clock })).rejects.toMatchObject({
      details: { errorCode: "proposal-expired" },
    });
    expect(firestore.operations).toEqual([]);
  });
  it("rejects a preview whose shown sessions differ from the persisted plan", async () => {
    const { input, firestore, domainPlanner, fixture } = setup();
    const result = structuredClone(
      domainPlanner({ authority: fixture.authority })
    );
    result.preview.after = result.preview.after.map((row) => ({
      ...row,
      minutes: 5,
    }));
    await expect(
      create({ ...input, domainPlanner: () => result })
    ).rejects.toMatchObject({
      details: { errorCode: "domain-preview-unavailable" },
    });
    expect(firestore.operations).toEqual([]);
  });
  it("rejects a corrupt stored preview binding on replay", async () => {
    const { input, firestore } = setup();
    const first = await create(input);
    firestore.data.get(
      `users/runner/runningProposals/${first.proposal.id}`
    ).preview.accountId = "other";
    await expect(create(input)).rejects.toMatchObject({
      details: { errorCode: "domain-preview-unavailable" },
    });
    expect(firestore.operations).toHaveLength(1);
  });
});
