import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/components/run/runConfigDefaults";
import { freeformPlanMetadata } from "@/lib/runPlanMetadata";
import {
  isUnprescribedRun,
  withoutRunningPrescription,
} from "../runningPrescriptionLaunch";

describe("unprescribed activity recording", () => {
  it("removes templates, target, intervals, coaching and plan claims without deleting equipment/preferences", () => {
    const config = {
      ...DEFAULT_CONFIG,
      shoeId: "shoe",
      activityType: "intervals" as const,
      intervals: { reps: 4, workDuration: 60, restDuration: 60 },
      target: { type: "pace" as const, value: 300 },
      planMetadata: {
        ...freeformPlanMetadata("freeform"),
        scheduledRunId: "old",
        actualTemplateId: "tempo_20",
        plannedTemplateId: "tempo_20",
      },
    };
    const free = withoutRunningPrescription(config);
    expect(isUnprescribedRun(config)).toBe(false);
    expect(isUnprescribedRun(free)).toBe(true);
    expect(free).toMatchObject({
      activityType: "freerun",
      target: { type: "none" },
      paceAlerts: false,
      shoeId: "shoe",
    });
    expect(free.intervals).toBeUndefined();
    expect(free.planMetadata.scheduledRunId).toBeNull();
    expect(config.intervals).toBeDefined();
  });
  it.each(["manual", "treadmill"] as const)(
    "preserves %s recording without a prescribed session",
    (activityType) => {
      const free = withoutRunningPrescription({
        ...DEFAULT_CONFIG,
        activityType: activityType === "manual" ? "manual" : "freerun",
        ...(activityType === "treadmill"
          ? { place: "treadmill" as const }
          : {}),
      });
      expect(isUnprescribedRun(free)).toBe(true);
      if (activityType === "treadmill") expect(free.place).toBe("treadmill");
      else expect(free.activityType).toBe("manual");
    }
  );
  it("does not mistake a template-free quality workout for unprescribed recording", () => {
    expect(
      isUnprescribedRun({
        ...withoutRunningPrescription(DEFAULT_CONFIG),
        activityType: "tempo",
      })
    ).toBe(false);
  });
});
