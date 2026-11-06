import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { makeRunningHandler } = require("../lib/runningCallables");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const context = { auth: { uid: "runner" }, app: { appId: "test-app" } };
const request = { expectedUid: "runner", supportedSchemaVersions: [1] };
describe("real running callable gates", () => {
  it.each(["authorizeRunningLaunch", "registerRunningStart", "reconcileRunningActivity"])("%s is source-disabled before database access", async action => {
    const dependencies = { firestore: vi.fn(), isRateLimited: vi.fn() };
    await expect(makeRunningHandler(action, dependencies)({ expectedUid: "runner" }, context)).rejects.toMatchObject({ code: "unavailable" });
    expect(dependencies.firestore).not.toHaveBeenCalled(); expect(dependencies.isRateLimited).not.toHaveBeenCalled();
  });
  it("routes actual launch, immutable registration and saved-activity linkage through guarded wrappers", async () => {
    const now = Date.parse("2026-11-06T12:00:00Z"), clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      const firestore = memoryFirestore({ "users/runner": {}, "system/runningAuthority": { protocolVersion: 1, enrollmentEnabled: true, transportEnabled: true, launchEnabled: true, startRegistrationEnabled: true, completionEnabled: true },
        "users/runner/runningState/current": { schemaVersion: 1, accountId: "runner", revision: 1, timeZone: "UTC", holds: [], migration: { version: 1, status: "complete" },
          plan: { raceGoalId: null, sessions: [{ id: "one", date: "2026-11-06", templateId: "run_walk_1", minutes: 29, kind: "run_walk" }] },
          constraints: { symptoms: "none", capacity: { confirmed: true, afterEffectsReviewed: true, daysPerWeek: 2, longestMinutes: 30 }, restrictions: { status: "none" },
            reviewConfirmation: { version: 1, confirmed: true, authorityRevision: 1, raceGoalId: null } } } });
      const limit = vi.fn(async () => false), deps = { firestore: () => firestore, isRateLimited: limit };
      const input = { expectedUid: "runner", expectedRevision: 1, sessionId: "one" };
      expect((await makeRunningHandler("authorizeRunningLaunch", deps, true)(input, context)).session.id).toBe("one");
      const proof = await makeRunningHandler("registerRunningStart", deps, true)({ ...input, activityId: "activity1" }, context);
      firestore.data.set("users/runner/runs/activity1", { type: "run", isInvalid: false, savedAnyway: false, legacyPlanClaimExcluded: true,
        runConfig: { canonicalLaunch: proof, legacyPlanClaimExcluded: true }, date: "2026-11-06", duration: 120, distance: 100,
        recordingStartedAt: new Date(now + 1000), recordingEndedAt: new Date(now + 121000) });
      clock.mockReturnValue(now + 122000);
      const result = await makeRunningHandler("reconcileRunningActivity", deps, true)({ expectedUid: "runner", expectedRevision: 1, activityId: "activity1" }, context);
      expect(result).toMatchObject({ outcome: "linked", receipt: { classification: "user_reported_activity", progressionEligible: false } });
      expect(limit.mock.calls.map(call => call[1])).toEqual(["authorizeRunningLaunch", "registerRunningStart", "reconcileRunningActivity"]);
    } finally { clock.mockRestore(); }
  });
  it("defaults off before all database and limiter access", async () => {
    const dependencies = { firestore: vi.fn(), isRateLimited: vi.fn() };
    await expect(makeRunningHandler("negotiateRunningAuthority", dependencies)(request, context)).rejects.toMatchObject({ code: "unavailable" });
    expect(dependencies.firestore).not.toHaveBeenCalled(); expect(dependencies.isRateLimited).not.toHaveBeenCalled();
  });
  it.each([[{}, "unauthenticated"], [{ auth: { uid: "runner" } }, "failed-precondition"], [{ auth: { uid: "other" }, app: { appId: "test" } }, "cancelled"]])("validates account and App Check before access", async (ctx, code) => {
    const dependencies = { firestore: vi.fn(), isRateLimited: vi.fn() };
    await expect(makeRunningHandler("saveRunningReview", dependencies, true)({ expectedUid: "runner" }, ctx)).rejects.toMatchObject({ code }); expect(dependencies.firestore).not.toHaveBeenCalled();
  });
  it("requires independent rollout capabilities", async () => {
    const firestore = memoryFirestore({ "system/runningAuthority": { protocolVersion: 1, enrollmentEnabled: true } });
    const limit = vi.fn();
    await expect(makeRunningHandler("negotiateRunningAuthority", { firestore: () => firestore, isRateLimited: limit }, true)(request, context)).rejects.toMatchObject({ code: "unavailable" }); expect(limit).not.toHaveBeenCalled();
  });
  it("applies limits before invoking the transaction", async () => {
    const firestore = memoryFirestore({ "system/runningAuthority": { protocolVersion: 1, enrollmentEnabled: true, transportEnabled: true } });
    const limit = vi.fn(async () => true);
    await expect(makeRunningHandler("negotiateRunningAuthority", { firestore: () => firestore, isRateLimited: limit }, true)(request, context)).rejects.toMatchObject({ code: "resource-exhausted" }); expect(firestore.operations).toEqual([]);
  });
  it("blocks deleting accounts before spending a rate-limit receipt", async () => {
    const firestore = memoryFirestore({ "system/runningAuthority": { protocolVersion: 1, enrollmentEnabled: true, transportEnabled: true }, "accountDeletionRequests/runner": { status: "running" } });
    const limit = vi.fn();
    await expect(makeRunningHandler("saveRunningReview", { firestore: () => firestore, isRateLimited: limit }, true)({ expectedUid: "runner" }, context)).rejects.toMatchObject({ details: { errorCode: "account-deleting" } }); expect(limit).not.toHaveBeenCalled();
  });
  it("rechecks capability inside the domain transaction after a successful preflight", async () => {
    const firestore = memoryFirestore({ "users/runner": {}, "system/runningAuthority": { protocolVersion: 1, enrollmentEnabled: true, transportEnabled: true } });
    const original = firestore.runTransaction;
    firestore.runTransaction = update => {
      firestore.data.set("system/runningAuthority", { protocolVersion: 1, enrollmentEnabled: true, transportEnabled: false });
      return original(update);
    };
    const handler = makeRunningHandler("saveRunningReview", { firestore: () => firestore, isRateLimited: async () => false }, true);
    await expect(handler({ expectedUid: "runner", expectedRevision: 0, requestId: "review1", raceGoalId: null, confirmed: true,
      review: { symptoms: "none", capacity: { confirmed: true, afterEffectsReviewed: true, daysPerWeek: 2, longestMinutes: 30 }, restrictions: { status: "none" } } }, context)).rejects.toMatchObject({ code: "unavailable" });
    expect(firestore.operations).toEqual([]);
  });
  it("routes enabled authenticated negotiation through the actual server implementation", async () => {
    const firestore = memoryFirestore({ "users/runner": {}, "system/runningAuthority": { protocolVersion: 1, enrollmentEnabled: true, transportEnabled: true } });
    const handler = makeRunningHandler("negotiateRunningAuthority", { firestore: () => firestore, isRateLimited: async () => false }, true);
    expect(await handler(request, context)).toMatchObject({ accountId: "runner", status: "not_enrolled" }); expect(firestore.operations).toEqual([]);
  });
});
