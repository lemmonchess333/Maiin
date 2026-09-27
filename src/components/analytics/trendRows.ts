/**
 * The overview's Trends rows, built from data the page already holds.
 * Pure, so each row's wording and its gates are tested without mounting
 * History. A row that has nothing true to say is left out rather than
 * shown with a dash.
 */
import type { AnalyticsPage } from "@/components/analytics/AnalyticsGoDeeper";
import type { WeightTrendPoint } from "@/hooks/useBodyweightTrend";
import { parseLocalDate } from "@/lib/dateHelpers";
import { finishTimeLabel } from "@/lib/runLabels";
import { formatWeightInUnit } from "@/lib/weightUnits";
import { THEME } from "@/lib/theme";
import { formatDayMonth } from "@/utils/formatters";
import { CALORIE_UNIT, formatCalories } from "@/utils/formatNutrition";

export interface TrendRow {
  key: string;
  label: string;
  /** What the figure is, or how it moved: "Daily average · target 2,200". */
  detail: string;
  /** Empty when the figure is deliberately hidden (hide-the-number). */
  value: string;
  unit?: string;
  /** The shape over the range. Absent when too thin to draw honestly. */
  series?: readonly number[];
  color: string;
  /** The page the row opens. */
  page: AnalyticsPage;
}

/** How a race prediction's benchmark was set, as the row's second line. */
const PREDICTION_SOURCE: Record<string, string> = {
  derived: "From your best recent run",
  manual: "From a time you set",
  race: "From a race result",
  estimate: "Estimated",
};

/** Movement under this is scale noise, and reads as steady. */
const STEADY_KG = 0.05;

export function weightRow({
  points,
  sinceKey,
  unit,
  hideNumber,
}: {
  points: readonly WeightTrendPoint[];
  /** The range's first day, "YYYY-MM-DD". */
  sinceKey: string;
  unit: "kg" | "lbs";
  /** #984: no weight figure anywhere, only which way it is going. */
  hideNumber: boolean;
}): TrendRow | null {
  // The weight chart's own floor for drawing a trend.
  if (points.length < 3) return null;
  const last = points[points.length - 1];
  const inRange = points.filter((p) => p.date >= sinceKey);
  const base = inRange.length >= 2 ? inRange[0] : null;

  let detail: string;
  if (!base) {
    // Nothing to compare inside the range: say when, not a change.
    detail = `Last weighed ${formatDayMonth(parseLocalDate(last.date))}`;
  } else {
    const change = last.trend - base.trend;
    const since = formatDayMonth(parseLocalDate(base.date));
    if (Math.abs(change) < STEADY_KG) detail = `Steady since ${since}`;
    else if (hideNumber)
      detail = `Trending ${change < 0 ? "down" : "up"} since ${since}`;
    else
      detail = `${change < 0 ? "Down" : "Up"} ${formatWeightInUnit(
        Math.abs(change),
        unit
      )} ${unit} since ${since}`;
  }

  return {
    key: "weight",
    label: "Body weight",
    detail,
    value: hideNumber ? "" : formatWeightInUnit(last.trend, unit),
    unit: hideNumber ? undefined : unit,
    series: base ? inRange.map((p) => p.trend) : undefined,
    color: "hsl(var(--muted-foreground))",
    page: "body",
  };
}

export function nutritionRows({
  daysLogged,
  avgCalories,
  avgProtein,
  caloriesSeries,
  proteinSeries,
  showSeries,
  targetCalories,
  targetProtein,
}: {
  daysLogged: number;
  avgCalories: number;
  avgProtein: number;
  caloriesSeries: readonly number[];
  proteinSeries: readonly number[];
  /** The page's own density gate for drawing an intake line. */
  showSeries: boolean;
  targetCalories: number;
  targetProtein: number;
}): TrendRow[] {
  if (daysLogged === 0) return [];
  const rows: TrendRow[] = [
    {
      key: "calories",
      label: "Calories",
      detail:
        targetCalories > 0
          ? `Daily average · target ${formatCalories(targetCalories)}`
          : "Daily average",
      value: formatCalories(avgCalories),
      unit: CALORIE_UNIT,
      series: showSeries ? caloriesSeries : undefined,
      color: THEME.semantic.nutrition,
      page: "food",
    },
  ];
  if (avgProtein > 0) {
    rows.push({
      key: "protein",
      label: "Protein",
      detail:
        targetProtein > 0
          ? `Daily average · target ${Math.round(targetProtein)} g`
          : "Daily average",
      value: String(Math.round(avgProtein)),
      unit: "g",
      series: showSeries ? proteinSeries : undefined,
      color: THEME.semantic.nutrition,
      page: "food",
    });
  }
  return rows;
}

export function predictionRow({
  tenKSeconds,
  source,
}: {
  /** The predicted 10K, or null with no benchmark to predict from. */
  tenKSeconds: number | null;
  source: string | null | undefined;
}): TrendRow | null {
  if (tenKSeconds === null || !(tenKSeconds > 0)) return null;
  return {
    key: "10k",
    label: "10K prediction",
    detail: (source && PREDICTION_SOURCE[source]) || "Estimated",
    value: finishTimeLabel(tenKSeconds),
    color: THEME.running,
    page: "running",
  };
}
