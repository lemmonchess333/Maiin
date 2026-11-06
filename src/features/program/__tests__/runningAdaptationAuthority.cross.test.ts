import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { planRunningAdaptation } from "../runningAdaptationPlanner";
import { matchingAdaptationReceipt, type AdaptationApplyRequest, type AdaptationApplyResponse } from "../runningAdaptationApply";
const require = createRequire(import.meta.url);
type Store = { data: Map<string, unknown>; operations: unknown[] };
const { memoryFirestore } = require("../../../../functions/__tests__/helpers/memoryFirestore.cjs") as { memoryFirestore: (seed: Record<string, unknown>) => Store };
const { acceptRunningProposalTransaction: accept } = require("../../../../functions/lib/runningAuthorityTransaction.js") as {
  acceptRunningProposalTransaction: (input: { firestore: Store; context: { auth: { uid: string } }; data: AdaptationApplyRequest; clock: () => number }) => Promise<AdaptationApplyResponse>;
};
const { createRunningProposalTransaction: createProposal } = require("../../../../functions/lib/runningProposalTransaction.js") as {
  createRunningProposalTransaction: (input: { firestore: Store; context: { auth: { uid: string } }; data: unknown; clock: () => number }) => Promise<{ proposal: { id: string; plan: unknown; preview: unknown }; replayed: boolean }>;
};
const NOW = Date.parse("2026-11-06T12:00:00Z");
const statePath = "users/runner/runningState/current";
function fixture() {
  const review = { accountId: "runner", revision: 8, symptoms: "none" as const,
    capacity: { confirmed: true, afterEffectsReviewed: true, daysPerWeek: 2, longestMinutes: 25 },
    restrictions: { status: "none" as const }, holds: [] as string[], raceGoalId: "race" };
  const current = [
    { id: "one", date: "2026-11-09", templateId: "easy_40", protected: false },
    { id: "two", date: "2026-11-11", templateId: "easy_30", protected: false },
  ];
  const result = planRunningAdaptation({ review, current, windowStart: "2026-11-09",
    selections: [{ sessionId: "one", maxMinutes: 25, format: { kind: "easy" } }] });
  if (result.status !== "evaluated" || result.preview.status !== "preview") throw Error("Fixture planner blocked");
  const outside = [{ id: "old", date: "2026-11-01", kind: "quality", templateId: "tempo_20", minutes: 20, status: "completed_exact" },
    { id: "future", date: "2026-11-23", kind: "quality", templateId: "tempo_20", minutes: 20 }];
  const authority = { schemaVersion: 1, accountId: "runner", revision: 8, timeZone: "UTC", holds: [] as string[],
    constraints: { symptoms: review.symptoms, capacity: review.capacity, restrictions: review.restrictions, reviewConfirmation: { version: 1, confirmed: true, authorityRevision: 8, raceGoalId: "race" } }, history: [{ id: "logged" }], manualCompletions: { old: { completedAt: 1 } },
    plan: { raceGoalId: "race", metadata: "preserved", sessions: [...outside, ...current.map((s, i) => ({ ...s, minutes: i ? 30 : 40, kind: "easy", status: "planned" }))] } };
  // Trusted synthetic server proposal, not evidence that proposal creation exists.
  const proposal = { id: "preview1", accountId: "runner", baseRevision: 8, windowStart: "2026-11-09", expiresAtMs: NOW + 60000,
    validation: { policyVersion: 1, authorityRevision: 8 }, plan: { raceGoalId: "race", sessions: result.proposed } };
  const data: AdaptationApplyRequest = { expectedUid: "runner", accepted: true, proposalId: "preview1", expectedRevision: 8, idempotencyKey: "accept1" };
  const firestore = memoryFirestore({ "users/runner": {}, [statePath]: authority, "users/runner/runningProposals/preview1": proposal });
  return { authority, outside, result, firestore, data, input: { firestore, data, context: { auth: { uid: "runner" } }, clock: () => NOW } };
}
describe("real adaptation planner to acceptance transaction and client receipt", () => {
  it("creates an immutable preview with the real bundled server planner, then accepts it", async () => {
    const f = fixture(); f.firestore.data.delete("users/runner/runningProposals/preview1");
    const creation = { ...f.input, data: { expectedUid: "runner", expectedRevision: 8, requestId: "preview-command-1", windowStart: "2026-11-09",
      selections: [{ sessionId: "one", maxMinutes: 25, format: { kind: "easy" } }] } };
    const created = await createProposal(creation); // No injected domain planner.
    expect(created.proposal.plan).toEqual({ raceGoalId: "race", sessions: f.result.proposed });
    expect(created.proposal.preview).toEqual(f.result.preview);
    expect(f.firestore.data.get(statePath)).toEqual(f.authority);
    expect(f.firestore.operations).toHaveLength(1); // Proposal only, not authority.
    expect(await createProposal(creation)).toEqual({ ...created, replayed: true });
    expect(f.firestore.operations).toHaveLength(1);
    const data = { ...f.data, proposalId: created.proposal.id };
    const response = await accept({ ...f.input, data });
    expect(matchingAdaptationReceipt(data, response)).toBe(true);
    const canonical = f.firestore.data.get(statePath) as typeof f.authority;
    expect(canonical.revision).toBe(9);
    expect(canonical.plan.sessions).toEqual([f.outside[0], ...f.result.proposed, f.outside[1]]);
    expect(canonical.constraints).toEqual(f.authority.constraints);
    expect(canonical.history).toEqual(f.authority.history);
    expect(canonical.manualCompletions).toEqual(f.authority.manualCompletions);
    expect(f.firestore.operations).toHaveLength(3);
    expect(await accept({ ...f.input, data })).toEqual({ ...response, outcome: "replayed" });
    expect(f.firestore.operations).toHaveLength(3);
  });
  it("does not create a proposal without canonical review confirmation", async () => {
    const f = fixture(); const canonical = structuredClone(f.authority);
    canonical.constraints.reviewConfirmation.confirmed = false;
    f.firestore.data.set(statePath, canonical);
    await expect(createProposal({ ...f.input, data: { expectedUid: "runner", expectedRevision: 8, requestId: "preview-command-1", windowStart: "2026-11-09",
      selections: [{ sessionId: "one", maxMinutes: 25, format: { kind: "easy" } }] } })).rejects.toMatchObject({ code: "failed-precondition" });
    expect(f.firestore.operations).toEqual([]); expect(f.firestore.data.get(statePath)).toEqual(canonical);
  });
  it("applies actual catalogue output once and preserves every untouched field", async () => {
    const f = fixture(); const response = await accept(f.input);
    expect(f.result.proposed).toMatchObject([{ templateId: "easy_20", minutes: 20 }]);
    expect(matchingAdaptationReceipt(f.data, response)).toBe(true);
    // Canonical reread, not optimistic client draft paint.
    const saved = f.firestore.data.get(statePath) as typeof f.authority;
    expect(saved).toEqual({ ...f.authority, revision: 9, plan: { ...f.authority.plan, sessions: [f.outside[0], ...f.result.proposed, f.outside[1]] } });
    expect(await accept(f.input)).toEqual({ ...response, outcome: "replayed" });
    expect(f.firestore.operations).toHaveLength(2);
  });
  it.each(["injury", "post_race", "unknown_hold", "revision"])("rejects %s after preview without altering state", async (change) => {
    const f = fixture(); const updated = structuredClone(f.authority);
    if (change === "revision") updated.revision += 1;
    else updated.holds = [change];
    f.firestore.data.set(statePath, updated);
    await expect(accept(f.input)).rejects.toMatchObject({ code: "failed-precondition" });
    expect(f.firestore.operations).toEqual([]); expect(f.firestore.data.get(statePath)).toEqual(updated);
  });
  it("does not accept a report receipt as adaptation acceptance", () => {
    const f = fixture();
    expect(matchingAdaptationReceipt(f.data, { outcome: "applied", receipt: { accountId: "runner", activityId: "outside:1", committedRevision: 9 } } as unknown as AdaptationApplyResponse)).toBe(false);
  });
  it("rejects account switching before writes", async () => {
    const f = fixture();
    await expect(accept({ ...f.input, context: { auth: { uid: "other" } } })).rejects.toMatchObject({ code: "cancelled" });
    expect(f.firestore.operations).toEqual([]);
  });
});
