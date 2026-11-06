import { describe, expect, it } from "vitest";
import {
  resolveNoviceRaceProgression,
  type NoviceRaceProgressionInput,
} from "../noviceRaceProgression";
import { generateRacePlanV2 } from "../runScheduler";
import { STARTER_STAGE_TEMPLATE_IDS } from "../starterPlan";

const input = (
  reports: NoviceRaceProgressionInput["reports"] = []
): NoviceRaceProgressionInput => ({
  state: { stage: 1, stageStartedOn: "2026-09-07" },
  recovery: "ready",
  capacityConfirmation: {
    stage: 1,
    confirmedOn: "2026-09-07",
    raceGoal: { distance: "10k", targetDate: "2027-01-31" },
  },
  reports,
});
const report = (activityId: string, date: string) => ({
  activityId: `outside:${activityId}`,
  date,
  completedStage: 1,
  manageable: true,
  source: "outside_session" as const,
  durationSeconds: 3600,
  relativeEffort: "matched" as const,
  sessionCompletedAsDescribed: true,
});

describe("explicit novice race progression candidate", () => {
  it("never advances from elapsed time, missing history, an import or mark-done alone", () => {
    for (const reports of [
      [],
      null,
      [{ activityId: "outside", date: "2026-09-09" }],
    ]) {
      const result = resolveNoviceRaceProgression(input(reports), "2026-11-02");
      expect(result.state.stage).toBe(1);
      expect(result.raceReadiness).toBe("not_assessed");
    }
  });
  it("credits explicit outside-session reports, one per date and identity, at next week only", () => {
    const evidence = input([
      report("a", "2026-09-08"),
      report("b", "2026-09-10"),
    ]);
    expect(
      resolveNoviceRaceProgression(evidence, "2026-09-11").state.stage
    ).toBe(1);
    const next = resolveNoviceRaceProgression(evidence, "2026-09-14");
    expect(next.state.stage).toBe(1);
    expect(next.templateId).toBe(STARTER_STAGE_TEMPLATE_IDS[0]);
    expect(next.proposedState).toEqual({
      stage: 2,
      stageStartedOn: "2026-09-14",
    });
    expect(
      resolveNoviceRaceProgression(
        {
          ...evidence,
          state: next.proposedState!,
          capacityConfirmation: {
            ...evidence.capacityConfirmation!,
            stage: 2,
            confirmedOn: "2026-09-14",
          },
        },
        "2026-09-14"
      ).state.stage
    ).toBe(2);
    expect(
      resolveNoviceRaceProgression(
        input([report("a", "2026-09-08"), report("b", "2026-09-08")]),
        "2026-09-14"
      ).state.stage
    ).toBe(1);
    expect(
      resolveNoviceRaceProgression(
        input([report("a", "2026-09-08"), report("a", "2026-09-10")]),
        "2026-09-14"
      ).state.stage
    ).toBe(1);
  });
  it("holds conflicting corrections, unmanageable sessions, long gaps and unknown recovery", () => {
    const reports = [report("a", "2026-09-08"), report("b", "2026-09-10")];
    expect(
      resolveNoviceRaceProgression(
        input([...reports, { ...reports[0], manageable: false }]),
        "2026-09-14"
      ).state.stage
    ).toBe(1);
    expect(
      resolveNoviceRaceProgression(input(reports), "2026-11-02").state.stage
    ).toBe(1);
    for (const recovery of ["unknown", "not_ready"] as const) {
      expect(
        resolveNoviceRaceProgression(
          { ...input(reports), recovery },
          "2026-09-14"
        ).prescribe
      ).toBe(false);
    }
  });
  it("requests baseline review after stage nine rather than declaring marathon readiness", () => {
    const current = input(
      [report("a", "2026-09-08"), report("b", "2026-09-10")].map((row) => ({
        ...row,
        completedStage: 9,
      }))
    );
    current.state.stage = 9;
    current.capacityConfirmation!.stage = 9;
    expect(resolveNoviceRaceProgression(current, "2026-09-14")).toMatchObject({
      reason: "baseline_review",
      state: { stage: 9 },
      raceReadiness: "not_assessed",
    });
  });
});

