import { describe, it, expect } from "vitest";
import { computePolarizedSplit } from "../polarizedSplit";

describe("computePolarizedSplit", () => {
  it("returns insufficient when fewer than 3 valid runs exist", () => {
    expect(
      computePolarizedSplit([
        { activityType: "easy", duration: 1800 },
        { activityType: "tempo", duration: 1800 },
      ])
    ).toEqual({
      lowIntensityPct: 0,
      highIntensityPct: 0,
      runCount: 2,
      status: "insufficient",
    });
  });

  it("filters out invalid runs unless savedAnyway is true", () => {
    const res = computePolarizedSplit([
      { activityType: "easy", duration: 2400 },
      { activityType: "easy", duration: 2400 },
      { activityType: "tempo", duration: 1200, isInvalid: true },
    ]);
    expect(res.status).toBe("insufficient");
    expect(res.runCount).toBe(2);

    const savedAnywayRes = computePolarizedSplit([
      { activityType: "easy", duration: 2400 },
      { activityType: "long", duration: 4800 },
      {
        activityType: "tempo",
        duration: 1800,
        isInvalid: true,
        savedAnyway: true,
      },
    ]);
    expect(savedAnywayRes.status).toBe("polarized");
    expect(savedAnywayRes.lowIntensityPct).toBe(80);
    expect(savedAnywayRes.highIntensityPct).toBe(20);
    expect(savedAnywayRes.runCount).toBe(3);
  });

  it("reads activityType first, keeps long runs low-intensity, and falls back to legacy type", () => {
    const polarized = computePolarizedSplit([
      { activityType: "easy", duration: 3600 },
      { activityType: "long", duration: 3600 },
      { activityType: "Intervals", duration: 1800 },
    ]);
    expect(polarized).toEqual({
      lowIntensityPct: 80,
      highIntensityPct: 20,
      runCount: 3,
      status: "polarized",
    });

    const tooHard = computePolarizedSplit([
      { activityType: "easy", duration: 1800 },
      { type: "tempo", duration: 1800 },
      { activityType: "race", duration: 1800 },
    ]);
    expect(tooHard.status).toBe("too_hard");
    expect(tooHard.highIntensityPct).toBe(67);
    expect(tooHard.lowIntensityPct).toBe(33);
  });

  it("classifies all easy/long runs as all_easy and falls back to distance or 1 when duration is absent", () => {
    const allEasy = computePolarizedSplit([
      { activityType: "easy", distance: 5000 },
      { activityType: "long", distance: 15000 },
      { activityType: "freeform" },
    ]);
    expect(allEasy).toEqual({
      lowIntensityPct: 100,
      highIntensityPct: 0,
      runCount: 3,
      status: "all_easy",
    });
  });
});
