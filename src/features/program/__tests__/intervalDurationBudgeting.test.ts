import { describe, expect, it } from "vitest";
import { RUN_TEMPLATES, type RunTemplate } from "@/lib/workoutTemplates";
import { segmentsFromIntervals } from "@/lib/runSegments";
import {
  planningIntervalPaceSPerKm,
  prescriptivePaceTableFromFitness,
  resolveSessionPaces,
  type RunFitnessInput,
} from "@/lib/runPaces";
import { generateSchedule } from "@/lib/scheduleUtils";
import { generateRacePlanV2, type RacePlanV2Input } from "../runScheduler";
import { fitRunToTimeLimit, plannedRunMinutes } from "../runTimeLimits";
import { fitWeekToRunningBaseline, type RunningBaseline } from "../runningBaseline";
import type { ScheduledRunDay } from "../programTypes";

function template(id: string): RunTemplate {
  const found = RUN_TEMPLATES.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing fixture template: ${id}`);
  return found;
}

const row = (id = "4x1k"): ScheduledRunDay => ({
  dayIndex: 2,
  templateId: id,
  type: template(id).type,
  status: "planned",
});

/** Independent clock: use the same ordered segments the player executes,
 * rather than asserting plannedRunMinutes against itself. */
function segmentMinutes(t: RunTemplate, easyPace: number, intervalPace: number) {
  if (t.config.intervals) {
    return segmentsFromIntervals(t.config.intervals, "km").reduce(
      (seconds, segment) =>
        seconds +
        (segment.target.kind === "duration"
          ? segment.target.seconds
          : (segment.target.meters / 1000) * intervalPace),
      0
    ) / 60;
  }
  if (t.type === "long" && t.config.targetDistanceKm) {
    return (t.config.targetDistanceKm * easyPace) / 60;
  }
  return t.estimatedDuration;
}

const baseline: RunningBaseline = {
  version: 1,
  experience: "regular",
  weeklyMinutes: 140,
  longestRunMinutes: 60,
  confirmedAt: "2026-09-07",
  source: "self_reported",
};

const planInput: RacePlanV2Input = {
  weekSchedule: generateSchedule(2, 4),
  raceGoal: { distance: "marathon", targetDate: "2026-12-06" },
  currentDate: "2026-09-07",
  weekStart: "2026-09-07",
  weeklyRunDays: 4,
  recentLayoff: "none",
  planTotalWeeks: 27,
  easyPaceSPerKm: 420,
  intervalPaceSPerKm: 300,
};

describe("interval duration budgeting", () => {
  it("pins independent elapsed-time examples, including all fixed parts", () => {
    expect(plannedRunMinutes(template("4x1k"), 600, 300)).toBe(34.5);
    expect(plannedRunMinutes(template("5x1k"), 600, 300)).toBe(41);
    expect(plannedRunMinutes(template("6x1k"), 600, 360)).toBe(53.5);
    expect(plannedRunMinutes(template("8x400"), 600, 300)).toBe(33);
  });

  it("matches the executable segment structure at several interval paces", () => {
    for (const id of ["4x1k", "5x1k", "6x1k", "8x400"]) {
      for (const pace of [180, 210, 240, 300, 360, 480]) {
        expect(plannedRunMinutes(template(id), 600, pace)).toBeCloseTo(
          segmentMinutes(template(id), 600, pace),
          10
        );
      }
    }
  });

  it("does not substitute easy pace when interval pace is absent or invalid", () => {
    for (const pace of [undefined, null, 0, -1, NaN, Infinity]) {
      expect(plannedRunMinutes(template("4x1k"), 600, pace)).toBe(29);
    }
  });

  it("does not add a recovery after a single repetition", () => {
    const single: RunTemplate = {
      ...template("4x1k"),
      config: { intervals: { reps: 1, workDistance: 1000, restDuration: 90 } },
    };
    expect(plannedRunMinutes(single, null, 300)).toBe(5);
  });

  it("counts timed work without needing a fitness benchmark", () => {
    const timed: RunTemplate = {
      ...template("4x1k"),
      config: {
        intervals: {
          reps: 4,
          workDuration: 180,
          restDuration: 90,
          warmupDuration: 300,
          cooldownDuration: 300,
        },
      },
    };
    expect(plannedRunMinutes(timed)).toBe(26.5);
    expect(plannedRunMinutes(timed)).toBe(segmentMinutes(timed, 420, 300));
  });

  it("uses the distance target when both targets are present, like the player", () => {
    const mixed: RunTemplate = {
      ...template("4x1k"),
      config: {
        intervals: { ...template("4x1k").config.intervals!, workDuration: 1 },
      },
    };
    expect(plannedRunMinutes(mixed, null, 300)).toBe(34.5);
  });

  it("keeps malformed interval data out of budget arithmetic", () => {
    for (const patch of [
      { reps: 0 },
      { reps: 1.5 },
      { reps: Infinity },
      { restDuration: -1 },
      { warmupDuration: NaN },
    ]) {
      const malformed: RunTemplate = {
        ...template("4x1k"),
        config: { intervals: { ...template("4x1k").config.intervals!, ...patch } },
      };
      expect(plannedRunMinutes(malformed, null, 300)).toBe(29);
    }
  });

  it("uses the same confirmed interval pace as the launch resolver", () => {
    const fitness: RunFitnessInput = { benchmark: null, vdot: 40 };
    expect(planningIntervalPaceSPerKm(fitness)).toBe(
      resolveSessionPaces("intervals", prescriptivePaceTableFromFitness(fitness))
        .workPace
    );
    expect(planningIntervalPaceSPerKm({ ...fitness, pendingConfirmation: true }))
      .toBeNull();
    expect(planningIntervalPaceSPerKm(null)).toBeNull();
  });

  it("cannot fit 34.5 minutes into a 30-minute limit", () => {
    const original = row();
    const fitted = fitRunToTimeLimit(
      original,
      { sessionMinutes: 30, longRunMinutes: null },
      420,
      300
    );
    expect(fitted.templateId).toBe("easy_30");
    expect(fitted.dayIndex).toBe(original.dayIndex);
    expect(original.templateId).toBe("4x1k");
  });

  it("retains a session exactly on the availability boundary", () => {
    const original = row();
    expect(fitRunToTimeLimit(
      original,
      { sessionMinutes: 35, longRunMinutes: null },
      420,
      307.5
    )).toBe(original);
  });

  it("fits a matrix of paces and limits against the segment clock", () => {
    for (const pace of [180, 210, 240, 300, 360, 480]) {
      for (const limit of [30, 35, 40, 45, 60, 90, 150]) {
        for (const id of ["4x1k", "5x1k", "6x1k", "8x400"]) {
          const fitted = fitRunToTimeLimit(
            row(id),
            { sessionMinutes: limit, longRunMinutes: null },
            600,
            pace
          );
          expect(segmentMinutes(template(fitted.templateId), 600, pace))
            .toBeLessThanOrEqual(limit);
        }
      }
    }
  });

  it("applies the same clock to the longest-session baseline", () => {
    const fitted = fitWeekToRunningBaseline(
      [row()],
      { ...baseline, longestRunMinutes: 30 },
      baseline.confirmedAt,
      420,
      300
    );
    expect(fitted[0].templateId).toBe("easy_30");
  });

  it("reduces weekly work when the real interval duration exceeds the baseline", () => {
    // The old catalogue sum is 29 + 30 = 59. The real prescription is
    // 34.5 + 30 = 64.5, which does not fit a 64-minute weekly report.
    const fitted = fitWeekToRunningBaseline(
      [row(), { ...row("easy_30"), dayIndex: 4 }],
      { ...baseline, weeklyMinutes: 64 },
      baseline.confirmedAt,
      420,
      300
    );
    expect(fitted[0].templateId).toBe("8x400");
    expect(fitted.reduce(
      (sum, run) => sum + segmentMinutes(template(run.templateId), 420, 300),
      0
    )).toBe(63);
  });

  it("preserves protected rows in both fitting passes", () => {
    const variants: Array<Partial<ScheduledRunDay>> = [
      { completed: true },
      { status: "skipped" },
      { userOverride: "4x1k" },
      { type: "race" },
    ];
    for (const patch of variants) {
      const protectedRow = { ...row(), ...patch };
      expect(fitRunToTimeLimit(
        protectedRow,
        { sessionMinutes: 30, longRunMinutes: null },
        420,
        300
      )).toBe(protectedRow);
      expect(fitWeekToRunningBaseline(
        [protectedRow],
        { ...baseline, longestRunMinutes: 30 },
        baseline.confirmedAt,
        420,
        300
      )[0]).toBe(protectedRow);
    }
  });

  it("threads interval pace into complete generated weeks and preserves race day", () => {
    const original = generateRacePlanV2(planInput);
    const fitted = generateRacePlanV2({
      ...planInput,
      runningBaseline: baseline,
      runTimeLimits: { sessionMinutes: 35, longRunMinutes: 45 },
    });
    expect(fitted.weeks.flat().filter((run) => run.type === "race"))
      .toEqual(original.weeks.flat().filter((run) => run.type === "race"));
    for (const week of fitted.weeks) {
      const training = week.filter((run) => run.type !== "race");
      expect(training.reduce(
        (sum, run) => sum + segmentMinutes(template(run.templateId), 420, 300),
        0
      )).toBeLessThanOrEqual(baseline.weeklyMinutes);
      for (const run of training) {
        const limit = run.type === "long" ||
          run.timeLimit?.originalTemplateId.startsWith("long_") ? 45 : 35;
        expect(segmentMinutes(template(run.templateId), 420, 300))
          .toBeLessThanOrEqual(limit);
      }
    }
  });

  it("does not change unrestricted progression merely because pace is available", () => {
    expect(generateRacePlanV2(planInput)).toEqual(generateRacePlanV2({
      ...planInput,
      intervalPaceSPerKm: null,
    }));
  });
});
