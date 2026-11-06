import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const {
  NOW,
  runningAuthorityFixture,
} = require("./helpers/runningAuthorityFixture.cjs");
const {
  negotiateRunningAuthority: negotiate,
  enrollRunningAuthority: enroll,
} = require("../lib/runningEnrollment");
const state = "users/runner/runningState/current";
const snapshot = "users/runner/runningState/legacySnapshot";
const legacyPath = "users/runner/programState/current";
function setup() {
  const legacy = {
    runPlan: {
      phase: "recovery",
      raceGoal: { distance: "marathon", targetDate: "2026-11-01" },
    },
    runDays: [
      { id: "completed", completed: true, date: "2026-10-29" },
      { id: "unsafe-old", date: "2026-11-03", status: "planned" },
    ],
    manualCompletions: { completed: { at: NOW } },
    workouts: [{ id: "lift" }],
    weekHistory: [1, 2, 3],
  };
  const profile = {
    timezone: "UTC",
    raceGoal: { distance: "half", targetDate: "2027-01-01" },
  };
  const firestore = memoryFirestore({
    "users/runner": profile,
    [legacyPath]: legacy,
    "system/runningAuthority": { protocolVersion: 1, enrollmentEnabled: true },
  });
  const input = {
    firestore,
    context: { auth: { uid: "runner" } },
    clock: () => NOW,
    data: { expectedUid: "runner", supportedSchemaVersions: [1] },
  };
  return { firestore, input, legacy, profile };
}
const enrollment = (input) => ({
  ...input,
  data: { ...input.data, confirmed: true },
});
describe("held-only enrollment and authenticated negotiation", () => {
  it("preserves exact history snapshot and successor goal without importing prescriptions", async () => {
    const { firestore, input, legacy, profile } = setup();
    const result = await enroll(enrollment(input));
    expect(result).toMatchObject({
      status: "held",
      revision: 0,
      authority: {
        holds: ["enrollment_review_required", "recovery_evidence_required"],
        plan: { sessions: [] },
        savedRaceGoal: profile.raceGoal,
      },
    });
    expect(result.authority.constraints.capacity).toEqual({
      confirmed: false,
      afterEffectsReviewed: false,
      daysPerWeek: null,
      longestMinutes: null,
    });
    expect(firestore.data.get(snapshot)).toEqual(legacy);
    expect(firestore.data.get(legacyPath)).toEqual(legacy);
    expect(firestore.data.get("users/runner")).toEqual(profile);
    expect(firestore.operations).toEqual([
      ["create", snapshot],
      ["create", state],
    ]);
  });
  it("old direct writes cannot replace authority or the immutable snapshot", async () => {
    const { firestore, input, legacy } = setup();
    await enroll(enrollment(input));
    const canonical = structuredClone(firestore.data.get(state));
    firestore.data.set(legacyPath, {
      runPlan: { phase: "training" },
      runDays: [{ id: "bypass", date: "2026-11-07" }],
    });
    expect(await negotiate(input)).toMatchObject({
      status: "held",
      authority: { plan: { sessions: [] } },
    });
    await enroll(enrollment(input));
    expect(firestore.data.get(state)).toEqual(canonical);
    expect(firestore.data.get(snapshot)).toEqual(legacy);
    expect(firestore.operations).toHaveLength(2);
  });
  it("does not treat a planned marathon date as completion evidence", async () => {
    const { firestore, input } = setup();
    const result = await enroll(enrollment(input));
    expect(result.authority).not.toHaveProperty("recoveryStartedOn");
    expect(result.authority).not.toHaveProperty("recoveryEvidence");
    expect(firestore.data.get(state).plan.sessions).toEqual([]);
  });
  it("has no legacy-authorized response for a non-enrolled account", async () => {
    const { input, firestore } = setup();
    expect(await negotiate(input)).toEqual({
      status: "not_enrolled",
      accountId: "runner",
      checkedAtMs: NOW,
      reason: "not_enrolled",
    });
    expect(firestore.operations).toEqual([]);
  });
  it.each(["absent", "disabled", "version"])(
    "rollout %s fails closed without writes",
    async (condition) => {
      const { input, firestore } = setup();
      if (condition === "absent")
        firestore.data.delete("system/runningAuthority");
      else
        firestore.data.set("system/runningAuthority", {
          protocolVersion: condition === "version" ? 2 : 1,
          enrollmentEnabled: false,
        });
      expect(await enroll(enrollment(input))).toMatchObject({
        status: "unavailable",
        reason: "rollout_disabled",
      });
      expect(firestore.operations).toEqual([]);
    }
  );
  it.each([undefined, "not/a-zone"])(
    "does not invent missing/bad timezone %s",
    async (timezone) => {
      const { input, firestore, profile } = setup();
      firestore.data.set("users/runner", { ...profile, timezone });
      expect(await enroll(enrollment(input))).toMatchObject({
        status: "unavailable",
        reason: "timezone_required",
      });
      expect(firestore.operations).toEqual([]);
    }
  );
  it("does not overwrite an orphaned migration snapshot", async () => {
    const { input, firestore } = setup();
    firestore.data.set(snapshot, { historical: true });
    expect(await enroll(enrollment(input))).toMatchObject({
      reason: "migration_incomplete",
    });
    expect(firestore.data.get(snapshot)).toEqual({ historical: true });
    expect(firestore.operations).toEqual([]);
  });
  it("suppresses persisted prescriptions during any hold without changing stored data", async () => {
    const { input, firestore } = setup();
    const current = runningAuthorityFixture().authority;
    current.holds = ["unknown_hold"];
    firestore.data.set(state, current);
    expect(await negotiate(input)).toMatchObject({
      status: "held",
      authority: { plan: { sessions: [] } },
    });
    expect(firestore.data.get(state)).toEqual(current);
    expect(firestore.operations).toEqual([]);
  });
  it("only returns canonical ready state, never legacy prescriptions", async () => {
    const { input, firestore } = setup();
    const current = runningAuthorityFixture().authority;
    firestore.data.set(state, current);
    expect(await negotiate(input)).toEqual({
      status: "ready",
      accountId: "runner",
      checkedAtMs: NOW,
      schemaVersion: 1,
      revision: 8,
      authority: current,
    });
  });
  it.each(["schema", "account", "revision", "session"])(
    "rejects malformed or unsupported %s",
    async (field) => {
      const { input, firestore } = setup();
      const current = runningAuthorityFixture().authority;
      if (field === "schema") current.schemaVersion = 2;
      if (field === "account") current.accountId = "other";
      if (field === "revision") current.revision = -1;
      if (field === "session") current.plan.sessions[0].minutes = NaN;
      firestore.data.set(state, current);
      const result = await negotiate(input);
      expect(result.status).toBe("unavailable");
      expect(result).not.toHaveProperty("authority");
    }
  );
  it.each([false, true])(
    "deletion blocks initial/repeated enrollment=%s",
    async (repeated) => {
      const { input, firestore } = setup();
      if (repeated) await enroll(enrollment(input));
      const before = firestore.operations.length;
      firestore.data.set("accountDeletionRequests/runner", {
        status: "running",
      });
      await expect(enroll(enrollment(input))).rejects.toMatchObject({
        details: { errorCode: "account-deleting" },
      });
      await expect(negotiate(input)).rejects.toMatchObject({
        details: { errorCode: "account-deleting" },
      });
      expect(firestore.operations).toHaveLength(before);
    }
  );
  it("snapshot+authority creation fails atomically in the deterministic store", async () => {
    const { input, firestore } = setup();
    firestore.failures.set(`create:${state}`, Error("injected"));
    await expect(enroll(enrollment(input))).rejects.toThrow("injected");
    expect(firestore.data.has(snapshot)).toBe(false);
    expect(firestore.data.has(state)).toBe(false);
  });
  it.each([{}, { auth: { uid: "other" } }])(
    "rejects auth mismatch before DB",
    async (context) => {
      const { input } = setup();
      const doc = vi.fn();
      await expect(
        enroll({ ...enrollment(input), firestore: { doc }, context })
      ).rejects.toBeDefined();
      expect(doc).not.toHaveBeenCalled();
    }
  );
  it("rejects client migration state/capacity injection", async () => {
    const { input } = setup();
    const doc = vi.fn();
    await expect(
      enroll({
        ...enrollment(input),
        firestore: { doc },
        data: { ...enrollment(input).data, authority: {} },
      })
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(doc).not.toHaveBeenCalled();
  });
  it("unfinished migration stays held even if its holds were mistakenly removed", async () => {
    const { input, firestore } = setup();
    await enroll(enrollment(input));
    const current = firestore.data.get(state);
    current.holds = [];
    current.plan.sessions = runningAuthorityFixture().authority.plan.sessions;
    const result = await negotiate(input);
    expect(result).toMatchObject({
      status: "held",
      reason: "migration_review_required",
      authority: {
        holds: ["enrollment_review_required"],
        plan: { sessions: [] },
      },
    });
    expect(firestore.data.get(state).holds).toEqual([]);
  });
  it("rejects duplicate prescription dates even with unique IDs", async () => {
    const { input, firestore } = setup();
    const current = runningAuthorityFixture().authority;
    current.plan.sessions.push({
      ...current.plan.sessions[0],
      id: "duplicate-date",
    });
    firestore.data.set(state, current);
    expect(await negotiate(input)).toMatchObject({
      status: "unavailable",
      reason: "invalid_prescriptions",
    });
  });
  it.each(["protected", "completed", "status"])(
    "rejects malformed prescription metadata %s",
    async (field) => {
      const { input, firestore } = setup();
      const current = runningAuthorityFixture().authority;
      current.plan.sessions[0][field] = null;
      firestore.data.set(state, current);
      expect(await negotiate(input)).toMatchObject({
        status: "unavailable",
        reason: "invalid_prescriptions",
      });
    }
  );
});
