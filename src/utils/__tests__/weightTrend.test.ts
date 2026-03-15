import { describe, it, expect } from "vitest";
import { calcWeightTrend } from "../weightTrend";

describe("calcWeightTrend", () => {
  it("returns null for empty entries", () => {
    expect(calcWeightTrend([])).toBeNull();
  });

  it("works with a single entry", () => {
    const result = calcWeightTrend([{ date: "2026-03-15", weight: 80 }]);
    expect(result).not.toBeNull();
    expect(result!.current).toBe(80);
    expect(result!.avg7d).toBe(80);
    expect(result!.delta).toBe(0);
    expect(result!.direction).toBe("stable");
    expect(result!.sparkline).toEqual([80]);
  });

  it("computes 7-day average from last 7 entries", () => {
    const entries = [
      { date: "2026-03-09", weight: 80 },
      { date: "2026-03-10", weight: 80.5 },
      { date: "2026-03-11", weight: 79.5 },
      { date: "2026-03-12", weight: 80 },
      { date: "2026-03-13", weight: 80.2 },
      { date: "2026-03-14", weight: 80.1 },
      { date: "2026-03-15", weight: 80.3 },
    ];
    const result = calcWeightTrend(entries)!;
    expect(result.current).toBe(80.3);
    expect(result.avg7d).toBe(80.1);
    expect(result.delta).toBe(0.2);
    expect(result.direction).toBe("up");
  });

  it("classifies direction as stable when delta < 0.2", () => {
    const entries = [
      { date: "2026-03-14", weight: 80 },
      { date: "2026-03-15", weight: 80.1 },
    ];
    const result = calcWeightTrend(entries)!;
    expect(result.direction).toBe("stable");
  });

  it("classifies direction as down when delta < -0.2", () => {
    const entries = [
      { date: "2026-03-09", weight: 82 },
      { date: "2026-03-10", weight: 81.5 },
      { date: "2026-03-11", weight: 81 },
      { date: "2026-03-12", weight: 80.5 },
      { date: "2026-03-13", weight: 80 },
      { date: "2026-03-14", weight: 80 },
      { date: "2026-03-15", weight: 79.5 },
    ];
    const result = calcWeightTrend(entries)!;
    expect(result.direction).toBe("down");
  });

  it("caps sparkline to last 30 entries", () => {
    const entries = Array.from({ length: 40 }, (_, i) => ({
      date: `2026-02-${String(i + 1).padStart(2, "0")}`,
      weight: 80 + i * 0.1,
    }));
    const result = calcWeightTrend(entries)!;
    expect(result.sparkline.length).toBe(30);
  });

  it("sorts entries by date regardless of input order", () => {
    const entries = [
      { date: "2026-03-15", weight: 81 },
      { date: "2026-03-13", weight: 79 },
      { date: "2026-03-14", weight: 80 },
    ];
    const result = calcWeightTrend(entries)!;
    expect(result.current).toBe(81);
    expect(result.sparkline).toEqual([79, 80, 81]);
  });
});
