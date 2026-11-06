import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { adoptInitialRunningPlanTransaction: adopt } = require("../lib/runningInitialPlanTransaction");
const path = "users/runner/runningState/current";
const receiptPath = "users/runner/runningState/initialPlanReceipt";
const NOW = Date.parse("2026-11-06T12:00:00Z");
function fixture() {
  const current = { schemaVersion: 1, accountId: "runner", revision: 3, timeZone: "UTC", plan: { raceGoalId: null, sessions: [] }, holds: [],
    history: [{ id: "manual_completed" }], savedRaceGoal: null, migration: { version: 1, status: "complete", retained: true },
    constraints: { symptoms: "none", capacity: { confirmed: true, afterEffectsReviewed: true, daysPerWeek: 3, longestMinutes: 29 }, restrictions: { status: "none" },
      reviewConfirmation: { version: 1, confirmed: true, authorityRevision: 3, raceGoalId: null } } };
  const firestore = memoryFirestore({ "users/runner": {}, [path]: current, "system/runningAuthority": { protocolVersion: 1, initialPlanEnabled: true } });
  return { firestore, context: { auth: { uid: "runner" } }, clock: () => NOW,
    data: { expectedUid: "runner", expectedRevision: 3, requestId: "adoption1", raceGoalId: null, confirmed: true, confirmationVersion: "initial-run-walk-v1", dates: ["2026-11-07", "2026-11-09", "2026-11-11"] } };
}
describe("inactive initial running adoption", () => {
  it("generates only confirmed first-week sessions and preserves every other field", async () => {
    const f = fixture(); const before = structuredClone(f.firestore.data.get(path)); const result = await adopt(f);
    expect(result.receipt.acceptedRunWalkStage).toEqual({ version: 1, stage: 1, adoptionRequestId: "adoption1", adoptedAtRevision: 4, raceGoalId: null, sessionIds: ["initial_20261107", "initial_20261109", "initial_20261111"] });
    expect(result.outcome).toBe("adopted"); expect(result.receipt.sessions).toHaveLength(3);
    expect(result.receipt.sessions[0]).toEqual({ id: "initial_20261107", date: "2026-11-07", templateId: "run_walk_1", minutes: 29, kind: "run_walk" });
    expect(f.firestore.data.get(path)).toEqual({ ...before, revision: 4, acceptedRunWalkStage: result.receipt.acceptedRunWalkStage, plan: { ...before.plan, sessions: result.receipt.sessions } });
    expect(f.firestore.data.get(path).constraints.reviewConfirmation.authorityRevision).toBe(3);
    expect(await adopt(f)).toEqual({ ...result, outcome: "replayed" });
  });
  it.each(["injury", "post_race", "unknown_hold"])("never clears %s", async hold => {
    const f = fixture(); f.firestore.data.get(path).holds.push(hold); const before = structuredClone(f.firestore.data.get(path));
    await expect(adopt(f)).rejects.toMatchObject({ details: { errorCode: "active-hold" } }); expect(f.firestore.data.get(path)).toEqual(before);
  });
  it.each(["migration", "stale", "marker", "nonempty", "race", "capacity", "days", "restriction", "symptoms", "unknown", "timezone", "rollout", "profile", "deleting", "tombstone"])("rejects %s without writes", async kind => {
    const f = fixture(); const c = f.firestore.data.get(path);
    if (kind === "migration") c.migration.status = "review_required";
    if (kind === "stale") c.revision++;
    if (kind === "marker") c.constraints.reviewConfirmation.authorityRevision = 2;
    if (kind === "nonempty") c.plan.sessions.push({ id: "manual" });
    if (kind === "race") { c.plan.raceGoalId = f.data.raceGoalId = "race1"; c.savedRaceGoal = { targetDate: "2026-11-08" }; }
    if (kind === "capacity") c.constraints.capacity.longestMinutes = 28;
    if (kind === "days") c.constraints.capacity.daysPerWeek = 2;
    if (kind === "restriction") c.constraints.restrictions = { status: "specified", source: "clinician", noRunning: false, maxMinutes: 20 };
    if (kind === "symptoms") c.constraints.symptoms = "during_or_after";
    if (kind === "unknown") c.constraints.capacity.confirmed = false;
    if (kind === "timezone") c.timeZone = "invalid";
    if (kind === "rollout") f.firestore.data.delete("system/runningAuthority");
    if (kind === "profile") f.firestore.data.delete("users/runner");
    if (kind === "deleting") f.firestore.data.set("accountDeletionRequests/runner", { status: "running" });
    if (kind === "tombstone") f.firestore.data.set("deletedAccounts/runner", { expiresAt: "invalid" });
    const before = structuredClone(c); await expect(adopt(f)).rejects.toBeDefined(); expect(f.firestore.data.get(path)).toEqual(before); expect(f.firestore.data.has(receiptPath)).toBe(false);
  });
  it.each([[], ["2026-11-06"], ["2026-11-14"], ["2026-11-07", "2026-11-08"], ["2026-11-07", "2026-11-07"], ["2026-02-30"]])("rejects unsuitable dates %j", async dates => {
    const f = fixture(); f.data.dates = dates; await expect(adopt(f)).rejects.toBeDefined();
  });
  it("replay never restores a later held or edited plan", async () => {
    const f = fixture(); await adopt(f); const c = f.firestore.data.get(path); c.holds.push("injury"); c.revision++; c.plan.sessions = [];
    const before = structuredClone(c); expect((await adopt(f)).outcome).toBe("replayed"); expect(f.firestore.data.get(path)).toEqual(before);
    f.firestore.data.set("accountDeletionRequests/runner", { status: "running" }); await expect(adopt(f)).rejects.toBeDefined();
  });
  it("conflicts on changed command or payload", async () => {
    const f = fixture(); await adopt(f); await expect(adopt({ ...f, data: { ...f.data, requestId: "other" } })).rejects.toBeDefined();
    await expect(adopt({ ...f, data: { ...f.data, dates: ["2026-11-07"] } })).rejects.toBeDefined();
  });
  it("is atomic on receipt write failure", async () => {
    const f = fixture(); const before = structuredClone(f.firestore.data.get(path)); f.firestore.failures.set(`create:${receiptPath}`, new Error("injected"));
    await expect(adopt(f)).rejects.toThrow("injected"); expect(f.firestore.data.get(path)).toEqual(before);
  });
  it.each([{ confirmed: false }, { expectedUid: "other" }, { confirmationVersion: "other" }, { sessions: [] }])("rejects invalid confirmation %j", async patch => {
    const f = fixture(); await expect(adopt({ ...f, data: { ...f.data, ...patch } })).rejects.toBeDefined();
  });
  it.each(["sessions", "confirmedAtMs"])("rejects corrupt replay %s", async field => {
    const f = fixture(); await adopt(f); f.firestore.data.get(receiptPath)[field] = field === "sessions" ? [] : -1;
    await expect(adopt(f)).rejects.toMatchObject({ details: { errorCode: "adoption-request-conflict" } });
  });
  it("rejects a retained race goal even with inconsistent null plan goal", async () => {
    const f = fixture(); f.firestore.data.get(path).savedRaceGoal = { distance: "marathon", targetDate: "2026-11-08" };
    await expect(adopt(f)).rejects.toMatchObject({ details: { errorCode: "race-adoption-not-supported" } });
  });
  it("uses the catalogue-pinned first stage duration", async () => {
    const { REPORT_STAGE_SESSIONS } = require("../lib/runningTrainingReportTransaction");
    const result = await adopt(fixture());
    expect(result.receipt.sessions.every(s => s.templateId === REPORT_STAGE_SESSIONS[0].templateId && s.minutes === REPORT_STAGE_SESSIONS[0].minutes)).toBe(true);
  });
  it.each(["unknown_restrictions", "unconfirmed", "unreviewed_effects"])("rejects %s even when holds are absent", async kind => {
    const f = fixture(); const c = f.firestore.data.get(path).constraints;
    if (kind === "unknown_restrictions") c.restrictions = { status: "unknown" };
    if (kind === "unconfirmed") c.capacity.confirmed = false;
    if (kind === "unreviewed_effects") c.capacity.afterEffectsReviewed = false;
    await expect(adopt(f)).rejects.toBeDefined(); expect(f.firestore.data.has(receiptPath)).toBe(false);
  });
  it("requires authentication", async () => { const f = fixture(); await expect(adopt({ ...f, context: {} })).rejects.toMatchObject({ code: "unauthenticated" }); });
});

describe("explicit accepted stage provenance", () => {
  it("rejects a replay with modified stage provenance instead of claiming adoption", async () => {
    const f = fixture(); await adopt(f);
    f.firestore.data.get(receiptPath).acceptedRunWalkStage.stage = 2;
    await expect(adopt(f)).rejects.toMatchObject({ details: { errorCode: "adoption-request-conflict" } });
  });
  it("does not overwrite an existing accepted stage when its receipt is missing", async () => {
    const f = fixture(); const current = f.firestore.data.get(path);
    current.acceptedRunWalkStage = { version: 1, stage: 1, adoptionRequestId: "earlier", adoptedAtRevision: 2, raceGoalId: null, sessionIds: ["old"] };
    const before = structuredClone(current);
    await expect(adopt(f)).rejects.toMatchObject({ details: { errorCode: "initial-stage-already-adopted" } });
    expect(f.firestore.data.get(path)).toEqual(before);
  });
});
