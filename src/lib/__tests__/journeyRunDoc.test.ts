import { describe, expect, it, vi } from "vitest";
import type {
  ProgramState,
  ScheduledRunDay,
} from "@/features/program/programTypes";

/**
 * The E2E journeys save a run they only need to have happened from Node
 * (`e2e/helpers/journeyRunDoc.ts`). The app's builder for the saved run,
 * `runDocument`, lives in `runCompletion.ts`, which starts the Firebase
 * client and can't load there, so the journeys build it with their own
 * copy. This holds the copy to the app's output, so the journeys save what
 * the Run page saves.
 */
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));

import { runDocument, type FinishedRun } from "@/lib/runCompletion";
import {
  journeyRunConfig,
  journeyRunFields,
  type JourneyRun,
} from "../../../e2e/helpers/journeyRunDoc";

const WEEK = "2027-03-01";
function planned(
  id: string,
  date: string,
  dayIndex: number,
  templateId: string,
  type: string
): ScheduledRunDay {
  return {
    id,
    weekKey: WEEK,
    date,
    dayIndex,
    templateId,
    type,
    status: "planned",
  };
}

/** A race plan's build week: quality, a medium-long, strides, the long
 *  run. */
const runDays = [
  planned("r-tempo", "2027-03-02", 2, "tempo_30", "tempo"),
  planned("r-easy", "2027-03-03", 3, "easy_50", "easy"),
  planned("r-strides", "2027-03-04", 4, "easy_30_strides", "easy"),
  planned("r-long", "2027-03-06", 6, "long_15k", "long"),
  planned("r-reps", "2027-03-07", 0, "5x1k", "intervals"),
];
const plan: Pick<ProgramState, "runPlan" | "runDays"> = {
  runDays,
  runPlan: {
    mode: "race_prep",
    raceGoal: { distance: "marathon", targetDate: "2027-10-17" },
    totalWeeks: 53,
    currentWeek: 20,
  },
};

function journeyRun(run: ScheduledRunDay, km: number, minutes: number) {
  return {
    run,
    plan,
    runMode: "race_prep",
    finishedAt: new Date(`${run.date}T08:30:00`),
    distance: km * 1000,
    duration: minutes * 60,
  } satisfies JourneyRun;
}

/** The finish screen's run for the same run: no trace, nothing edited. */
function finished(input: JourneyRun): FinishedRun {
  const runConfig = journeyRunConfig(input);
  return {
    points: [],
    distance: input.distance,
    elapsed: input.duration,
    avgPaceSeconds: input.duration / (input.distance / 1000),
    calories: 0,
    elevationGain: 0,
    splits: [],
    runConfig,
    intervalData: runConfig.intervals,
    notes: "",
    relativeEffort: null,
    paceVerdictTone: null,
    isInvalid: false,
    invalidReason: null,
    routeQuality: null,
    shoeId: null,
    bestEfforts: [],
  };
}

describe("a journey's run is saved as the Run page saves it", () => {
  it.each([
    ["a tempo", runDays[0], 8, 45],
    ["an easy run", runDays[1], 8.3, 50],
    ["strides", runDays[2], 5, 30],
    ["the long run", runDays[3], 15, 95],
    ["intervals", runDays[4], 7, 35],
  ])("%s", (_name, run, km, minutes) => {
    const input = journeyRun(run, km, minutes);
    const app = runDocument(finished(input), input.finishedAt);
    expect(journeyRunFields(input)).toEqual({
      ...app,
      startedAt: app.startedAt.toDate(),
      completedAt: app.completedAt.toDate(),
    });
  });

  it("is the planned run, on its day, as planned", () => {
    const input = journeyRun(runDays[3], 15, 95);
    const saved = journeyRunFields(input);
    expect(saved.scheduledRunId).toBe("r-long");
    expect(saved.date).toBe("2027-03-06");
    expect(saved.activityType).toBe("long");
    expect(saved.plannedTemplateId).toBe("long_15k");
    expect(saved.matchedPlanExact).toBe(true);
    expect(saved.offPlan).toBe(false);
  });
});
