import { describe, expect, it } from "vitest";
import { plannedRunVerdict } from "@/lib/plannedRunVerdict";
import { paceTableFromFitness, resolveSessionPaces } from "@/lib/runPaces";
import type { RunPlanMetadata } from "@/lib/runPlanMetadata";

/** A 25-minute 5K. */
const FITNESS = {
  benchmark: { distanceM: 5000, timeS: 1500 },
  vdot: null,
};
const TABLE = paceTableFromFitness(FITNESS)!;

/** A run that did its planned session. */
function planned(templateId: string): RunPlanMetadata {
  return {
    planMode: "race_prep",
    planSource: "today_plan",
    plannedRunDayIndex: 2,
    plannedTemplateId: templateId,
    plannedTemplateType: null,
    actualTemplateId: templateId,
    matchedPlanExact: true,
    matchedPlanType: true,
    offPlan: false,
    planWeekIndex: 3,
    planTotalWeeks: 12,
    scheduledRunId: "run-day-1",
  };
}

const verdict = (
  planMetadata: RunPlanMetadata | null,
  avgPaceSeconds: number,
  distance = 6000,
  runFitness: typeof FITNESS | null = FITNESS
) =>
  plannedRunVerdict({
    planMetadata,
    avgPaceSeconds,
    distance,
    runFitness,
    unit: "km",
  });

describe("plannedRunVerdict", () => {
  const easy = resolveSessionPaces("easy", TABLE).band!;
  const tempo = resolveSessionPaces("tempo", TABLE);
  const tempoTarget = tempo.targetPace ?? tempo.workPace!;

  it("calls an easy run inside its window on target", () => {
    expect(verdict(planned("easy_30"), (easy[0] + easy[1]) / 2)?.tone).toBe(
      "on"
    );
  });

  it("tells an easy run well under its window to keep the easy days easy", () => {
    expect(verdict(planned("easy_30"), easy[0] - 30)?.tone).toBe(
      "easy-too-fast"
    );
  });

  it("calls a tempo well over its pace slow", () => {
    expect(verdict(planned("tempo_20"), tempoTarget + 30)?.tone).toBe("slow");
  });

  it("judges only a run that did its planned session", () => {
    const pace = (easy[0] + easy[1]) / 2;
    expect(
      verdict({ ...planned("easy_30"), matchedPlanExact: false }, pace)
    ).toBeNull();
    expect(verdict({ ...planned("easy_30"), offPlan: true }, pace)).toBeNull();
    expect(verdict(null, pace)).toBeNull();
  });

  it("leaves intervals unjudged: their average mixes work and rest", () => {
    expect(verdict(planned("4x1k"), 300)).toBeNull();
  });

  it("says nothing without a pace to judge against or a run to judge", () => {
    const pace = (easy[0] + easy[1]) / 2;
    expect(verdict(planned("easy_30"), pace, 6000, null)).toBeNull();
    expect(verdict(planned("easy_30"), pace, 400)).toBeNull();
    expect(verdict(planned("easy_30"), 0)).toBeNull();
  });
});
