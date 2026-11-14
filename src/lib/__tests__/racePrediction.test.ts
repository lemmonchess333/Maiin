/**
 * The goal race's prediction: recorded as the plan runs, kept on the race
 * run, and compared with the time run (`racePrediction.ts`). Pure, so the
 * days are passed in.
 */
import { describe, expect, it } from "vitest";
import {
  goalRaceRecord,
  isGoalRaceRun,
  MAX_RACE_PREDICTIONS,
  nextRacePredictionLog,
  parseGoalRaceRecord,
  parseRacePredictionLog,
  racePredictionResult,
  racePredictionWords,
  type GoalRace,
  type RacePredictionLog,
  type RacePredictionSnapshot,
} from "../racePrediction";
import { predictedRaceTimesFromFitness } from "../runPaces";

/** A 10K twelve weeks out, counted from a Monday: race week is the plan's
 *  twelfth. */
const PLAN_DAY = "2027-01-04";
const RACE_DAY = "2027-03-28";
const goal: GoalRace = { distance: "10k", targetDate: RACE_DAY };

const confirmed = {
  benchmark: { distanceM: 5000, timeS: 1500 },
  vdot: null,
  source: "manual",
  pendingConfirmation: false,
};
const faster = {
  benchmark: { distanceM: 5000, timeS: 1440 },
  vdot: null,
  source: "race",
  pendingConfirmation: false,
};
const tenKFrom = (f: typeof confirmed) =>
  predictedRaceTimesFromFitness(f)!["10k"];

function at(day: string): Date {
  return new Date(`${day}T08:00:00`);
}

function step(
  log: RacePredictionLog | null,
  day: string,
  fitness = confirmed,
  raceGoal: GoalRace | null = goal
) {
  return nextRacePredictionLog({
    log,
    goal: raceGoal,
    runFitness: fitness,
    planWeeks: 12,
    todayKey: day,
    now: at(day),
  });
}

