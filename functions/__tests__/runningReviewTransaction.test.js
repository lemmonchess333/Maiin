import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { saveRunningReviewTransaction: save } = require("../lib/runningReviewTransaction");
const { createRunningProposalTransaction: preview } = require("../lib/runningProposalTransaction");
const { acceptRunningProposalTransaction: accept } = require("../lib/runningAuthorityTransaction");
const NOW = Date.parse("2026-11-06T12:00:00Z");
const PATH = "users/runner/runningState/current";
function fixture() {
  const authority = { schemaVersion: 1, accountId: "runner", revision: 8, timeZone: "UTC", constraints: {}, holds: [],
    history: [{ id: "history" }], manualCompletions: {},
    plan: { raceGoalId: "race", sessions: [{ id: "one", date: "2026-11-09", templateId: "easy_40", minutes: 40, kind: "easy", status: "planned" }] } };
  const firestore = memoryFirestore({ "users/runner": {}, [PATH]: authority });
  const data = { expectedUid: "runner", expectedRevision: 8, requestId: "review1", raceGoalId: "race", confirmed: true,
    review: { symptoms: "none", capacity: { confirmed: true, afterEffectsReviewed: true, daysPerWeek: 2, longestMinutes: 25 }, restrictions: { status: "none" } } };
  return { authority, firestore, input: { firestore, context: { auth: { uid: "runner" } }, data, clock: () => NOW } };
}
describe("canonical running review transaction", () => {
  it("saves explicit review without changing goal, plan or history; private receipt omits answers", async () => {
    const f = fixture(); const response = await save(f.input);
    const current = f.firestore.data.get(PATH);
    expect(current).toEqual({ ...f.authority, revision: 9, reviewUpdatedAtMs: NOW, constraints: { ...f.input.data.review,
      reviewConfirmation: { version: 1, confirmed: true, authorityRevision: 9, raceGoalId: "race" } } });
    expect(response.receipt).not.toHaveProperty("review"); expect(response.receipt).not.toHaveProperty("symptoms");
    expect(response.receipt).toMatchObject({ baseRevision: 8, appliedRevision: 9 });
    expect(await save(f.input)).toEqual({ ...response, outcome: "replayed" }); expect(f.firestore.operations).toHaveLength(2);
  });
  it("feeds the actual default server planner and acceptance, without fabricated confirmation", async () => {
    const f = fixture(); await save(f.input);
    const p = await preview({ ...f.input, data: { expectedUid: "runner", expectedRevision: 9, requestId: "preview1", windowStart: "2026-11-09",
      selections: [{ sessionId: "one", maxMinutes: 25, format: { kind: "easy" } }] } });
    expect(p.proposal.plan.sessions).toMatchObject([{ templateId: "easy_20", minutes: 20 }]);
    await accept({ ...f.input, data: { expectedUid: "runner", expectedRevision: 9, proposalId: p.proposal.id, idempotencyKey: "accept1", accepted: true } });
    expect(f.firestore.data.get(PATH).revision).toBe(10);
    expect(f.firestore.data.get(PATH).plan.sessions).toEqual(p.proposal.plan.sessions);
  });
  it.each(["injury", "post_race", "enrollment_review_required", "unknown_hold"])("never clears %s", async hold => {
    const f = fixture(); f.authority.holds = [hold]; await save(f.input);
    expect(f.firestore.data.get(PATH).holds).toEqual([hold]);
  });
  it.each(["unknown", "daily_activities", "concerning", "during_or_after"])("adds and retains review hold for unsupported %s symptoms", async symptoms => {
    const f = fixture(); f.input.data.review.symptoms = symptoms; await save(f.input);
    expect(f.firestore.data.get(PATH).holds).toEqual(["running_review_required"]);
    await save({ ...f.input, data: { ...f.input.data, expectedRevision: 9, requestId: "review2", review: { ...f.input.data.review, symptoms: "none" } } });
    expect(f.firestore.data.get(PATH).holds).toEqual(["running_review_required"]);
  });
  it("stores uncertainty without inventing capacity", async () => {
    const f = fixture(); f.input.data.review.capacity = { confirmed: false, afterEffectsReviewed: false, daysPerWeek: null, longestMinutes: null };
    await save(f.input); expect(f.firestore.data.get(PATH).holds).toEqual(["running_review_required"]);
    expect(f.firestore.data.get(PATH).constraints.capacity.longestMinutes).toBeNull();
  });
  it("allows supported clinician guidance without calling it clearance", async () => {
    const f = fixture(); f.input.data.review.symptoms = "during_or_after";
    f.input.data.review.restrictions = { status: "specified", source: "clinician", noRunning: false, maxMinutes: 20 };
    await save(f.input); expect(f.firestore.data.get(PATH).holds).toEqual([]);
    expect(f.firestore.data.get(PATH).constraints).not.toHaveProperty("cleared");
  });
  it.each([{}, { expectedUid: "other" }, { confirmed: false }, { validation: {} }, { review: { symptoms: "none", diagnosis: "ignored?" } }])("rejects invalid auth/consent/extra payload before reads", async patch => {
    const f = fixture(); const firestore = { doc: vi.fn() };
    await expect(save({ ...f.input, firestore, data: Object.keys(patch).length ? { ...f.input.data, ...patch } : {} })).rejects.toBeDefined();
    expect(firestore.doc).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated calls before reads", async () => {
    const f = fixture(); await expect(save({ ...f.input, context: {} })).rejects.toMatchObject({ code: "unauthenticated" }); expect(f.firestore.operations).toEqual([]);
  });
  it.each(["revision", "goal", "unknown_constraints", "missing_account", "missing_authority", "deleting", "deleted", "exhausted"])("fails closed for %s", async problem => {
    const f = fixture();
    if (problem === "revision") f.authority.revision = 9;
    if (problem === "goal") f.authority.plan.raceGoalId = "other";
    if (problem === "unknown_constraints") f.authority.constraints = { noHills: true };
    if (problem === "missing_account") f.firestore.data.delete("users/runner");
    if (problem === "missing_authority") f.firestore.data.delete(PATH);
    if (problem === "deleting") f.firestore.data.set("accountDeletionRequests/runner", { status: "running" });
    if (problem === "deleted") f.firestore.data.set("deletedAccounts/runner", { expiresAt: "malformed" });
    if (problem === "exhausted") { f.authority.revision = Number.MAX_SAFE_INTEGER; f.input.data.expectedRevision = Number.MAX_SAFE_INTEGER; }
    await expect(save(f.input)).rejects.toBeDefined(); expect(f.firestore.operations).toEqual([]);
  });
  it("deletion checks precede replay", async () => {
    const f = fixture(); await save(f.input); f.firestore.data.set("accountDeletionRequests/runner", { status: "running" });
    await expect(save(f.input)).rejects.toMatchObject({ details: { errorCode: "account-deleting" } }); expect(f.firestore.operations).toHaveLength(2);
  });
  it("rejects a changed payload under the same request id", async () => {
    const f = fixture(); await save(f.input); f.input.data.review.capacity.longestMinutes = 20;
    await expect(save(f.input)).rejects.toMatchObject({ details: { errorCode: "review-request-conflict" } }); expect(f.firestore.operations).toHaveLength(2);
  });
  it("does not partially save when receipt creation fails", async () => {
    const f = fixture(); f.firestore.failures.set("create:users/runner/runningReviewReceipts/review1", new Error("injected"));
    await expect(save(f.input)).rejects.toThrow("injected"); expect(f.firestore.data.get(PATH)).toEqual(f.authority); expect(f.firestore.operations).toEqual([]);
  });
  it("does not erase an unrecognized existing restriction", async () => {
    const f = fixture(); f.authority.constraints = { ...f.input.data.review, restrictions: { status: "none", maxHillGrade: 5 } };
    await expect(save(f.input)).rejects.toMatchObject({ details: { errorCode: "invalid-authority" } }); expect(f.firestore.operations).toEqual([]);
  });
  it("preserves a prior no-running warning as a hold when answers change", async () => {
    const f = fixture(); f.authority.constraints = { ...f.input.data.review, restrictions: { status: "specified", source: "clinician", noRunning: true } };
    await save(f.input); expect(f.firestore.data.get(PATH).holds).toEqual(["running_review_required"]);
  });
  it("snapshots request primitives before transactional awaits", async () => {
    const f = fixture(); const promise = save(f.input); f.input.data.review.symptoms = "concerning"; await promise;
    expect(f.firestore.data.get(PATH).constraints.symptoms).toBe("none");
  });
});
