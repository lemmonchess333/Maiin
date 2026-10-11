import { describe, expect, it } from "vitest";
import { plannedRunVerdict, workPaceSeconds } from "@/lib/plannedRunVerdict";
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

/* Phase 5a: a tempo is judged by its blocks. The whole run's average
   carries the warm-up and cool-down, so a tempo held at its pace read
   slow, and the slow tones fed the "Take this week easier?" nudge. */
describe("plannedRunVerdict — a tempo judged by its work", () => {
  const tempo = resolveSessionPaces("tempo", TABLE);
  const tempoTarget = tempo.targetPace ?? tempo.workPace!;
  const easy = resolveSessionPaces("easy", TABLE).band!;
  const judge = (
    templateId: string,
    avgPaceSeconds: number,
    work: number | null
  ) =>
    plannedRunVerdict({
      planMetadata: planned(templateId),
      avgPaceSeconds,
      workPaceSeconds: work,
      distance: 7000,
      runFitness: FITNESS,
      unit: "km",
    });

  it("calls a tempo held at its pace on target, however slow the whole run", () => {
    // The warm-up and cool-down make the whole run 40 s a km slower.
    expect(judge("tempo_20", tempoTarget + 40, null)?.tone).toBe("slow");
    expect(judge("tempo_20", tempoTarget + 40, tempoTarget)?.tone).toBe("on");
  });

  it("still calls a tempo slow when the blocks were slow", () => {
    expect(judge("tempo_20", tempoTarget + 60, tempoTarget + 30)?.tone).toBe(
      "slow"
    );
  });

  it("judges an easy run by the whole run, whatever its strides ran", () => {
    const mid = (easy[0] + easy[1]) / 2;
    expect(judge("easy_30", mid, easy[0] - 90)?.tone).toBe("on");
  });
});

/* A goal-pace tempo (race build and taper) runs its blocks at the goal
   race pace, which for a marathoner sits well past the threshold window:
   this 25-minute 5K runner's marathon pace is 20-odd s a km slower. */
describe("plannedRunVerdict — a goal-pace tempo judged against its goal", () => {
  const goalPace = TABLE.race.marathon;
  const judge = (work: number, pinned: number | null) =>
    plannedRunVerdict({
      planMetadata: planned("tempo_30"),
      avgPaceSeconds: work + 30,
      workPaceSeconds: work,
      pinnedPaceSeconds: pinned,
      distance: 8000,
      runFitness: FITNESS,
      unit: "km",
    });

  it("calls a goal-pace tempo held at the goal pace on target", () => {
    expect(goalPace - TABLE.threshold[1]).toBeGreaterThan(10);
    // Against the threshold window, as before, it read slow.
    expect(judge(goalPace, null)?.tone).toBe("slow");
    expect(judge(goalPace, goalPace)?.tone).toBe("on");
  });

  it("still calls it slow or fast off the goal pace", () => {
    expect(judge(goalPace + 20, goalPace)?.tone).toBe("slow");
    expect(judge(goalPace - 20, goalPace)?.tone).toBe("fast");
  });

  it("leaves every other session to its own target", () => {
    const easy = resolveSessionPaces("easy", TABLE).band!;
    const mid = (easy[0] + easy[1]) / 2;
    expect(
      plannedRunVerdict({
        planMetadata: planned("easy_30"),
        avgPaceSeconds: mid,
        pinnedPaceSeconds: mid - 60,
        distance: 5000,
        runFitness: FITNESS,
        unit: "km",
      })?.tone
    ).toBe("on");
  });
});

describe("workPaceSeconds", () => {
  it("is the work's pace a km", () => {
    expect(workPaceSeconds({ seconds: 1200, meters: 4000 })).toBe(300);
  });

  it("is none for too little work to judge, or none recorded", () => {
    expect(workPaceSeconds({ seconds: 59, meters: 1000 })).toBeNull();
    expect(workPaceSeconds({ seconds: 300, meters: 399 })).toBeNull();
    expect(workPaceSeconds(null)).toBeNull();
    expect(workPaceSeconds(undefined)).toBeNull();
  });
});
