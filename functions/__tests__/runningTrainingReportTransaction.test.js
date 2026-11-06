import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const {
  submitOutsideTrainingReportTransaction: submit,
} = require("../lib/runningTrainingReportTransaction");
const NOW = Date.parse("2026-11-06T12:00:00Z");
const authorityPath = "users/runner/runningState/current";
function setup() {
  const authority = {
    schemaVersion: 1,
    accountId: "runner",
    revision: 8,
    timeZone: "UTC",
    plan: {
      raceGoalId: "race1",
      sessions: [
        {
          id: "session1",
          date: "2026-11-05",
          templateId: "run_walk_1",
          minutes: 29,
          kind: "run_walk",
        },
      ],
    },
    constraints: {
      capacity: { stage: 1 },
      reviewConfirmation: { authorityRevision: 8 },
    },
    holds: ["injury", "post_race"],
    history: [{ id: "saved-run" }],
    manualCompletions: { historical: { completedAt: 1 } },
  };
  const data = {
    expectedUid: "runner",
    commandId: "report-command-1",
    expectedAuthorityRevision: 8,
    raceGoalId: "race1",
    scheduledRunId: "session1",
    confirmationVersion: "outside-training-report-v1",
    report: {
      activityId: "outside:one",
      date: "2026-11-05",
      source: "outside_session",
      durationSeconds: 1800,
      relativeEffort: "matched",
      sessionCompletedAsDescribed: true,
      completedStage: 1,
      manageable: true,
    },
  };
  const firestore = memoryFirestore({
    "users/runner": { displayName: "Synthetic runner" },
    [authorityPath]: authority,
  });
  return {
    authority,
    firestore,
    data,
    input: {
      firestore,
      context: { auth: { uid: "runner" } },
      data,
      clock: () => NOW,
    },
  };
}
describe("dormant outside-training report transaction", () => {
  it("atomically writes separate facts/receipt and only bumps authority revision", async () => {
    const { authority, firestore, input } = setup();
    const before = structuredClone(authority);
    const result = await submit(input);
    expect(result).toMatchObject({
      outcome: "saved",
      receipt: {
        accountId: "runner",
        raceGoalId: "race1",
        scheduledRunId: "session1",
        activityId: "outside:one",
        baseRevision: 8,
        authorityRevision: 9,
        report: input.data.report,
      },
    });
    expect(firestore.data.get(authorityPath)).toEqual({
      ...before,
      revision: 9,
    });
    expect(firestore.operations).toEqual([
      ["create", "users/runner/runningTrainingReports/outside:one"],
      ["create", "users/runner/runningReportReceipts/report-command-1"],
      ["update", authorityPath],
    ]);
    expect(firestore.data.has("users/runner/runs/outside:one")).toBe(false);
  });
  it("replays identical payload despite key ordering and later holds without another write", async () => {
    const { firestore, input } = setup();
    const first = await submit(input);
    const state = firestore.data.get(authorityPath);
    state.revision = 11;
    state.holds.push("clinical_restriction");
    state.plan.raceGoalId = "new-race";
    for (const path of [
      "users/runner/runningTrainingReports/outside:one",
      "users/runner/runningReportReceipts/report-command-1",
    ]) {
      const stored = firestore.data.get(path);
      stored.report = Object.fromEntries(
        Object.entries(stored.report).reverse()
      );
    }
    const next = await submit(input);
    expect(next.outcome).toBe("replayed");
    expect(next.receipt.payloadHash).toBe(first.receipt.payloadHash);
    expect(firestore.operations).toHaveLength(3);
    expect(firestore.data.get(authorityPath).revision).toBe(11);
  });
  it("rejects changed-payload replay and different commands reusing a report identity", async () => {
    const { input, firestore } = setup();
    await submit(input);
    await expect(
      submit({
        ...input,
        data: {
          ...input.data,
          report: { ...input.data.report, durationSeconds: 2000 },
        },
      })
    ).rejects.toMatchObject({ code: "failed-precondition" });
    await expect(
      submit({
        ...input,
        data: {
          ...input.data,
          commandId: "other",
          expectedAuthorityRevision: 9,
        },
      })
    ).rejects.toMatchObject({ code: "already-exists" });
    expect(firestore.operations).toHaveLength(3);
  });
  it.each([
    [{}, {}, "unauthenticated"],
    [{ auth: { uid: "other" } }, {}, "cancelled"],
    [{ auth: { uid: "runner" } }, { uid: "other" }, "invalid-argument"],
    [
      { auth: { uid: "runner" } },
      { commandId: "bad/path" },
      "invalid-argument",
    ],
    [
      { auth: { uid: "runner" } },
      { expectedAuthorityRevision: -1 },
      "invalid-argument",
    ],
    [
      { auth: { uid: "runner" } },
      { confirmationVersion: undefined },
      "invalid-argument",
    ],
  ])(
    "rejects auth/payload before constructing Firestore refs",
    async (context, patch, code) => {
      const { input } = setup();
      const doc = vi.fn();
      await expect(
        submit({
          ...input,
          context,
          data: { ...input.data, ...patch },
          firestore: { doc },
        })
      ).rejects.toMatchObject({ code });
      expect(doc).not.toHaveBeenCalled();
    }
  );
  it.each([
    { source: "saved_activity" },
    { durationSeconds: 1 },
    { durationSeconds: Infinity },
    { durationSeconds: 86401 },
    { date: "2026-02-30" },
    { manageable: "yes" },
    { completedStage: 10 },
    { sessionCompletedAsDescribed: false },
    { activityId: "run1" },
    { hiddenStageCredit: 5 },
  ])("rejects malformed or contradictory report facts", async (patch) => {
    const { input, firestore } = setup();
    await expect(
      submit({
        ...input,
        data: { ...input.data, report: { ...input.data.report, ...patch } },
      })
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(firestore.operations).toEqual([]);
  });
  it("accepts shorter incomplete/unknown training as facts without completion credit", async () => {
    const { input, firestore } = setup();
    input.data.report = {
      activityId: "outside:partial",
      date: "2026-11-05",
      source: "outside_session",
      durationSeconds: 600,
      relativeEffort: null,
    };
    const result = await submit(input);
    expect(result.receipt.report).toEqual(input.data.report);
    expect(firestore.data.get(authorityPath).constraints).toEqual({
      capacity: { stage: 1 },
      reviewConfirmation: { authorityRevision: 8 },
    });
  });
  it.each(["users/runner", authorityPath])(
    "does not recreate a missing account/authority even on replay: %s",
    async (path) => {
      const { input, firestore } = setup();
      await submit(input);
      firestore.data.delete(path);
      await expect(submit(input)).rejects.toMatchObject({
        code: "failed-precondition",
      });
      expect(firestore.operations).toHaveLength(3);
    }
  );
  it.each(["accountDeletionRequests/runner", "deletedAccounts/runner"])(
    "checks deletion before writes and replay: %s",
    async (path) => {
      for (const replay of [false, true]) {
        const { input, firestore } = setup();
        if (replay) await submit(input);
        firestore.data.set(
          path,
          path.startsWith("accountDeletion")
            ? { status: "running" }
            : { expiresAt: { seconds: Math.floor(NOW / 1000) + 100 } }
        );
        const count = firestore.operations.length;
        await expect(submit(input)).rejects.toBeDefined();
        expect(firestore.operations).toHaveLength(count);
      }
    }
  );
  it.each([
    { revision: 9 },
    { accountId: "other" },
    { schemaVersion: 2 },
    { revision: Number.MAX_SAFE_INTEGER },
    { holds: null },
  ])("rejects stale/malformed/wrong-account authority", async (patch) => {
    const { input, firestore } = setup();
    Object.assign(firestore.data.get(authorityPath), patch);
    await expect(submit(input)).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(firestore.operations).toEqual([]);
  });
  it.each([{ raceGoalId: "different" }, { scheduledRunId: "missing" }])(
    "rejects wrong plan/session scope",
    async (patch) => {
      const { input } = setup();
      await expect(
        submit({ ...input, data: { ...input.data, ...patch } })
      ).rejects.toMatchObject({ code: "failed-precondition" });
    }
  );
  it.each([
    { kind: "race", templateId: "10k_race" },
    { templateId: "run_walk_2" },
  ])("rejects race or mismatching claimed-stage sessions", async (patch) => {
    const { input, firestore } = setup();
    Object.assign(firestore.data.get(authorityPath).plan.sessions[0], patch);
    await expect(submit(input)).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });
  it("does not accept unknown catalogue templates even for incomplete reports", async () => {
    const { input, firestore } = setup();
    firestore.data.get(authorityPath).plan.sessions[0].templateId = "unknown_easy_template";
    input.data.report = { activityId: "outside:partial", date: "2026-11-05", source: "outside_session", durationSeconds: 600, relativeEffort: null };
    await expect(submit(input)).rejects.toMatchObject({ code: "failed-precondition" });
    expect(firestore.operations).toEqual([]);
  });
  it("uses authoritative local dates and rejects missing/invalid time zones", async () => {
    const { input, firestore } = setup();
    input.clock = () => Date.parse("2026-11-06T01:00:00Z");
    input.data.report.date = "2026-11-06";
    firestore.data.get(authorityPath).timeZone = "America/Los_Angeles";
    await expect(submit(input)).rejects.toMatchObject({
      code: "invalid-argument",
    });
    firestore.data.get(authorityPath).timeZone = "UTC";
    expect((await submit(input)).outcome).toBe("saved");
    const next = setup();
    next.firestore.data.get(authorityPath).timeZone = "invalid";
    await expect(submit(next.input)).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });
  it("rejects a saved-activity identity collision", async () => {
    const { input, firestore } = setup();
    firestore.data.set("users/runner/runs/outside:one", { date: "2026-11-05" });
    await expect(submit(input)).rejects.toMatchObject({
      code: "already-exists",
    });
  });
  it.each([
    "users/runner/runningTrainingReports/outside:one",
    "users/runner/runningReportReceipts/report-command-1",
  ])("failed commit is atomic: %s", async (path) => {
    const { input, firestore, authority } = setup();
    firestore.failures.set(
      `create:${path}`,
      new Error("injected write failure")
    );
    await expect(submit(input)).rejects.toThrow();
    expect(firestore.operations).toEqual([]);
    expect(firestore.data.get(authorityPath)).toEqual(authority);
  });
  it("blocks every actual active deletion status before replay", async () => {
    const {
      ACTIVE_DELETION_STATUSES,
    } = require("../lib/accountDeletionStatus");
    for (const status of ACTIVE_DELETION_STATUSES) {
      const { input, firestore } = setup();
      await submit(input);
      firestore.data.set("accountDeletionRequests/runner", { status });
      await expect(submit(input)).rejects.toMatchObject({
        details: { errorCode: "account-deleting" },
      });
      expect(firestore.operations).toHaveLength(3);
    }
  });
  it.each([
    { reportRevision: 2 },
    { baseRevision: 1 },
    { confirmationVersion: "unknown" },
    { recordedAtMs: -1 },
  ])(
    "does not report corrupted evidence as a successful replay",
    async (patch) => {
      const { input, firestore } = setup();
      await submit(input);
      Object.assign(
        firestore.data.get("users/runner/runningTrainingReports/outside:one"),
        patch
      );
      await expect(submit(input)).rejects.toMatchObject({
        code: "failed-precondition",
      });
      expect(firestore.operations).toHaveLength(3);
    }
  );
  it("rechecks authority and local date on a discarded transaction attempt", async () => {
    for (const change of ["revision", "timeZone"]) {
      const { input, firestore } = setup();
      input.clock = () => Date.parse("2026-11-06T01:00:00Z");
      input.data.report.date = "2026-11-06";
      const actual = firestore.runTransaction.bind(firestore);
      firestore.runTransaction = async (callback) => {
        await callback({
          get: (ref) => ref.get(),
          create: () => {},
          update: () => {},
        });
        const state = firestore.data.get(authorityPath);
        if (change === "revision") state.revision++;
        else state.timeZone = "America/Los_Angeles";
        return actual(callback);
      };
      await expect(submit(input)).rejects.toMatchObject({
        code:
          change === "revision" ? "failed-precondition" : "invalid-argument",
      });
      expect(firestore.operations).toEqual([]);
    }
  });
  it("captures primitives before awaits, and rejects missing evidence on replay", async () => {
    const { input, firestore } = setup();
    const pending = submit(input);
    input.data.report.durationSeconds = 999;
    expect((await pending).receipt.report.durationSeconds).toBe(1800);
    input.data.report.durationSeconds = 1800;
    firestore.data.delete("users/runner/runningTrainingReports/outside:one");
    await expect(submit(input)).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });
});


describe("explicit non-race adopted stage reporting", () => {
  async function adoptedFixture() {
    const { adoptInitialRunningPlanTransaction: adopt } = require("../lib/runningInitialPlanTransaction");
    const f = setup();
    const state = f.firestore.data.get(authorityPath);
    Object.assign(state, { plan: { raceGoalId: null, sessions: [] }, holds: [], migration: { version: 1, status: "complete" },
      constraints: { symptoms: "none", capacity: { confirmed: true, afterEffectsReviewed: true, daysPerWeek: 3, longestMinutes: 29 }, restrictions: { status: "none" }, reviewConfirmation: { version: 1, confirmed: true, authorityRevision: 8, raceGoalId: null } } });
    f.firestore.data.set("system/runningAuthority", { protocolVersion: 1, initialPlanEnabled: true });
    await adopt({ ...f.input, data: { expectedUid: "runner", expectedRevision: 8, requestId: "adoption", raceGoalId: null, confirmed: true, confirmationVersion: "initial-run-walk-v1", dates: ["2026-11-07", "2026-11-09"] } });
    f.input.clock = () => Date.parse("2026-11-10T12:00:00Z");
    Object.assign(f.input.data, { expectedAuthorityRevision: 9, raceGoalId: null, scheduledRunId: "initial_20261107" });
    f.input.data.report.date = "2026-11-07";
    return f;
  }
  it("accepts actual adopted null-goal scope and retains it across report revision bumps", async () => {
    const f = await adoptedFixture(); const before = structuredClone(f.firestore.data.get(authorityPath));
    expect((await submit(f.input)).outcome).toBe("saved");
    expect(f.firestore.data.get(authorityPath)).toEqual({ ...before, revision: 10 });
    const second = { ...f.input, data: { ...f.input.data, commandId: "second", expectedAuthorityRevision: 10, scheduledRunId: "initial_20261109", report: { ...f.input.data.report, activityId: "outside:second", date: "2026-11-09" } } };
    expect((await submit(second)).outcome).toBe("saved");
    expect(f.firestore.data.get(authorityPath)).toEqual({ ...before, revision: 11 });
  });
  it.each(["missing", "version", "stage", "request", "revision", "goal", "ids", "duplicate", "receipt", "receiptScope", "session", "otherSession", "claimedStage"])("rejects missing/malformed/stale accepted scope: %s", async kind => {
    const f = await adoptedFixture(); const state = f.firestore.data.get(authorityPath); const scope = state.acceptedRunWalkStage;
    const receiptPath = "users/runner/runningState/initialPlanReceipt";
    if (kind === "missing") delete state.acceptedRunWalkStage;
    if (kind === "version") scope.version = 2;
    if (kind === "stage") scope.stage = 2;
    if (kind === "request") scope.adoptionRequestId = "unrelated";
    if (kind === "revision") scope.adoptedAtRevision = 10;
    if (kind === "goal") scope.raceGoalId = "race1";
    if (kind === "ids") scope.sessionIds = ["other"];
    if (kind === "duplicate") scope.sessionIds.push(scope.sessionIds[0]);
    if (kind === "receipt") f.firestore.data.delete(receiptPath);
    if (kind === "receiptScope") delete f.firestore.data.get(receiptPath).acceptedRunWalkStage;
    if (kind === "session") state.plan.sessions[0].minutes = 30;
    if (kind === "otherSession") state.plan.sessions[1].date = "2026-11-10";
    if (kind === "claimedStage") f.input.data.report.completedStage = 2;
    const count = f.firestore.operations.length;
    await expect(submit(f.input)).rejects.toMatchObject({ code: "failed-precondition" });
    expect(f.firestore.operations).toHaveLength(count);
  });
  it("rejects null-goal template-only inference even for incomplete facts", async () => {
    const f = setup(); f.firestore.data.get(authorityPath).plan.raceGoalId = null; f.input.data.raceGoalId = null;
    delete f.input.data.report.completedStage; f.input.data.report.sessionCompletedAsDescribed = false;
    await expect(submit(f.input)).rejects.toMatchObject({ code: "failed-precondition" });
  });
  it("replays saved evidence after a later stage scope change without restoring it", async () => {
    const f = await adoptedFixture(); await submit(f.input);
    const state = f.firestore.data.get(authorityPath); state.revision++; state.holds.push("injury"); delete state.acceptedRunWalkStage; state.plan.sessions = [];
    const before = structuredClone(state); expect((await submit(f.input)).outcome).toBe("replayed"); expect(f.firestore.data.get(authorityPath)).toEqual(before);
  });
});
