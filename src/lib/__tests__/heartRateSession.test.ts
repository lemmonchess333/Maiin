import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const getPendingWatchHeartRateSamples = vi.fn();
vi.mock("../watchRunBridge", () => ({
  getPendingWatchHeartRateSamples: () => getPendingWatchHeartRateSamples(),
}));
const getHeartRateSensorSessionSamples = vi.fn();
const clearHeartRateSensorSessions = vi.fn();
vi.mock("../heartRateSensorBridge", () => ({
  getHeartRateSensorSessionSamples: (sessionId: string) =>
    getHeartRateSensorSessionSamples(sessionId),
  clearHeartRateSensorSessions: (sessionId?: string) =>
    clearHeartRateSensorSessions(sessionId),
}));

import {
  appendHeartRateSample,
  beginMoving,
  clearHeartRateSession,
  clearHeartRateSessionsForUser,
  finishMoving,
  getHeartRateSession,
  getRecoveredHeartRateSession,
  pauseMoving,
} from "../heartRateSession";

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", storage());
  getPendingWatchHeartRateSamples.mockReset();
  getPendingWatchHeartRateSamples.mockResolvedValue([]);
  getHeartRateSensorSessionSamples.mockReset();
  getHeartRateSensorSessionSamples.mockResolvedValue([]);
  clearHeartRateSensorSessions.mockReset();
  clearHeartRateSensorSessions.mockResolvedValue(undefined);
});
afterEach(() => {
  clearHeartRateSessionsForUser("u1");
  clearHeartRateSessionsForUser("u2");
  vi.unstubAllGlobals();
});

describe("per-session Watch heart rate buffer", () => {
  it("survives a new read, deduplicates Watch retransmission and separates users", () => {
    beginMoving("u1", "run-1", 0);
    const beat = {
      id: "watch-1",
      at: 1_000,
      bpm: 135,
      source: "apple-watch" as const,
    };
    appendHeartRateSample("u1", "run-1", beat);
    appendHeartRateSample("u1", "run-1", beat);
    pauseMoving("u1", "run-1", 10_000);
    expect(JSON.parse(localStorage.getItem(localStorage.key(0)!)!)).toEqual({
      updatedAt: expect.any(Number),
      activeSince: null,
      lastObservedAt: null,
      activeIntervals: [{ startMs: 0, endMs: 10_000 }],
    });
    expect(getHeartRateSession("u1", "run-1")).toEqual({
      samples: [beat],
      activeIntervals: [{ startMs: 0, endMs: 10_000 }],
    });
    expect(getHeartRateSession("u2", "run-1").samples).toEqual([]);
  });

  it("recovers protected native samples after a WebView restart", async () => {
    beginMoving("u1", "run-1", 0);
    pauseMoving("u1", "run-1", 10_000);
    getPendingWatchHeartRateSamples.mockResolvedValue([
      { sessionId: "run-1", sampleId: "a", timestampMs: 1_000, bpm: 135 },
      { sessionId: "other-run", sampleId: "b", timestampMs: 2_000, bpm: 150 },
    ]);
    expect(await getRecoveredHeartRateSession("u1", "run-1")).toEqual({
      samples: [{ id: "a", at: 1_000, bpm: 135, source: "apple-watch" }],
      activeIntervals: [{ startMs: 0, endMs: 10_000 }],
    });
  });

  it("does not fill a process-death gap when a moving run resumes", () => {
    beginMoving("u1", "run-1", 0);
    appendHeartRateSample("u1", "run-1", {
      id: "beat-1",
      at: 2_000,
      bpm: 130,
      source: "apple-watch",
    });
    beginMoving("u1", "run-1", 60_000);
    finishMoving("u1", "run-1", 70_000);
    expect(getHeartRateSession("u1", "run-1").activeIntervals).toEqual([
      { startMs: 0, endMs: 17_000 },
      { startMs: 60_000, endMs: 70_000 },
    ]);
  });

  it("clears only the intended account or run on save, discard and sign-out", () => {
    beginMoving("u1", "a", 0);
    beginMoving("u1", "b", 0);
    beginMoving("u2", "a", 0);
    clearHeartRateSession("u1", "a");
    finishMoving("u1", "b", 10_000);
    expect(getHeartRateSession("u1", "b").activeIntervals).toHaveLength(1);
    clearHeartRateSessionsForUser("u1");
    expect(localStorage.length).toBe(1);
    expect(getHeartRateSession("u2", "a").samples).toEqual([]);
  });
});

describe("per-session sensor heart rate", () => {
  const strap = (id: string, at: number, bpm = 140) => ({
    id,
    at,
    bpm,
    source: "bluetooth" as const,
  });

  it("keeps a sensor's beats beside the Watch's, once each", () => {
    beginMoving("u1", "run-1", 0);
    appendHeartRateSample("u1", "run-1", strap("ble:1", 1_000));
    appendHeartRateSample("u1", "run-1", strap("ble:1", 1_000));
    appendHeartRateSample("u1", "run-1", {
      id: "watch-1",
      at: 2_000,
      bpm: 150,
      source: "apple-watch",
    });
    expect(
      getHeartRateSession("u1", "run-1").samples.map((sample) => sample.id)
    ).toEqual(["ble:1", "watch-1"]);
  });

  it("refuses a beat from a source it does not know", () => {
    beginMoving("u1", "run-1", 0);
    appendHeartRateSample("u1", "run-1", {
      id: "x",
      at: 1_000,
      bpm: 140,
      source: "phone" as never,
    });
    expect(getHeartRateSession("u1", "run-1").samples).toEqual([]);
  });

  it("writes the last reading's time at most every 5 seconds, not every beat", () => {
    beginMoving("u1", "run-1", 0);
    const stored = () =>
      JSON.parse(localStorage.getItem(localStorage.key(0)!)!).lastObservedAt;
    appendHeartRateSample("u1", "run-1", strap("ble:1", 1_000));
    expect(stored()).toBe(1_000);
    appendHeartRateSample("u1", "run-1", strap("ble:2", 2_000));
    appendHeartRateSample("u1", "run-1", strap("ble:3", 5_999));
    expect(stored()).toBe(1_000);
    appendHeartRateSample("u1", "run-1", strap("ble:4", 6_000));
    expect(stored()).toBe(6_000);
    // Every beat is still kept for the summary.
    expect(getHeartRateSession("u1", "run-1").samples).toHaveLength(4);
  });

  it("recovers the readings native kept for the run after a web view reload", async () => {
    beginMoving("u1", "run-1", 0);
    appendHeartRateSample("u1", "run-1", strap("ble:1", 1_000));
    pauseMoving("u1", "run-1", 10_000);
    getHeartRateSensorSessionSamples.mockResolvedValue([
      strap("ble:1", 1_000),
      strap("ble:2", 2_000, 142),
    ]);
    const recovered = await getRecoveredHeartRateSession("u1", "run-1");
    expect(getHeartRateSensorSessionSamples).toHaveBeenCalledWith("run-1");
    expect(recovered.samples).toEqual([
      strap("ble:1", 1_000),
      strap("ble:2", 2_000, 142),
    ]);
  });

  it("drops native's kept readings with the run, and every run's on an account change", () => {
    clearHeartRateSession("u1", "run-1");
    expect(clearHeartRateSensorSessions).toHaveBeenCalledWith("run-1");
    clearHeartRateSessionsForUser("u1");
    expect(clearHeartRateSensorSessions).toHaveBeenLastCalledWith(undefined);
  });
});