describe("actual race generator opt-in replay", () => {
  it("keeps the accepted prescription while a higher stage is only proposed", () => {
    const result = generateRacePlanV2({
      weekSchedule: [1, 3, 5].map((day) => ({ day, type: "run" as const })),
      weeklyRunDays: 3,
      recentLayoff: "none" as const,
      currentDate: "2026-09-14",
      weekStart: "2026-09-14",
      raceGoal: { distance: "10k", targetDate: "2027-01-31" },
      noviceProgression: input([
        report("a", "2026-09-08"),
        report("b", "2026-09-10"),
      ]),
    });
    expect(result.noviceProgression).toMatchObject({
      state: { stage: 1 },
      proposedState: { stage: 2 },
      reason: "advance_available",
    });
    expect(
      result.weeks
        .flat()
        .filter((row) => row.type !== "race")
        .every((row) => row.templateId === STARTER_STAGE_TEMPLATE_IDS[0])
    ).toBe(true);
  });
  it("does not reuse capacity adoption for a different race distance or date", () => {
    const base = {
      weekSchedule: [1, 3, 5].map((day) => ({ day, type: "run" as const })),
      weeklyRunDays: 3,
      recentLayoff: "none" as const,
      currentDate: "2026-11-02",
      weekStart: "2026-11-02",
      noviceProgression: input([]),
    };
    for (const raceGoal of [
      { distance: "marathon" as const, targetDate: "2027-01-31" },
      { distance: "10k" as const, targetDate: "2027-02-07" },
    ]) {
      const result = generateRacePlanV2({ ...base, raceGoal });
      expect(result.noviceProgression?.prescribe).toBe(false);
      expect(result.weeks.flat().every((row) => row.type === "race")).toBe(
        true
      );
    }
  });
  it("replays every earned stage without promoting future weeks", () => {
    for (let stage = 1; stage <= STARTER_STAGE_TEMPLATE_IDS.length; stage++) {
      for (const distance of ["5k", "10k", "half", "marathon"] as const) {
        const result = generateRacePlanV2({
          weekSchedule: [1, 3, 5].map((day) => ({ day, type: "run" as const })),
          weeklyRunDays: 3,
          recentLayoff: "none" as const,
          raceGoal: { distance, targetDate: "2027-01-31" },
          currentDate: "2026-11-02",
          weekStart: "2026-11-02",
          noviceProgression: {
            ...input([]),
            state: { stage, stageStartedOn: "2026-11-02" },
            capacityConfirmation: {
              ...input().capacityConfirmation!,
              stage,
              raceGoal: { distance, targetDate: "2027-01-31" },
            },
          },
        });
        expect(result.noviceProgression?.state.stage).toBe(stage);
        expect(
          result.weeks
            .flat()
            .filter((row) => row.type !== "race")
            .every(
              (row) => row.templateId === STARTER_STAGE_TEMPLATE_IDS[stage - 1]
            )
        ).toBe(true);
      }
    }
  });

  for (const distance of ["5k", "10k", "half", "marathon"] as const) {
    it(`${distance}: no calendar catch-up, fixed event date, nonconsecutive maximum three`, () => {
      const base = {
        weekSchedule: Array.from({ length: 7 }, (_, day) => ({
          day,
          type: "run" as const,
        })),
        weeklyRunDays: 7,
        recentLayoff: "none" as const,
        raceGoal: { distance, targetDate: "2027-01-31" },
        currentDate: "2026-11-02",
        weekStart: "2026-11-02",
      };
      const legacy = generateRacePlanV2(base);
      const candidateInput = {
        ...base,
        noviceProgression: {
          ...input(null),
          capacityConfirmation: {
            ...input().capacityConfirmation!,
            raceGoal: base.raceGoal,
          },
        },
      };
      const before = structuredClone(candidateInput);
      const candidate = generateRacePlanV2(candidateInput);
      expect(candidateInput).toEqual(before);
      expect(candidate.noviceProgression?.state.stage).toBe(1);
      for (const week of candidate.weeks) {
        expect(week.length).toBeLessThanOrEqual(3);
        for (const run of week.filter((row) => row.type !== "race")) {
          expect(run.templateId).toBe(STARTER_STAGE_TEMPLATE_IDS[0]);
          expect(
            week.some((row) => row.dayIndex === (run.dayIndex + 1) % 7)
          ).toBe(false);
        }
      }
      expect(
        candidate.weeks.flat().find((row) => row.type === "race")?.date
      ).toBe(base.raceGoal.targetDate);
      expect(generateRacePlanV2(base)).toEqual(legacy);
      const held = generateRacePlanV2({
        ...candidateInput,
        noviceProgression: { ...input(), recovery: "not_ready" },
      });
      expect(held.weeks.flat().every((row) => row.type === "race")).toBe(true);
      expect(held.noviceProgression?.prescribe).toBe(false);
    });
  }
});
