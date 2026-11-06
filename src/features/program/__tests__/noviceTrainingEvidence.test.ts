import { describe, expect, it } from "vitest";
import {
  reconcileNoviceTrainingEvidence,
  type NoviceTrainingReport,
} from "../noviceTrainingEvidence";
import {
  resolveNoviceRaceProgression,
  type NoviceRaceProgressionInput,
} from "../noviceRaceProgression";

const report = (
  activityId = "one",
  date = "2026-09-08"
): NoviceTrainingReport => ({
  activityId: `outside:${activityId}`,
  date,
  source: "outside_session",
  durationSeconds: 3600,
  relativeEffort: "matched",
  sessionCompletedAsDescribed: true,
  completedStage: 1,
  manageable: true,
});
const context = (): NoviceRaceProgressionInput => ({
  state: { stage: 1, stageStartedOn: "2026-09-07" },
  capacityConfirmation: {
    stage: 1,
    confirmedOn: "2026-09-07",
    raceGoal: { distance: "10k", targetDate: "2027-01-31" },
  },
  recovery: "ready",
  reports: [report(), report("two", "2026-09-10")],
});

describe("outside training evidence prerequisites", () => {
  it("rejects understated session duration and relabeling a linked activity as outside", () => {
    expect(
      reconcileNoviceTrainingEvidence(
        [{ ...report(), durationSeconds: 1 }],
        [],
        "2026-09-14"
      ).accepted
    ).toEqual([]);
    const facts = [
      {
        activityId: report().activityId,
        date: report().date,
        durationSeconds: 3600,
      },
    ];
    expect(
      reconcileNoviceTrainingEvidence([report()], facts, "2026-09-14").accepted
    ).toEqual([]);
    expect(
      reconcileNoviceTrainingEvidence(
        [{ ...report(), activityId: "saved-run" }],
        [],
        "2026-09-14"
      ).accepted
    ).toEqual([]);
  });
  it("does not treat a lower capacity confirmation as provenance for a higher current stage", () => {
    const result = resolveNoviceRaceProgression(
      {
        ...context(),
        state: { stage: 9, stageStartedOn: "2026-09-07" },
        reports: [],
      },
      "2026-09-14"
    );
    expect(result.prescribe).toBe(false);
    expect(result.reason).toBe("check_in");
  });
  it("accepts explicitly reported facts without creating a synthetic saved run", () => {
    const source = [report()];
    const before = structuredClone(source);
    const result = reconcileNoviceTrainingEvidence(source, [], "2026-09-14");
    expect(result).toEqual({ accepted: source, needsReview: [] });
    expect(result.accepted[0]).not.toBe(source[0]);
    expect(source).toEqual(before);
  });
  it("requires same-account authoritative facts for an activity link and rejects overrides", () => {
    const linked = { ...report(), source: "saved_activity" as const };
    const facts = [
      { activityId: "outside:one", date: linked.date, durationSeconds: 3600 },
    ];
    expect(
      reconcileNoviceTrainingEvidence([linked], facts, "2026-09-14").accepted
    ).toHaveLength(1);
    for (const records of [
      [],
      [{ ...facts[0], invalid: true }],
      [{ ...facts[0], date: "2026-09-09" }],
      [{ ...facts[0], durationSeconds: 1 }],
      [...facts, ...facts],
    ]) {
      expect(
        reconcileNoviceTrainingEvidence([linked], records, "2026-09-14")
          .needsReview
      ).toEqual(["outside:one"]);
    }
  });
  it("rejects missing facts, future or invalid dates, and invalid durations", () => {
    for (const patch of [
      { durationSeconds: 0 },
      { durationSeconds: Infinity },
      { durationSeconds: -1 },
      { durationSeconds: 86401 },
      { date: "2026-02-30" },
      { date: "2026-09-15" },
      { source: undefined },
      { relativeEffort: undefined },
    ]) {
      expect(
        reconcileNoviceTrainingEvidence(
          [{ ...report(), ...patch }],
          [],
          "2026-09-14"
        ).accepted
      ).toEqual([]);
    }
  });
  it("rejects conflicting corrections until a single authoritative version is selected", () => {
    for (const patch of [
      { manageable: false },
      { durationSeconds: 1200 },
      { relativeEffort: "harder" as const },
      { sessionCompletedAsDescribed: false },
    ]) {
      expect(
        reconcileNoviceTrainingEvidence(
          [report(), { ...report(), ...patch }],
          [],
          "2026-09-14"
        ).needsReview
      ).toEqual(["outside:one"]);
    }
  });
  it("does not substitute ordinary mark-done, easier effort, or duration for explicit completion", () => {
    const base = context();
    for (const patch of [
      { sessionCompletedAsDescribed: undefined },
      { manageable: undefined },
      { relativeEffort: "harder" as const },
    ]) {
      expect(
        resolveNoviceRaceProgression(
          {
            ...base,
            reports: base.reports!.map((row) => ({ ...row, ...patch })),
          },
          "2026-09-14"
        ).state.stage
      ).toBe(1);
    }
  });
  it("requires deliberate capacity adoption and never clears independent holds", () => {
    const base = context();
    expect(
      resolveNoviceRaceProgression(
        { ...base, capacityConfirmation: undefined },
        "2026-09-14"
      ).prescribe
    ).toBe(false);
    for (const hold of [
      "injury",
      "post_race",
      "clinical_restriction",
    ] as const) {
      const input = { ...base, holds: [hold] };
      expect(resolveNoviceRaceProgression(input, "2026-09-14")).toMatchObject({
        prescribe: false,
        state: { stage: 1 },
        reason: "check_in",
      });
      expect(input.holds).toEqual([hold]);
    }
  });
});
