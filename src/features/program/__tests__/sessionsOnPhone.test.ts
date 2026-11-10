// @vitest-environment jsdom — reads the run stored in local storage.
/**
 * The week rollover waits on a session still on this phone: a run from an
 * earlier week, unsaved (`earlierWeeksRunOnPhone`), one that ran past
 * Sunday midnight or waits on its summary; and a lift from the plan's week
 * the app was closed partway through (`planWeeksLiftOnPhone`), which a
 * rolled week no longer offers to resume.
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
import {
  earlierWeeksRunOnPhone,
  planWeeksLiftOnPhone,
} from "../sessionsOnPhone";
import { programmeDraftIdentity, sessionDayContext } from "../sessionDay";
import type { ProgramState } from "../programTypes";

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

describe("planWeeksLiftOnPhone", () => {
  const plan = {
    weekNumber: 3,
    workouts: [
      { dayName: "Upper", dayType: "push", completed: true, exercises: [] },
      {
        dayName: "Lower",
        dayType: "legs",
        completed: false,
        exercises: [
          {
            instanceId: "lower-squat",
            exerciseId: "barbell-squat",
            name: "Barbell Squat",
            sets: 3,
            reps: 5,
            weight: 100,
            progressionType: "linear",
          },
        ],
      },
    ],
  } as unknown as ProgramState;
  const context = sessionDayContext(null, null);
  const NOW = Date.now();

  function storeDraft(
    weekNumber: number,
    savedAt: number,
    completed: boolean
  ): void {
    const identity = programmeDraftIdentity(
      plan.workouts[1],
      1,
      weekNumber,
      "full",
      context
    );
    localStorage.setItem(
      `tropos_workout_draft:v2:${UID}:${encodeURIComponent(identity)}`,
      JSON.stringify({
        dayIndex: 1,
        dayName: "Lower",
        setLogs: [
          [
            { reps: 5, weight: 100, completed, type: "working" },
            { reps: 5, weight: 100, completed: false, type: "working" },
            { reps: 5, weight: 100, completed: false, type: "working" },
          ],
        ],
        exerciseNotes: {},
        elapsedSeconds: 900,
        currentExIndex: 0,
        savedAt,
        identity,
        completionId: "lower-draft",
        completionCommandId: "lower-draft",
      })
    );
  }

  it("holds for the plan week's lift with a set done, saved in the last six hours", () => {
    storeDraft(3, NOW - HOUR, true);
    expect(planWeeksLiftOnPhone(UID, plan, context, NOW)).toBe(true);
  });

  it("does not hold with no set done, past six hours, or for another week", () => {
    storeDraft(3, NOW - HOUR, false);
    expect(planWeeksLiftOnPhone(UID, plan, context, NOW)).toBe(false);

    localStorage.clear();
    storeDraft(3, NOW - 6 * HOUR - 1, true);
    expect(planWeeksLiftOnPhone(UID, plan, context, NOW)).toBe(false);

    localStorage.clear();
    storeDraft(2, NOW - HOUR, true);
    expect(planWeeksLiftOnPhone(UID, plan, context, NOW)).toBe(false);
  });

  it("does not hold for a day already done", () => {
    storeDraft(3, NOW - HOUR, true);
    const done = {
      ...plan,
      workouts: plan.workouts.map((d, i) =>
        i === 1 ? { ...d, completed: true } : d
      ),
    };
    expect(planWeeksLiftOnPhone(UID, done, context, NOW)).toBe(false);
  });
});
