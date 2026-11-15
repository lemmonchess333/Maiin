import { describe, expect, it } from "vitest";
import { recordedRaceMilestones } from "../recordedRaceMilestones";

const race = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  date: "2026-10-04",
  activityType: "race",
  distance: 5000,
  duration: 1500,
  ...over,
});

describe("recordedRaceMilestones", () => {
  it("times a race on its elapsed time where the run has one (Run28 call 4, its STATUS)", () => {
    // 25:00 moving, 26:10 from the clock's start to the finish.
    expect(recordedRaceMilestones([race({ elapsedSeconds: 1570 })])).toEqual([
      {
        id: "r1",
        date: "2026-10-04",
        distanceMetres: 5000,
        durationSeconds: 1570,
      },
    ]);
  });

  it("keeps the duration for a race saved without both stamps", () => {
    expect(recordedRaceMilestones([race()])[0].durationSeconds).toBe(1500);
  });

  it("lists only runs started as a race", () => {
    expect(
      recordedRaceMilestones([
        race({ activityType: "easy", elapsedSeconds: 1570 }),
      ])
    ).toEqual([]);
  });
});
