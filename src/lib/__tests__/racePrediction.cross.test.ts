// @vitest-environment jsdom
/**
 * The goal race, client and server (ADR-0008: pin the running copies).
 *
 * 1. Which run is the goal race. The app keeps the predictions on a run by
 *    `isGoalRaceRun`; the server starts the recovery weeks on the run its
 *    race-day rule accepts (`functions/lib/raceDayCompletion.js`,
 *    `isStrictRaceRun`, on the race's date). If the two drift, a race the
 *    plan counts as run keeps no comparison, or a run the plan does not
 *    count keeps one.
 * 2. What the report reads. The operator report
 *    (`functions/scripts/report-race-predictions.js`) scores the record the
 *    app saves on the run (`runDocument`); if the shape drifts, the report
 *    reads nothing and says so only as zero races.
 */
import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));

import {
  GOAL_RACE_DISTANCE_RATIO,
  goalRaceRecord,
  isGoalRaceRun,
  nextRacePredictionLog,
  racePredictionResult,
  type GoalRace,
} from "../racePrediction";
import { runDocument, type FinishedRun } from "../runCompletion";

const require_ = createRequire(import.meta.url);
const server = require_("../../../functions/lib/raceDayCompletion") as {
  RACE_STRICT_DISTANCE_RATIO: number;
  PLANNED_RACE_DISTANCE_METERS: Record<string, number>;
  plannedDistanceFor: (distance: string) => number;
  isStrictRaceRun: (run: unknown, plannedMeters: number) => boolean;
};
const report = require_(
  "../../../functions/scripts/report-race-predictions"
) as {
  goalRaceEntry: (run: unknown) => {
    distance: string;
    ranS: number;
    predictions: {
      predictedS: number;
      weeksDone: number | null;
      planWeeks: number | null;
    }[];
  } | null;
  percentError: (predictedS: number, ranS: number) => number;
};

const RACE_DAY = "2027-03-28";

describe("the goal race: the app and the server's race-day rule agree", () => {
  it("has the server's ratio", () => {
    expect(GOAL_RACE_DISTANCE_RATIO).toBe(server.RACE_STRICT_DISTANCE_RATIO);
  });

  const distances = ["5k", "10k", "half", "marathon"] as const;
  const shares = [0, 0.3, 0.9499, 0.95, 0.9501, 1, 1.04, 1.3];
  const flags = [
    {},
    { isInvalid: true },
    { savedAnyway: true },
    { isInvalid: false, savedAnyway: false },
  ];
  const days = [RACE_DAY, "2027-03-27", "2027-03-29"];

  it.each(distances)(
    "answers the same for every %s run on and around race day",
    (distance) => {
      const goal: GoalRace = { distance, targetDate: RACE_DAY };
      const planned = server.plannedDistanceFor(distance);
      expect(planned).toBe(server.PLANNED_RACE_DISTANCE_METERS[distance]);
      let accepted = 0;
      for (const share of shares)
        for (const extra of flags)
          for (const date of days) {
            const run = { date, distance: planned * share, ...extra };
            const serverSays =
              run.date === goal.targetDate &&
              server.isStrictRaceRun(run, planned);
            expect(isGoalRaceRun(run, goal), JSON.stringify(run)).toBe(
              serverSays
            );
            if (serverSays) accepted++;
          }
      // Anchor: some runs were the race, so the agreement is not all "no".
      expect(accepted).toBeGreaterThan(0);
    }
  );
});

describe("the record the app saves is the one the report scores", () => {
  const goal: GoalRace = { distance: "10k", targetDate: RACE_DAY };
  const confirmed = {
    benchmark: { distanceM: 5000, timeS: 1500 },
    vdot: null,
    source: "manual",
    pendingConfirmation: false,
  };
  const log = nextRacePredictionLog({
    log: null,
    goal,
    runFitness: confirmed,
    planWeeks: 12,
    todayKey: "2027-01-04",
    now: new Date("2027-01-04T08:00:00"),
  });
  const start = new Date("2027-03-28T09:00:00");
  const finished = (elapsed: number): FinishedRun => ({
    points: [],
    startedAt: start.getTime(),
    distance: 10_040,
    elapsed,
    avgPaceSeconds: elapsed / 10.04,
    calories: 600,
    elevationGain: 20,
    splits: [],
    runConfig: null,
    notes: "",
    relativeEffort: null,
    paceVerdictTone: null,
    isInvalid: false,
    invalidReason: null,
    routeQuality: null,
    shoeId: null,
    bestEfforts: [],
    racePrediction: goalRaceRecord(log, goal, start.getTime()),
  });

  it.each([3000, 3127, 3300])(
    "reads the run's time and predictions, and scores it the way the summary words it (%i s)",
    (elapsed) => {
      const saved = runDocument(
        finished(elapsed),
        new Date(start.getTime() + elapsed * 1000)
      );
      const entry = report.goalRaceEntry(JSON.parse(JSON.stringify(saved)));
      const predicted = log!.snapshots[0].predictedS;
      expect(entry).toEqual({
        distance: "10k",
        targetDate: RACE_DAY,
        ranS: elapsed,
        predictions: [{ predictedS: predicted, weeksDone: 0, planWeeks: 12 }],
      });
      const result = racePredictionResult(
        saved.racePrediction,
        saved.duration
      )!;
      const pct = report.percentError(predicted, entry!.ranS);
      // Slower than predicted is a positive gap and a positive error.
      expect(Math.sign(pct)).toBe(Math.sign(result.gapS));
      expect(pct).toBeCloseTo((100 * result.gapS) / result.actualS, 10);
    }
  );
});
