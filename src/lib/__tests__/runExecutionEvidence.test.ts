import { describe, expect, it } from "vitest";
import {
  readRunExecutionTarget,
  runEvidenceDate,
  isRunDateKey,
} from "../runExecutionEvidence";
import {
  evaluateEaseWeekNudge,
  evaluatePostEaseBounce,
  type EaseWeekNudgeRun,
} from "../easeWeekNudge";
import { parseRunSummary } from "@/hooks/useRunningStats";
import { computePlanMetadata } from "../runPlanMetadata";

const stored = (extra: Record<string, unknown> = {}) => ({
  planMode: "race_prep",
  planSource: "today_plan",
  matchedPlanExact: true,
  offPlan: false,
  scheduledRunId: "week-three-tuesday",
  activityType: "easy",
  runConfig: { target: { type: "time", value: 1800 } },
  ...extra,
});
const run = (
  id: string,
  date: string,
  extra: Partial<EaseWeekNudgeRun> = {}
): EaseWeekNudgeRun => ({
  id,
  date,
  distance: 1500,
  duration: 600,
  relativeEffort: null,
  executionTarget: { unit: "seconds", value: 1800 },
  ...extra,
});
const evaluate = (runs: EaseWeekNudgeRun[]) =>
  evaluateEaseWeekNudge({
    runs,
    today: "2026-09-13",
    isRacePrep: true,
    phaseSuppressed: false,
    weekAlreadyEased: false,
    fellBehindPending: false,
    dismissedWeekKey: null,
    lastShownAt: null,
  });

describe("saved run target evidence", () => {
  it("recognises an exact scheduled run launched from the real Programme URL path", () => {
    const { metadata, prefill } = computePlanMetadata({
      displayUnit: "km",
      profileRunMode: "race_prep",
      todayDayIndex: 0,
      todayDate: "2026-09-13",
      runPlan: undefined,
      runDays: [
        {
          id: "planned-run",
          date: "2026-09-13",
          dayIndex: 0,
          templateId: "easy_20",
          type: "easy",
          completed: false,
        },
      ],
      urlTemplateId: "easy_20",
      urlScheduledRunId: "planned-run",
      urlType: null,
    });
    expect(metadata).toMatchObject({
      planSource: "url_template",
      matchedPlanExact: true,
      offPlan: false,
    });
    expect(
      readRunExecutionTarget({
        ...metadata,
        activityType: "easy",
        runConfig: prefill,
      })
    ).toEqual({ unit: "seconds", value: 1200 });
  });
  it("reads seconds and metres without unit conversion or template reconstruction", () => {
    expect(readRunExecutionTarget(stored())).toEqual({
      unit: "seconds",
      value: 1800,
    });
    expect(
      readRunExecutionTarget(
        stored({ runConfig: { target: { type: "distance", value: 10000 } } })
      )
    ).toEqual({ unit: "metres", value: 10000 });
    expect(
      readRunExecutionTarget(
        stored({ runConfig: undefined, plannedTemplateId: "easy_30" })
      )
    ).toBeNull();
  });
  it("uses total structured time, never pace or only the work block", () => {
    const segments = [300, 1200, 300].map((seconds) => ({
      target: { kind: "duration", seconds },
    }));
    expect(
      readRunExecutionTarget(
        stored({
          runConfig: { target: { type: "pace", value: 270 }, segments },
        })
      )
    ).toEqual({ unit: "seconds", value: 1800 });
    segments[1] = {
      target: { kind: "distance", meters: 400 },
    } as unknown as (typeof segments)[number];
    expect(
      readRunExecutionTarget(stored({ runConfig: { segments } }))
    ).toBeNull();
  });
  it.each([
    { matchedPlanExact: false },
    { offPlan: true },
    { scheduledRunId: null },
    { planMode: "freeform" },
    { planSource: "url_template", matchedPlanExact: false },
    { planSource: "url_template", scheduledRunId: null },
    { planSource: "completed_day" },
    { activityType: "race" },
    { activityType: "manual" },
    { runConfig: { target: { type: "time", value: "1800" } } },
    { runConfig: { target: { type: "time", value: Infinity } } },
    { runConfig: { target: { type: "time", value: 0 } } },
    {
      runConfig: { segments: "unknown", target: { type: "time", value: 1800 } },
    },
    {
      runConfig: {
        intervals: { reps: 4 },
        target: { type: "time", value: 600 },
      },
    },
  ])("keeps custom, ambiguous and invalid target %# unknown", (extra) => {
    expect(readRunExecutionTarget(stored(extra))).toBeNull();
  });
  it("retains the saved local date and target through the real history mapper", () => {
    const completedAt = new Date(2026, 8, 14, 0, 10);
    const parsed = parseRunSummary(
      "run-a",
      stored({ date: "2026-09-13", completedAt, distance: 1500, duration: 600 })
    )!;
    expect(parsed.executionTarget).toEqual({ unit: "seconds", value: 1800 });
    expect(runEvidenceDate(parsed)).toBe("2026-09-13");
    expect(runEvidenceDate({ completedAt })).toBe("2026-09-14");
    expect(parseRunSummary("bad", { completedAt: new Date(NaN) })).toBeNull();
    expect(isRunDateKey("2026-02-31")).toBe(false);
  });
  it("reads route confidence from the persisted object before evaluating pace", () => {
    const parsed = parseRunSummary(
      "poor",
      stored({
        completedAt: new Date(2026, 8, 12),
        routeQuality: { confidence: "poor" },
        distance: 1500,
        duration: 600,
        activityType: "tempo",
        paceVerdictTone: "slow",
      })
    )!;
    expect(parsed.routeQuality).toBe("poor");
    expect(
      evaluate([
        run("a", "2026-09-12", parsed),
        run("b", "2026-09-11", { ...parsed, id: "b" }),
      ]).show
    ).toBe(false);
  });
});

