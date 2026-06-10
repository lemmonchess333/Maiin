/**
 * Per-row + per-total formatters for the crew weekly leaderboard.
 *
 * Each crew picks its `leaderboardMetric` on creation (Lifters →
 * total_volume, Runners → total_km, Hybrids → hybrid_score, Fitness →
 * workout_count). The unit and formatting differ enough per metric
 * that a switch is clearer than a single template, and isolating the
 * helpers in lib/ keeps the component file react-refresh-safe.
 */

export interface CrewLeaderboardRow {
  uid: string;
  rank: number;
  displayName: string;
  score: number;
}

/** Per-row score string for the leaderboard list (one user, one number). */
export function formatScore(metric: string, entry: CrewLeaderboardRow): string {
  switch (metric) {
    case "workout_count":
      return `${entry.score} ${entry.score === 1 ? "session" : "sessions"}`;
    case "total_volume":
      return `${Math.round(entry.score).toLocaleString()} kg`;
    case "total_km":
      return `${entry.score.toFixed(1)} km`;
    case "hybrid_score":
    default:
      return `${entry.score.toLocaleString()} pts`;
  }
}

/**
 * Aggregated total for the "This week" stat band — splits the value
 * from the unit so the band can render numbers in Archivo (the numeral font) and
 * the unit in Plus Jakarta. Returns the field label too so callers
 * don't have to keep a parallel switch in JSX.
 */
export function formatTotalForMetric(
  metric: string,
  total: number
): { label: string; value: string; unit: string } {
  switch (metric) {
    case "workout_count":
      return {
        label: "Sessions logged",
        value: String(Math.round(total)),
        unit: "",
      };
    case "total_volume":
      return {
        label: "Volume lifted",
        value: Math.round(total).toLocaleString(),
        unit: "kg",
      };
    case "total_km":
      return { label: "Distance run", value: total.toFixed(1), unit: "km" };
    case "hybrid_score":
    default:
      return {
        label: "Hybrid score",
        value: Math.round(total).toLocaleString(),
        unit: "pts",
      };
  }
}
