import { describe, it, expect } from "vitest";
import { weeklyVolumeTargets } from "../volumeTargets";
import { judgementLandmark, JUDGEMENT_MUSCLE_ORDER } from "../volumeModel";

describe("weeklyVolumeTargets — what the days and time can fit (Lift4 (5))", () => {
  const targets = (
    days: number,
    sessionMinutes: number,
    experience: "beginner" | "intermediate" = "intermediate"
  ) =>
    weeklyVolumeTargets({
      goal: "hypertrophy",
      experience,
      days,
      sessionMinutes,
    });

  it("never asks past the weekly floor, and keeps the band's ceiling", () => {
    const t = targets(4, 75);
    for (const muscle of JUDGEMENT_MUSCLE_ORDER) {
      const band = judgementLandmark("hypertrophy", muscle, "intermediate");
      expect(t.get(muscle)!.low, muscle).toBeLessThanOrEqual(band.low);
      expect(t.get(muscle)!.high, muscle).toBe(band.high);
    }
  });

  it("asks less of shorter sessions and fewer days", () => {
    const sum = (t: ReturnType<typeof targets>) =>
      [...t.values()].reduce((n, b) => n + b.low, 0);
    expect(sum(targets(4, 30))).toBeLessThan(sum(targets(4, 75)));
    expect(sum(targets(2, 60))).toBeLessThan(sum(targets(4, 60)));
  });

  it("gives a beginner the lower tier's ceiling", () => {
    const beginner = targets(4, 60, "beginner");
    const intermediate = targets(4, 60);
    expect(beginner.get("Chest")!.high).toBeLessThan(
      intermediate.get("Chest")!.high
    );
  });
});
