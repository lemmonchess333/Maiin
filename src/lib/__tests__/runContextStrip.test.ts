import { describe, it, expect } from "vitest";
import { deriveStrip } from "../runContextStrip";
import { freeformPlanMetadata, type RunPlanMetadata } from "../runPlanMetadata";
import { localDateString } from "../dateHelpers";

/** A race-prep plan's resolved metadata for "today", with overrides. */
function racePrepToday(over: Partial<RunPlanMetadata> = {}): RunPlanMetadata {
  return {
    planMode: "race_prep",
    planSource: "today_plan",
    plannedRunDayIndex: 2,
    plannedTemplateId: "easy_40",
    plannedTemplateType: "easy",
    actualTemplateId: null,
    matchedPlanExact: null,
    matchedPlanType: null,
    offPlan: false,
    planWeekIndex: 2,
    planTotalWeeks: 8,
    scheduledRunId: "runday_x",
    ...over,
  };
}

const racePlan = {
  mode: "race_prep" as const,
  raceGoal: { distance: "10k", targetDate: "2027-01-10" },
  totalWeeks: 8,
  currentWeek: 3,
};

describe("deriveStrip — the programme-context line above the run chooser", () => {
  it("renders nothing for a freeform runner", () => {
    expect(deriveStrip(freeformPlanMetadata("freeform"), undefined)).toBeNull();
  });

  it("rest and completed days name themselves", () => {
    expect(
      deriveStrip(racePrepToday({ planSource: "rest_day" }), racePlan)
    ).toEqual({
      kind: "rest_day",
    });
    expect(
      deriveStrip(racePrepToday({ planSource: "completed_day" }), racePlan)
    ).toEqual({ kind: "completed_day" });
  });

  it("race prep today carries the week label, the distance and the target date", () => {
    expect(deriveStrip(racePrepToday(), racePlan)).toEqual({
      kind: "race_prep_today",
      weekLabel: "Week 3 of 8",
      distanceLabel: "10K",
      targetDate: "2027-01-10",
    });
  });

  it("a URL template with no planned day is an override with no plan context", () => {
    expect(
      deriveStrip(
        racePrepToday({ planSource: "url_template", plannedRunDayIndex: null }),
        racePlan
      )
    ).toBeNull();
  });

  it("an elapsed race plan (folded to manual metadata) reads as elapsed", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const elapsedPlan = {
      ...racePlan,
      raceGoal: { distance: "10k", targetDate: localDateString(yesterday) },
    };
    expect(
      deriveStrip(
        racePrepToday({ planSource: "manual", plannedRunDayIndex: null }),
        elapsedPlan
      )
    ).toEqual({ kind: "race_prep_elapsed" });
  });

  it("race day itself is not elapsed — the strip still says today", () => {
    const todayPlan = {
      ...racePlan,
      raceGoal: { distance: "10k", targetDate: localDateString() },
    };
    const strip = deriveStrip(
      racePrepToday({ planSource: "manual", plannedRunDayIndex: null }),
      todayPlan
    );
    expect(strip?.kind).not.toBe("race_prep_elapsed");
  });

  it("a structured today names the planned template", () => {
    expect(
      deriveStrip(racePrepToday({ planMode: "structured" }), undefined)
    ).toEqual({ kind: "structured_today", todayLabel: "Easy 40" });
  });
});
