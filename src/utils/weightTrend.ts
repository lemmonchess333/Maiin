export interface WeightTrend {
  current: number;
  avg7d: number;
  delta: number;
  direction: "up" | "down" | "stable";
  sparkline: number[];
}

export function calcWeightTrend(
  entries: { date: string; weight: number }[]
): WeightTrend | null {
  if (entries.length === 0) return null;

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const current = sorted[sorted.length - 1].weight;

  const last7 = sorted.slice(-7);
  const avg7d =
    Math.round(
      (last7.reduce((sum, e) => sum + e.weight, 0) / last7.length) * 10
    ) / 10;
  const delta = Math.round((current - avg7d) * 10) / 10;

  return {
    current,
    avg7d,
    delta,
    direction: Math.abs(delta) < 0.2 ? "stable" : delta > 0 ? "up" : "down",
    sparkline: sorted.slice(-30).map((e) => e.weight),
  };
}
