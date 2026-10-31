// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  native: false,
  listeners: new Map<string, (value: unknown) => void>(),
  appStateListener: null as ((value: { isActive: boolean }) => void) | null,
  pendingCommands: [] as unknown[],
  pendingHeartRates: [] as unknown[],
  status: {
    available: true,
    paired: true,
    installed: true,
    reachable: true,
    enabled: false,
  },
  getStatus: vi.fn(async () => H.status),
  setEnabled: vi.fn(async (_options: { enabled: boolean }) => {}),
  publishSnapshot: vi.fn(async (_value: unknown) => {}),
  acknowledgeCommand: vi.fn(async (_value: unknown) => {}),
  clearSession: vi.fn(async (_value: unknown) => {}),
  getPendingCommands: vi.fn(async () => ({ commands: H.pendingCommands })),
  getPendingHeartRates: vi.fn(async () => ({ samples: H.pendingHeartRates })),
}));

vi.mock("../platform", () => ({ isNativePlatform: () => H.native }));
vi.mock("../connectedTrainingRelease", () => ({
  CONNECTED_TRAINING_RELEASED: true,
}));
vi.mock("@capacitor/core", () => ({
  registerPlugin: () => ({
    getStatus: H.getStatus,
    setEnabled: H.setEnabled,
    publishSnapshot: H.publishSnapshot,
    acknowledgeCommand: H.acknowledgeCommand,
    clearSession: H.clearSession,
    getPendingCommands: H.getPendingCommands,
    getPendingHeartRates: H.getPendingHeartRates,
    addListener: async (name: string, listener: (value: unknown) => void) => {
      H.listeners.set(name, listener);
      return { remove: async () => H.listeners.delete(name) };
    },
  }),
}));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: async (
      _name: string,
      listener: (value: { isActive: boolean }) => void
    ) => {
      H.appStateListener = listener;
      return { remove: async () => (H.appStateListener = null) };
    },
  },
}));

import {
  acknowledgeWatchRunCommand,
  clearWatchRunAccountState,
  clearWatchRunSession,
  getWatchRunStatus,
  publishWatchRunSaveStatus,
  publishWatchRunSnapshot,
  setWatchRunEnabled,
  subscribeWatchHeartRateSamples,
  subscribeWatchRunCommands,
  syncWatchRunAccount,
  validateWatchRunCommand,
  WatchRunCommandLedger,
  type WatchRunCommand,
} from "../watchRunBridge";

const command: WatchRunCommand = {
  sessionId: "run-A",
  commandId: "cmd-1",
  expectedRevision: 2,
  action: "pause",
  createdAtMs: 1_000,
  expiresAtMs: 9_000,
};

beforeEach(() => {
  H.native = false;
  H.listeners.clear();
  H.appStateListener = null;
  H.pendingCommands = [];
  H.pendingHeartRates = [];
  localStorage.clear();
  vi.clearAllMocks();
});

