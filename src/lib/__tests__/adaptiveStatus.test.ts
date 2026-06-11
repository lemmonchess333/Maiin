import { describe, it, expect } from "vitest";
import {
  adaptiveCalorieStatus,
  adaptiveCalorieStatusLabel,
} from "../adaptiveStatus";

const NOW = Date.parse("2026-06-11T12:00:00.000Z");

describe("adaptiveCalorieStatus", () => {
  it("manual override always wins", () => {
    expect(
      adaptiveCalorieStatus(
        {
          customCalorieTarget: 2400,
          adaptiveCapState: { lastAppliedAt: "2026-06-10T00:00:00.000Z" },
        },
        NOW
      )
    ).toEqual({ kind: "manual" });
  });

  it("adapting when a real (non-epoch) lastAppliedAt exists — days computed", () => {
    expect(
      adaptiveCalorieStatus(
        { adaptiveCapState: { lastAppliedAt: "2026-06-08T12:00:00.000Z" } },
        NOW
      )
    ).toEqual({ kind: "adapting", retunedDaysAgo: 3 });
    // same-day → 0
    expect(
      adaptiveCalorieStatus(
        { adaptiveCapState: { lastAppliedAt: "2026-06-11T06:00:00.000Z" } },
        NOW
      )
    ).toEqual({ kind: "adapting", retunedDaysAgo: 0 });
  });

  it("formula for no capState / epoch default / invalid date / null profile", () => {
    expect(adaptiveCalorieStatus(null, NOW)).toEqual({ kind: "formula" });
    expect(adaptiveCalorieStatus({}, NOW)).toEqual({ kind: "formula" });
    expect(
      adaptiveCalorieStatus(
        { adaptiveCapState: { lastAppliedAt: "1970-01-01T00:00:00.000Z" } },
        NOW
      )
    ).toEqual({ kind: "formula" });
    expect(
      adaptiveCalorieStatus(
        { adaptiveCapState: { lastAppliedAt: "garbage" } },
        NOW
      )
    ).toEqual({ kind: "formula" });
  });

  it("labels read sensibly", () => {
    expect(adaptiveCalorieStatusLabel({ kind: "manual" })).toMatch(/Manual/);
    expect(
      adaptiveCalorieStatusLabel({ kind: "adapting", retunedDaysAgo: 0 })
    ).toMatch(/retuned today/);
    expect(
      adaptiveCalorieStatusLabel({ kind: "adapting", retunedDaysAgo: 5 })
    ).toMatch(/5d ago/);
    expect(adaptiveCalorieStatusLabel({ kind: "formula" })).toMatch(/Formula/);
  });
});