describe("recording the prediction while the plan runs", () => {
  it("records the first prediction when the plan is made, in its week 0", () => {
    const log = step(null, PLAN_DAY);
    expect(log).toMatchObject({
      v: 1,
      distance: "10k",
      targetDate: RACE_DAY,
    });
    expect(log!.snapshots).toEqual([
      {
        at: at(PLAN_DAY).toISOString(),
        reason: "first",
        predictedS: tenKFrom(confirmed),
        vdot: expect.any(Number),
        source: "manual",
        weeksDone: 0,
        planWeeks: 12,
        daysToRace: 83,
      },
    ]);
    // The 5K in 25:00 predicts the 10K by Riegel: 25:00 x 2^1.06.
    expect(log!.snapshots[0].predictedS).toBe(3127);
  });

  it("records nothing more while the prediction stands", () => {
    const log = step(null, PLAN_DAY);
    expect(step(log, "2027-01-20")).toBeNull();
  });

  it("records a pace update, with the plan's weeks done that day", () => {
    const log = step(null, PLAN_DAY);
    const next = step(log, "2027-02-03", faster);
    expect(next!.snapshots).toHaveLength(2);
    expect(next!.snapshots[1]).toMatchObject({
      reason: "changed",
      predictedS: tenKFrom(faster),
      source: "race",
      // Wednesday of the plan's fifth week.
      weeksDone: 4,
      daysToRace: 53,
    });
  });

  it("records the prediction going into race week once, changed or not", () => {
    const log = step(null, PLAN_DAY);
    const raceWeek = step(log, "2027-03-23");
    expect(raceWeek!.snapshots.at(-1)).toMatchObject({
      reason: "race-week",
      predictedS: tenKFrom(confirmed),
      weeksDone: 11,
      daysToRace: 5,
    });
    expect(step(raceWeek, "2027-03-25")).toBeNull();
    // A change in race week after it is still a change.
    expect(step(raceWeek, "2027-03-25", faster)!.snapshots.at(-1)!.reason).toBe(
      "changed"
    );
  });

  it("a pace update in race week is the race week's prediction", () => {
    const log = step(null, PLAN_DAY);
    const next = step(log, "2027-03-22", faster);
    expect(next!.snapshots.at(-1)).toMatchObject({
      reason: "race-week",
      predictedS: tenKFrom(faster),
    });
  });

  it("records nothing on race day or after, so paces taken from the race never count", () => {
    const log = step(null, PLAN_DAY);
    expect(step(log, RACE_DAY, faster)).toBeNull();
    expect(step(log, "2027-03-29", faster)).toBeNull();
    expect(step(null, RACE_DAY)).toBeNull();
  });

  it("predicts nothing from a benchmark the runner has not confirmed", () => {
    expect(
      step(null, PLAN_DAY, { ...confirmed, pendingConfirmation: true })
    ).toBeNull();
    expect(
      nextRacePredictionLog({
        log: null,
        goal,
        runFitness: null,
        planWeeks: 12,
        todayKey: PLAN_DAY,
        now: at(PLAN_DAY),
      })
    ).toBeNull();
  });

  it("first paces after a time trial are the first prediction, in the week they came", () => {
    const next = step(null, "2027-01-13");
    expect(next!.snapshots[0]).toMatchObject({ reason: "first", weeksDone: 1 });
  });

  it("starts a new log for another race", () => {
    const log = step(null, PLAN_DAY);
    const other: GoalRace = { distance: "half", targetDate: "2027-05-02" };
    const next = step(log, "2027-01-20", confirmed, other);
    expect(next).toMatchObject({ distance: "half", targetDate: "2027-05-02" });
    expect(next!.snapshots).toHaveLength(1);
    expect(next!.snapshots[0].reason).toBe("first");
  });

  it("reads a lead-in week, before the plan's first week, as week 0", () => {
    // The Thursday before the plan's first Monday.
    const next = step(null, "2026-12-31");
    expect(next!.snapshots[0].weeksDone).toBe(0);
  });

  it("has no weeks for a plan with no length, and no record without a goal", () => {
    const next = nextRacePredictionLog({
      log: null,
      goal,
      runFitness: confirmed,
      planWeeks: undefined,
      todayKey: PLAN_DAY,
      now: at(PLAN_DAY),
    });
    expect(next!.snapshots[0]).toMatchObject({
      weeksDone: null,
      planWeeks: null,
    });
    expect(step(null, PLAN_DAY, confirmed, null)).toBeNull();
    expect(
      step(null, PLAN_DAY, confirmed, { distance: "50k", targetDate: RACE_DAY })
    ).toBeNull();
  });

  it("keeps the first prediction and the latest when the log is full", () => {
    const snapshot = (i: number): RacePredictionSnapshot => ({
      at: new Date(Date.UTC(2027, 0, 4, 0, i)).toISOString(),
      reason: i === 0 ? "first" : "changed",
      predictedS: 3000 + i,
      vdot: 40,
      source: "race",
      weeksDone: 0,
      planWeeks: 12,
      daysToRace: 83,
    });
    const full: RacePredictionLog = {
      v: 1,
      distance: "10k",
      targetDate: RACE_DAY,
      snapshots: Array.from({ length: MAX_RACE_PREDICTIONS }, (_, i) =>
        snapshot(i)
      ),
    };
    const next = step(full, "2027-01-20");
    expect(next!.snapshots).toHaveLength(MAX_RACE_PREDICTIONS);
    expect(next!.snapshots[0].predictedS).toBe(3000);
    expect(next!.snapshots[1].predictedS).toBe(3002);
    expect(next!.snapshots.at(-1)!.predictedS).toBe(tenKFrom(confirmed));
  });
});

describe("the goal race", () => {
  const race = { date: RACE_DAY, distance: 10_050, isInvalid: false };

  it("is a valid run on the race's date over 95% of its distance", () => {
    expect(isGoalRaceRun(race, goal)).toBe(true);
    expect(isGoalRaceRun({ ...race, distance: 9500 }, goal)).toBe(true);
    // However it was started: the run carries no type here at all.
    expect(
      isGoalRaceRun(
        { date: RACE_DAY, distance: 42_400 },
        { distance: "marathon", targetDate: RACE_DAY }
      )
    ).toBe(true);
    expect(
      isGoalRaceRun(
        { date: RACE_DAY, distance: 20_043 },
        { distance: "half", targetDate: RACE_DAY }
      )
    ).toBe(true);
  });

  it("is not a shorter run on race day, a run on another day, or a run saved anyway", () => {
    // The warm-up jog before the start.
    expect(isGoalRaceRun({ ...race, distance: 2400 }, goal)).toBe(false);
    expect(isGoalRaceRun({ ...race, distance: 9499 }, goal)).toBe(false);
    // A 10 km run the day before.
    expect(isGoalRaceRun({ ...race, date: "2027-03-27" }, goal)).toBe(false);
    expect(isGoalRaceRun({ ...race, isInvalid: true }, goal)).toBe(false);
    expect(isGoalRaceRun({ ...race, savedAnyway: true }, goal)).toBe(false);
    expect(isGoalRaceRun({ ...race, date: null }, goal)).toBe(false);
    expect(isGoalRaceRun(race, null)).toBe(false);
  });
});

