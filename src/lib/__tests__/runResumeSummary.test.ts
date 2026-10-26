// @vitest-environment jsdom — reads and writes local storage.
/**
 * Home's and Train's In progress strip read the stored run without its
 * trail (`readStoredRunSummary`): the small META record only, with no
 * side effects, so judging and discarding a broken trail stays the run
 * page's job (`readStoredRun`).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  readStoredRun,
  readStoredRunSummary,
  writeStoredRun,
  RUN_RESUME_MAX_AGE_MS,
  RUN_RESUME_SCHEMA_VERSION,
  type StoredRun,
} from "../runResumeStorage";
import { freeformPlanMetadata } from "../runPlanMetadata";

const UID = "user-A";

function snapshot(extra: Partial<StoredRun> = {}): StoredRun {
  return {
    v: RUN_RESUME_SCHEMA_VERSION,
    config: {
      activityType: "easy",
      autoPause: true,
      audioCues: true,
      audioCueFrequency: "every_km",
      paceAlerts: true,
      voiceRate: 0.9,
      displayStats: ["pace", "distance", "time"],
      target: { type: "none" },
      planMetadata: freeformPlanMetadata("freeform"),
    },
    startedAt: 1_000_000,
    accumulatedSeconds: 120,
    isRunning: false,
    points: Array.from({ length: 300 }, (_, i) => ({
      lat: 51.5 + i * 1e-5,
      lng: -0.1,
      timestamp: 1_000_000 + i * 1000,
      accuracy: 5,
    })) as unknown as StoredRun["points"],
    lastWriteAt: 2_000_000,
    phase: "paused",
    ...extra,
  };
}

function storageCopy(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    out[key] = localStorage.getItem(key)!;
  }
  return out;
}

beforeEach(() => {
  localStorage.clear();
});

describe("readStoredRunSummary", () => {
  it("reads the run without its trail, and changes nothing", () => {
    const run = snapshot();
    expect(writeStoredRun(UID, run)).toBe(true);
    const before = storageCopy();
    const summary = readStoredRunSummary(UID, run.lastWriteAt);
    expect(summary).toMatchObject({
      accumulatedSeconds: 120,
      phase: "paused",
      isRunning: false,
      startedAt: run.startedAt,
      config: { activityType: "easy" },
    });
    expect(summary).not.toHaveProperty("points");
    expect(storageCopy()).toEqual(before);
  });

  it("reads nothing past the six-hour cutoff, for another account, or with none stored", () => {
    const run = snapshot();
    writeStoredRun(UID, run);
    expect(
      readStoredRunSummary(UID, run.lastWriteAt + RUN_RESUME_MAX_AGE_MS + 1)
    ).toBeNull();
    expect(readStoredRunSummary("user-B", run.lastWriteAt)).toBeNull();
    expect(readStoredRunSummary("", run.lastWriteAt)).toBeNull();
    // The cutoff read discarded nothing: the run page still judges it.
    expect(readStoredRun(UID, run.lastWriteAt)).not.toBeNull();
  });
});
