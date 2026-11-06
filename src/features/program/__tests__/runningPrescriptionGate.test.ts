import { describe, expect, it, vi } from "vitest";
import {
  gateLegacyRunningProgram,
  type RunningGateContext,
} from "../runningPrescriptionGate";
import { createRunningPrescriptionGate } from "../runningPrescriptionGateController";
import type { ProgramState } from "../programTypes";

vi.mock("../runningPrescriptionFeature", () => ({
  RUNNING_PRESCRIPTION_GATE_ENABLED: true,
}));

const NOW = 1_800_000_000_000;
const alice: RunningGateContext = {
  accountId: "alice",
  session: {},
  online: true,
};
const bob: RunningGateContext = { accountId: "bob", session: {}, online: true };
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<unknown>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function ready(uid = "alice", revision = 4) {
  return {
    status: "ready",
    accountId: uid,
    checkedAtMs: NOW,
    schemaVersion: 1,
    revision,
    authority: {
      accountId: uid,
      schemaVersion: 1,
      revision,
      holds: [],
      plan: { sessions: [] },
    },
  };
}
async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("inactive prescription compatibility boundary", () => {
  it("is hard disabled and performs no negotiation while preserving legacy identity", () => {
    const transport = vi.fn();
    const gate = createRunningPrescriptionGate({ enabled: false, transport });
    gate.setContext(alice);
    const state = { runDays: [{ id: "old" }] } as ProgramState;
    expect(gateLegacyRunningProgram(state, gate.read(alice))).toBe(state);
    expect(transport).not.toHaveBeenCalled();
  });
  it("suppresses forward plan metadata but preserves lift workouts, nutrition and manual history without mutating data", () => {
    const state = {
      goal: "recomp",
      workouts: [{ dayName: "Lift" }],
      weekHistory: [{ weekNumber: 1 }],
      runDays: [{ id: "old" }],
      runPlan: { mode: "race_prep" },
      manualCompletions: { old: { completedAt: 1 } },
      pendingFellBehindPrompt: { detectedAt: 1 },
      easeSnapshot: { runDays: [{ id: "undo" }] },
      deloadSnapshot: {
        workouts: [{ dayName: "Original lift" }],
        runDays: [{ id: "deload" }],
      },
    } as unknown as ProgramState;
    const projected = gateLegacyRunningProgram(state, {
      legacyAllowed: false,
    })!;
    expect(projected.runDays).toEqual(state.runDays); // Explicit manual completion is history.
    expect(projected.runPlan).toBeUndefined();
    expect(projected.pendingFellBehindPrompt).toBeUndefined();
    expect(projected.easeSnapshot?.runDays).toEqual([]);
    expect(projected.deloadSnapshot?.runDays).toEqual([]);
    expect(projected.deloadSnapshot?.workouts).toBe(
      state.deloadSnapshot?.workouts
    );
    expect(state.deloadSnapshot?.runDays).toHaveLength(1);
    expect(projected.workouts).toBe(state.workouts);
    expect(projected.weekHistory).toBe(state.weekHistory);
    expect(projected.manualCompletions).toBe(state.manualCompletions);
    expect(projected.goal).toBe(state.goal);
    expect(state.runDays).toHaveLength(1);
    expect(state.runPlan).toBeDefined();
  });
  it("retains explicit completed/manual/skipped history, never inferring it from elapsed dates", () => {
    const days = [
      {
        id: "planned",
        status: "planned",
        completed: false,
        date: "2000-01-01",
      },
      {
        id: "unknown",
        status: "unknown_status",
        completed: false,
        date: "2000-01-01",
      },
      { id: "legacy", completed: true },
      { id: "exact", status: "completed_exact", completed: false },
      { id: "modified", status: "completed_modified", completed: false },
      { id: "late", status: "completed_late", completed: false },
      {
        id: "skipped",
        status: "skipped",
        completed: false,
        date: "2099-01-01",
      },
      { id: "no-show", status: "race_no_show", completed: false },
      { id: "manual", status: "planned", completed: false },
      { id: "constructor", status: "planned", completed: false },
    ];
    const state = {
      runDays: days,
      manualCompletions: { manual: { completedAt: 1 } },
      easeSnapshot: { weekNumber: 3, appliedAt: 2, runDays: days },
      deloadSnapshot: {
        weekNumber: 3,
        appliedAt: 2,
        runDays: days,
        workouts: [],
      },
    } as unknown as ProgramState;
    const view = gateLegacyRunningProgram(state, { legacyAllowed: false })!;
    const ids = [
      "legacy",
      "exact",
      "modified",
      "late",
      "skipped",
      "no-show",
      "manual",
    ];
    expect(view.runDays?.map((day) => day.id)).toEqual(ids);
    expect(view.easeSnapshot?.runDays.map((day) => day.id)).toEqual(ids);
    expect(view.deloadSnapshot?.runDays?.map((day) => day.id)).toEqual(ids);
    expect(view.easeSnapshot).toMatchObject({ weekNumber: 3, appliedAt: 2 });
    expect(view.runDays?.[0]).toBe(state.runDays?.[2]);
    expect(state.runDays).toHaveLength(10);
    expect(state.easeSnapshot?.runDays).toBe(days);
    expect(view.manualCompletions).toBe(state.manualCompletions);
  });

  it("fails closed before auth, when offline, and without an installed transport", () => {
    const gate = createRunningPrescriptionGate({ enabled: true });
    expect(gate.read(alice).legacyAllowed).toBe(false);
    gate.setContext(alice);
    expect(gate.read(alice).status).toBe("unavailable");
    expect(gate.read({ ...alice, online: false }).legacyAllowed).toBe(false);
  });
  it("sends only the agreed authenticated negotiation request and blocks while delayed", async () => {
    const reply = deferred();
    const transport = vi.fn(() => reply.promise);
    const gate = createRunningPrescriptionGate({
      enabled: true,
      transport,
      now: () => NOW,
    });
    gate.setContext(alice);
    expect(transport).toHaveBeenCalledWith({
      expectedUid: "alice",
      supportedSchemaVersions: [1],
    });
    expect(gate.read(alice)).toMatchObject({
      status: "pending",
      legacyAllowed: false,
    });
    reply.resolve(ready());
    await settle();
    expect(gate.read(alice)).toMatchObject({
      status: "ready",
      legacyAllowed: false,
    });
    expect(gate.read(alice).authority).toEqual(ready().authority);
    // A ready authority is not permission to reinterpret cached runDays.
    expect(
      gateLegacyRunningProgram(
        { runDays: [{ id: "legacy" }] } as ProgramState,
        gate.read(alice)
      )?.runDays
    ).toEqual([]);
  });
  it.each(["not_enrolled", "unavailable"])(
    "%s never falls back to legacy",
    async (status) => {
      const gate = createRunningPrescriptionGate({
        enabled: true,
        transport: async () => ({
          status,
          accountId: "alice",
          checkedAtMs: NOW,
        }),
        now: () => NOW,
      });
      gate.setContext(alice);
      await settle();
      expect(gate.read(alice)).toEqual({
        status,
        legacyAllowed: false,
        authority: null,
      });
    }
  );
  it.each([
    null,
    {},
    { ...ready(), accountId: "bob" },
    { ...ready(), schemaVersion: 2 },
    { ...ready(), revision: -1 },
    { ...ready(), checkedAtMs: NOW + 1 },
    { ...ready(), checkedAtMs: NOW - 60_000 },
    { ...ready(), authority: { ...ready().authority, accountId: "bob" } },
    { ...ready(), authority: { ...ready().authority, revision: 3 } },
    { ...ready(), authority: { ...ready().authority, holds: ["unknown"] } },
    {
      ...ready(),
      status: "held",
      authority: {
        ...ready().authority,
        holds: ["injury"],
        plan: { sessions: [{}] },
      },
    },
  ])(
    "rejects missing/malformed/unknown/stale authority %j",
    async (response) => {
      const gate = createRunningPrescriptionGate({
        enabled: true,
        transport: async () => response,
        now: () => NOW,
      });
      gate.setContext(alice);
      await settle();
      expect(gate.read(alice)).toEqual({
        status: "unavailable",
        legacyAllowed: false,
        authority: null,
      });
    }
  );
  it("retains held status/history only when the server omits prescriptions", async () => {
    const response = {
      ...ready(),
      status: "held",
      authority: {
        ...ready().authority,
        holds: ["unknown_hold"],
        history: [{ id: "saved" }],
      },
    };
    const gate = createRunningPrescriptionGate({
      enabled: true,
      transport: async () => response,
      now: () => NOW,
    });
    gate.setContext(alice);
    await settle();
    expect(gate.read(alice)).toMatchObject({
      status: "held",
      legacyAllowed: false,
      authority: response.authority,
    });
  });
  it("expires success without relying on an effect to hide it", async () => {
    let clock = NOW;
    const gate = createRunningPrescriptionGate({
      enabled: true,
      transport: async () => ready(),
      now: () => clock,
    });
    gate.setContext(alice);
    await settle();
    clock += 60_000;
    expect(gate.read(alice)).toEqual({
      status: "unavailable",
      legacyAllowed: false,
      authority: null,
    });
  });
  it("hides the previous account on the first render, before setContext runs", async () => {
    const gate = createRunningPrescriptionGate({
      enabled: true,
      transport: async () => ready(),
      now: () => NOW,
    });
    gate.setContext(alice);
    await settle();
    expect(gate.read(bob).authority).toBeNull();
    expect(gate.read({ ...alice, session: {} }).authority).toBeNull();
  });
  it("ignores delayed old-account response, including A -> B -> A", async () => {
    const old = deferred();
    const newer = deferred();
    const latest = deferred();
    const transport = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(newer.promise)
      .mockReturnValueOnce(latest.promise);
    const gate = createRunningPrescriptionGate({
      enabled: true,
      transport,
      now: () => NOW,
    });
    gate.setContext(alice);
    gate.setContext(bob);
    gate.setContext(alice);
    latest.resolve(ready("alice", 9));
    await settle();
    old.resolve(ready("alice", 4));
    newer.resolve(ready("bob", 5));
    await settle();
    expect(gate.read(alice).authority?.revision).toBe(9);
  });
  it("requires fresh negotiation on reconnect and ignores old online results", async () => {
    const old = deferred();
    const fresh = deferred();
    const gate = createRunningPrescriptionGate({
      enabled: true,
      transport: vi
        .fn()
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(fresh.promise),
      now: () => NOW,
    });
    gate.setContext(alice);
    gate.setContext({ ...alice, online: false });
    old.resolve(ready());
    await settle();
    expect(gate.read({ ...alice, online: false }).authority).toBeNull();
    gate.setContext(alice);
    expect(gate.read(alice).status).toBe("pending");
    fresh.resolve({
      status: "not_enrolled",
      accountId: "alice",
      checkedAtMs: NOW,
    });
    await settle();
    expect(gate.read(alice).legacyAllowed).toBe(false);
  });
  it("clears ready state on invalidation, failed refresh and a newer unavailable response", async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(ready())
      .mockRejectedValueOnce(Error("offline"))
      .mockResolvedValueOnce({
        status: "not_enrolled",
        accountId: "alice",
        checkedAtMs: NOW,
      });
    const gate = createRunningPrescriptionGate({
      enabled: true,
      transport,
      now: () => NOW,
    });
    gate.setContext(alice);
    await settle();
    gate.invalidate();
    expect(gate.read(alice).authority).toBeNull();
    await gate.refresh();
    expect(gate.read(alice).authority).toBeNull();
    await gate.refresh();
    expect(gate.read(alice).legacyAllowed).toBe(false);
  });
});