describe("WatchRun bridge", () => {
  it("reports unavailable on web without calling a native plugin", async () => {
    expect(await getWatchRunStatus()).toMatchObject({
      available: false,
      paired: false,
      enabled: false,
    });
    expect(await setWatchRunEnabled(true)).toBe(false);
    expect(
      await publishWatchRunSnapshot({
        sessionId: "run-A",
        revision: 0,
        phase: "running",
        elapsedSeconds: 0,
        distanceMeters: 0,
        recordedAtMs: 1,
      })
    ).toBe(false);
    expect(H.getStatus).not.toHaveBeenCalled();
  });

  it("passes native snapshots and acknowledgements without declaring a save", async () => {
    H.native = true;
    expect(await getWatchRunStatus()).toMatchObject({ paired: true });
    expect(await setWatchRunEnabled(true)).toBe(true);
    const snapshot = {
      sessionId: "run-A",
      revision: 2,
      phase: "running" as const,
      elapsedSeconds: 480,
      distanceMeters: 1200,
      recordedAtMs: 1_000,
    };
    expect(await publishWatchRunSnapshot(snapshot)).toBe(true);
    expect(H.publishSnapshot).toHaveBeenCalledWith(snapshot);
    const ack = {
      sessionId: "run-A",
      commandId: "cmd-1",
      revision: 3,
      phase: "paused" as const,
      accepted: true,
    };
    expect(await acknowledgeWatchRunCommand(ack)).toBe(true);
    expect(H.acknowledgeCommand).toHaveBeenCalledWith(ack);
    expect(
      await publishWatchRunSaveStatus({
        sessionId: "run-A",
        revision: 4,
        elapsedSeconds: 480,
        distanceMeters: 1200,
        recordedAtMs: 2_000,
        saveStatus: "queued",
      })
    ).toBe(true);
    expect(H.publishSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: "review", saveStatus: "queued" })
    );
  });

  it("writes the Watch's distance and pace in the runner's unit", async () => {
    H.native = true;
    expect(await setWatchRunEnabled(true)).toBe(true);
    await publishWatchRunSnapshot({
      sessionId: "run-A",
      revision: 1,
      phase: "running",
      elapsedSeconds: 600,
      distanceMeters: 1609.344 * 1.25,
      paceSecondsPerKm: 300,
      recordedAtMs: 1_000,
      unit: "mi",
    });
    const sent = H.publishSnapshot.mock.lastCall?.[0] as Record<
      string,
      unknown
    >;
    expect(sent).toMatchObject({
      distanceLabel: "1.25 mi",
      paceLabel: "8:03 /mi",
    });
    expect(sent).not.toHaveProperty("unit");
  });

  it("replays pending commands on subscribe and foreground without concurrent duplicates", async () => {
    H.native = true;
    H.pendingCommands = [command];
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => (release = resolve));
    const handler = vi.fn(() => blocked);
    const stop = await subscribeWatchRunCommands(handler);
    H.listeners.get("watchCommand")?.(command);
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);
    release();
    await blocked;
    await Promise.resolve();
    H.appStateListener?.({ isActive: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(2);
    stop();
  });

  it("replays persisted heart rate once per sample ID", async () => {
    H.native = true;
    const sample = {
      sessionId: "run-A",
      sampleId: "hr-1",
      timestampMs: 1000,
      bpm: 145,
    };
    H.pendingHeartRates = [sample];
    const handler = vi.fn();
    const stop = await subscribeWatchHeartRateSamples(handler);
    H.listeners.get("heartRateSample")?.(sample);
    H.appStateListener?.({ isActive: true });
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);
    stop();
  });

  it("clears account data on switch or sign-out but retains a same-UID restart", async () => {
    H.native = true;
    await syncWatchRunAccount("A");
    expect(H.clearSession).toHaveBeenCalledTimes(1);
    await syncWatchRunAccount("A");
    expect(H.clearSession).toHaveBeenCalledTimes(1);
    await syncWatchRunAccount("B");
    expect(H.clearSession).toHaveBeenCalledTimes(2);
    await syncWatchRunAccount(null);
    expect(H.clearSession).toHaveBeenCalledTimes(3);
    await clearWatchRunSession("run-B");
    expect(H.clearSession).toHaveBeenLastCalledWith({ sessionId: "run-B" });
  });

  it("fails closed when native account cleanup fails and recovers on retry", async () => {
    H.native = true;
    H.clearSession.mockRejectedValueOnce(
      new Error("native storage unavailable")
    );
    await expect(clearWatchRunAccountState()).rejects.toThrow(
      "native storage unavailable"
    );
    H.clearSession.mockRejectedValueOnce(
      new Error("native storage unavailable")
    );
    await expect(syncWatchRunAccount("A")).rejects.toThrow(
      "native storage unavailable"
    );
    expect(localStorage.getItem("tropos.watch_run.bound_uid")).toBeNull();
    await syncWatchRunAccount("B");
    expect(localStorage.getItem("tropos.watch_run.bound_uid")).toBe("B");
  });
});

describe("WatchRun command authority", () => {
  const context = {
    uid: "A",
    sessionId: "run-A",
    revision: 2,
    phase: "running" as const,
  };

  it("rejects old accounts, sessions, revisions, and impossible transitions", () => {
    expect(validateWatchRunCommand(command, context, "A", 2_000)).toBeNull();
    expect(validateWatchRunCommand(command, context, "B", 2_000)).toBe(
      "account-changed"
    );
    expect(
      validateWatchRunCommand(
        { ...command, sessionId: "run-old" },
        context,
        "A",
        2_000
      )
    ).toBe("stale-session");
    expect(
      validateWatchRunCommand(
        { ...command, expectedRevision: 1 },
        context,
        "A",
        2_000
      )
    ).toBe("stale-revision");
    expect(
      validateWatchRunCommand(
        { ...command, action: "resume" },
        context,
        "A",
        2_000
      )
    ).toBe("invalid-transition");
    expect(
      validateWatchRunCommand(
        command,
        { ...context, phase: "review" },
        "A",
        2_000
      )
    ).toBe("invalid-transition");
    expect(validateWatchRunCommand(command, context, "A", 9_000)).toBe(
      "expired-command"
    );
  });

  it("retains a bounded acknowledgement so a retransmission cannot reapply a command", () => {
    const ledger = new WatchRunCommandLedger(1);
    const first = {
      sessionId: "run-A",
      commandId: "cmd-1",
      revision: 3,
      phase: "paused" as const,
      accepted: true,
    };
    ledger.remember(first);
    expect(ledger.get(command)).toEqual(first);
    ledger.remember({ ...first, commandId: "cmd-2" });
    expect(ledger.get(command)).toBeUndefined();
    ledger.clear();
    expect(ledger.get({ ...command, commandId: "cmd-2" })).toBeUndefined();
  });
});
