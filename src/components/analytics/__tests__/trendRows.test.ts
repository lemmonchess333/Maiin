import { describe, it, expect } from "vitest";
import { nutritionRows, predictionRow, weightRow } from "../trendRows";
import { weightTrendPoints } from "@/hooks/useBodyweightTrend";

/**
 * The overview's Trends rows. Each says what its figure is and how it
 * moved over the range, or is left out: a row that can say nothing true
 * is not shown with a dash.
 */

const points = (pairs: [string, number][]) =>
  pairs.map(([date, trend]) => ({ date, actual: trend, trend }));

describe("weightRow", () => {
  const series = points([
    ["2026-08-20", 82.4],
    ["2026-09-01", 82.1],
    ["2026-09-10", 81.9],
    ["2026-09-26", 81.6],
  ]);

  it("quotes the latest trend and its change since the range began", () => {
    const row = weightRow({
      points: series,
      sinceKey: "2026-08-29",
      unit: "kg",
      hideNumber: false,
    })!;
    expect(row.value).toBe("81.6");
    expect(row.unit).toBe("kg");
    // en-GB spells September "Sept" in current ICU and "Sep" in older.
    expect(row.detail).toMatch(/^Down 0\.5\u00A0kg since 1\u00A0Sept?$/);
    expect(row.series).toEqual([82.1, 81.9, 81.6]);
    expect(row.page).toBe("body");
  });

  it("converts for a reader in pounds", () => {
    const row = weightRow({
      points: series,
      sinceKey: "2026-08-29",
      unit: "lbs",
      hideNumber: false,
    })!;
    expect(row.value).toBe("179.9");
    expect(row.unit).toBe("lbs");
    expect(row.detail).toMatch(/^Down 1\.1\u00A0lbs since /);
  });

  it("under hide-the-number, says which way and never a figure", () => {
    const row = weightRow({
      points: series,
      sinceKey: "2026-08-29",
      unit: "kg",
      hideNumber: true,
    })!;
    expect(row.value).toBe("");
    expect(row.unit).toBeUndefined();
    expect(row.detail).toMatch(/^Trending down since /);
    expect(row.detail).not.toMatch(/\d+\.\d/);
    // The shape stays: it conveys direction without a number.
    expect(row.series?.length).toBe(3);
  });

  it("reads a flat trend as steady", () => {
    const row = weightRow({
      points: points([
        ["2026-08-01", 80],
        ["2026-09-01", 80],
        ["2026-09-20", 80.02],
      ]),
      sinceKey: "2026-08-29",
      unit: "kg",
      hideNumber: false,
    })!;
    expect(row.detail).toMatch(/^Steady since /);
  });

  it("with no weigh-ins in the range, says when, not a change", () => {
    const row = weightRow({
      points: series,
      sinceKey: "2026-09-20",
      unit: "kg",
      hideNumber: false,
    })!;
    expect(row.detail).toMatch(/^Last weighed 26\u00A0Sept?$/);
    expect(row.series).toBeUndefined();
  });

  it("needs the weight chart's three weigh-ins before it says anything", () => {
    expect(
      weightRow({
        points: series.slice(0, 2),
        sinceKey: "2026-08-01",
        unit: "kg",
        hideNumber: false,
      })
    ).toBeNull();
  });
});

describe("weightTrendPoints", () => {
  it("drops invalid readings and keeps one per day, the last", () => {
    const out = weightTrendPoints([
      { id: "a", date: "2026-09-01", weight: 80 },
      { id: "b", date: "2026-09-01", weight: 81 },
      { id: "c", date: "2026-09-02", weight: 0 },
      { id: "d", date: "2026-09-03", weight: Number.NaN },
      { id: "e", date: "2026-09-04", weight: 82 },
    ] as never);
    expect(out.map((p) => [p.date, p.actual])).toEqual([
      ["2026-09-01", 81],
      ["2026-09-04", 82],
    ]);
  });
});

describe("nutritionRows", () => {
  const base = {
    daysLogged: 20,
    avgCalories: 1790,
    avgProtein: 125.4,
    caloriesSeries: [1800, 1750, 1820],
    proteinSeries: [120, 130, 126],
    showSeries: true,
    targetCalories: 2200,
    targetProtein: 163,
  };

  it("gives calories and protein against their targets", () => {
    const [calories, protein] = nutritionRows(base);
    expect(calories.label).toBe("Calories");
    expect(calories.detail).toMatch(/^Daily average · target\u00A02.200$/);
    expect(calories.value).toMatch(/^1.790$/);
    expect(calories.unit).toBe("kcal");
    expect(protein.detail).toBe("Daily average · target\u00A0163\u00A0g");
    expect(protein.value).toBe("125");
    expect(protein.unit).toBe("g");
    expect(calories.page).toBe("food");
  });

  it("draws no line where the page's density gate says it would mislead", () => {
    const rows = nutritionRows({ ...base, showSeries: false });
    expect(rows.every((r) => r.series === undefined)).toBe(true);
  });

  it("names no target it does not have", () => {
    const [calories] = nutritionRows({ ...base, targetCalories: 0 });
    expect(calories.detail).toBe("Daily average");
  });

  it("is absent with nothing logged in the range", () => {
    expect(nutritionRows({ ...base, daysLogged: 0 })).toEqual([]);
  });
});

describe("predictionRow", () => {
  it("gives the 10K time and where its benchmark came from", () => {
    const row = predictionRow({ tenKSeconds: 3341, source: "derived" })!;
    expect(row.value).toBe("55:41");
    expect(row.detail).toBe("From your best recent run");
    expect(row.page).toBe("running");
  });

  it("is absent without a benchmark", () => {
    expect(predictionRow({ tenKSeconds: null, source: null })).toBeNull();
  });
});