describe("what the race run keeps", () => {
  const log = step(step(null, PLAN_DAY), "2027-02-03", faster)!;

  it("keeps the predictions made before the race started, the goal and its entry", () => {
    const record = goalRaceRecord(
      log,
      { ...goal, entry: "own", targetTimeS: 2999.6 },
      at(RACE_DAY).getTime()
    );
    expect(record).toEqual({
      v: 1,
      distance: "10k",
      targetDate: RACE_DAY,
      entry: "own",
      goalTimeS: 3000,
      predictions: log.snapshots,
    });
  });

  it("leaves out a prediction recorded after the start", () => {
    const record = goalRaceRecord(log, goal, Date.parse("2027-02-01T00:00Z"));
    expect(record!.predictions).toHaveLength(1);
    expect(record!.entry).toBe("race");
    expect(record!.goalTimeS).toBeNull();
  });

  it("has no predictions from another race's log, or none", () => {
    expect(
      goalRaceRecord(log, { distance: "10k", targetDate: "2027-04-04" })!
        .predictions
    ).toEqual([]);
    expect(goalRaceRecord(null, goal)!.predictions).toEqual([]);
  });

  it("reads back what it wrote, and nothing it cannot read", () => {
    const record = goalRaceRecord(log, goal)!;
    expect(parseGoalRaceRecord(JSON.parse(JSON.stringify(record)))).toEqual(
      record
    );
    expect(parseRacePredictionLog(JSON.parse(JSON.stringify(log)))).toEqual(
      log
    );
    expect(parseGoalRaceRecord(null)).toBeNull();
    expect(parseGoalRaceRecord({ v: 2, distance: "10k" })).toBeNull();
    expect(
      parseGoalRaceRecord({
        ...record,
        predictions: [{ at: "nonsense", predictedS: 3000 }, log.snapshots[0]],
      })!.predictions
    ).toEqual([log.snapshots[0]]);
  });
});

describe("the comparison after the race", () => {
  const log = step(step(null, PLAN_DAY), "2027-02-03", faster)!;
  const record = goalRaceRecord(log, goal, at(RACE_DAY).getTime());

  it("sets the time run against the last prediction, and names the first", () => {
    const last = tenKFrom(faster);
    const result = racePredictionResult(record, last - 39.4);
    expect(result).toEqual({
      predictedS: last,
      actualS: last - 39,
      gapS: -39,
      first: { predictedS: tenKFrom(confirmed), weeksDone: 0, planWeeks: 12 },
    });
    expect(racePredictionWords(result!)).toEqual({
      predicted: "50:02",
      ran: "49:23",
      gap: "0:39",
      verdict: "faster",
      first: { time: "52:07", when: " in week 1 of 12" },
    });
  });

  it("says slower, and to the second", () => {
    const last = tenKFrom(faster);
    expect(
      racePredictionWords(racePredictionResult(record, last + 125)!)
    ).toMatchObject({ gap: "2:05", verdict: "slower" });
    expect(
      racePredictionWords(racePredictionResult(record, last)!)
    ).toMatchObject({ gap: null, verdict: "to the second" });
  });

  it("names no first prediction when it never moved", () => {
    const steady = goalRaceRecord(step(null, PLAN_DAY), goal);
    expect(racePredictionResult(steady, 3200)!.first).toBeNull();
  });

  it("has nothing to say without a prediction or a time", () => {
    expect(racePredictionResult(goalRaceRecord(null, goal), 3000)).toBeNull();
    expect(racePredictionResult(record, 0)).toBeNull();
    expect(racePredictionResult(null, 3000)).toBeNull();
  });
});