describe("execution review policy", () => {
  it("two short comparable sessions produce traceable advice; one does not", () => {
    const a = run("a", "2026-09-12");
    const b = run("b", "2026-09-10", {
      executionTarget: { unit: "metres", value: 5000 },
    });
    expect(evaluate([a]).show).toBe(false);
    expect(evaluate([a, b])).toEqual({
      show: true,
      trigger: "short_sessions",
      shortCount: 2,
      comparedCount: 2,
      windowDays: 10,
      policyVersion: "run-execution-v1",
      evidence: [
        { id: "a", date: a.date, actual: 600, target: a.executionTarget },
        { id: "b", date: b.date, actual: 1500, target: b.executionTarget },
      ],
    });
  });
  it("a corrected, removed or duplicated session cannot sustain the trigger", () => {
    const a = run("a", "2026-09-12");
    expect(evaluate([a, { ...a }]).show).toBe(false);
    expect(evaluate([a, run("b", "2026-09-10", { duration: 1800 })]).show).toBe(
      false
    );
    expect(evaluate([]).show).toBe(false);
  });
  it.each([
    { isInvalid: true },
    { savedAnyway: true },
    { duration: NaN },
    { distance: Infinity },
    { executionTarget: null },
    { date: "2026-09-14" },
    { date: "2026-08-30" },
    { date: "2026-02-31" },
    { duration: 1260 },
  ])(
    "does not build a pattern from ineligible/unknown or at-floor evidence %#",
    (extra) => {
      expect(
        evaluate([run("a", "2026-09-12"), run("b", "2026-09-10", extra)]).show
      ).toBe(false);
    }
  );
  it("uses precise same-day ordering before selecting the last three", () => {
    const runs = [1, 2, 3, 4, 5].map((index) =>
      run(String(index), "2026-09-12", {
        completedAtMs: index * 1000,
        duration: index <= 2 ? 600 : 1800,
      })
    );
    expect(evaluate(runs).show).toBe(false);
    expect(evaluate(runs.reverse()).show).toBe(false);
  });
  it("user-authored harder ratings still win over a shortfall inference", () => {
    expect(
      evaluate([
        run("a", "2026-09-12", { relativeEffort: "harder" }),
        run("b", "2026-09-10", { relativeEffort: "harder" }),
      ])
    ).toMatchObject({ trigger: "harder_ratings" });
  });
  it("cannot turn a fast or invalid tempo into an inside-window recovery claim", () => {
    const base = { today: "2026-09-13", easedWeekKey: "2026-08-31" };
    const tempo = run("tempo", "2026-09-12", {
      activityType: "tempo",
      paceVerdictTone: "fast",
    });
    expect(evaluatePostEaseBounce({ ...base, runs: [tempo] })).toBe(
      "above_window"
    );
    expect(
      evaluatePostEaseBounce({ ...base, runs: [{ ...tempo, isInvalid: true }] })
    ).toBeNull();
    expect(
      evaluatePostEaseBounce({
        ...base,
        runs: [{ ...tempo, routeQuality: "poor" }],
      })
    ).toBeNull();
  });
  it("keeps the previous calendar week after the spring daylight-saving change", () => {
    const previousZone = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      expect(new Date(2026, 2, 9).getTimezoneOffset()).toBe(240);
      expect(
        evaluatePostEaseBounce({
          today: "2026-03-09",
          easedWeekKey: "2026-03-02",
          runs: [
            run("tempo", "2026-03-09", {
              activityType: "tempo",
              paceVerdictTone: "on",
            }),
          ],
        })
      ).toBe("recovered");
    } finally {
      if (previousZone === undefined) delete process.env.TZ;
      else process.env.TZ = previousZone;
    }
  });
});
