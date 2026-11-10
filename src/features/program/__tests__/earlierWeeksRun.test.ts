// @vitest-environment jsdom — reads the run stored in local storage.
/**
 * The week rollover waits on a run from an earlier week still on this
 * phone, unsaved (`earlierWeeksRunOnPhone`): one that ran past Sunday
 * midnight, or waits on its summary. Saved, it counts for the week it was
 * started in, so that week must not be weighed without it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearStoredRun,
  RUN_RESUME_SCHEMA_VERSION,
  storedRunClears,
  subscribeStoredRunClears,
  writeStoredRun,
  type StoredRun,
} from "@/lib/runResumeStorage";
import { freeformPlanMetadata } from "@/lib/runPlanMetadata";
import { createRunSessionIdentity } from "@/lib/runSessionIdentity";
import { earlierWeeksRunOnPhone } from "../earlierWeeksRun";

const UID = "user-A";
/** Tuesday; its week began on Monday 9 November. */
const TODAY = "2026-11-10";
const HOUR = 60 * 60 * 1000;
const sundayNight = new Date(2026, 10, 8, 23, 30).getTime();
const mondayMorning = new Date(2026, 10, 9, 7, 0).getTime();

function storedRun(
  startedAt: number,
  extra: Partial<StoredRun> = {}
): StoredRun {
  const config = {
    activityType: "easy",
    autoPause: true,
    audioCues: true,
    audioCueFrequency: "every_km",
    paceAlerts: true,
    voiceRate: 0.9,
    displayStats: ["pace", "distance", "time"],
    target: { type: "none" },
    planMetadata: freeformPlanMetadata("freeform"),
  } as StoredRun["config"];
  return {
    v: RUN_RESUME_SCHEMA_VERSION,
    config,
    identity: createRunSessionIdentity(UID, "run-1", config, startedAt),
    startedAt,
    accumulatedSeconds: 1800,
    isRunning: true,
    points: [],
    lastWriteAt: startedAt + 1800 * 1000,
    phase: "active",
    ...extra,
  };
}

/** A run finished and waiting on its summary. */
function finished(run: StoredRun): StoredRun {
  return {
    ...run,
    phase: "finished",
    isRunning: false,
    finish: {
      finishedAt: run.lastWriteAt,
      distance: 5000,
      elapsed: 1800,
      splits: [],
      elevationGain: 0,
      routeQuality: null,
      workPortion: null,
    },
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("earlierWeeksRunOnPhone", () => {
  it("holds for last Sunday's run still recording, or waiting on its summary", () => {
    const run = storedRun(sundayNight);
    writeStoredRun(UID, run);
    expect(earlierWeeksRunOnPhone(UID, TODAY, run.lastWriteAt + HOUR)).toBe(
      true
    );

    writeStoredRun(UID, finished(run));
    expect(earlierWeeksRunOnPhone(UID, TODAY, run.lastWriteAt + HOUR)).toBe(
      true
    );
  });

  it("does not hold for a run started this week", () => {
    const run = storedRun(mondayMorning);
    writeStoredRun(UID, run);
    expect(earlierWeeksRunOnPhone(UID, TODAY, run.lastWriteAt + HOUR)).toBe(
      false
    );
  });

  it("does not hold once the run is six hours old, though the phone keeps its summary", () => {
    const run = finished(storedRun(sundayNight));
    writeStoredRun(UID, run);
    const later = run.lastWriteAt + 6 * HOUR + 1;
    expect(earlierWeeksRunOnPhone(UID, TODAY, later)).toBe(false);
  });

  it("does not hold with nothing stored, or for another account", () => {
    expect(earlierWeeksRunOnPhone(UID, TODAY)).toBe(false);
    const run = storedRun(sundayNight);
    writeStoredRun(UID, run);
    expect(earlierWeeksRunOnPhone("user-B", TODAY, run.lastWriteAt)).toBe(
      false
    );
  });

  it("dates the run by the day it started where it started", () => {
    // The identity keeps the local day of the start; a phone moved across
    // time zones since reads that day, as the saved run does.
    const run = storedRun(mondayMorning);
    writeStoredRun(UID, {
      ...run,
      identity: { ...run.identity!, startLocalDate: "2026-11-08" },
    });
    expect(earlierWeeksRunOnPhone(UID, TODAY, run.lastWriteAt)).toBe(true);
  });
});

describe("a stored run going away is announced", () => {
  it("once for a run that was there, after the call returns", async () => {
    const heard: number[] = [];
    const stop = subscribeStoredRunClears(() => heard.push(storedRunClears()));
    try {
      const before = storedRunClears();
      clearStoredRun(UID);
      expect(storedRunClears()).toBe(before);

      writeStoredRun(UID, storedRun(sundayNight));
      clearStoredRun(UID);
      expect(heard).toEqual([]);
      await Promise.resolve();
      expect(heard).toEqual([before + 1]);
    } finally {
      stop();
    }
  });
});
