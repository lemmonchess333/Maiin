/**
 * Challenge progress-value formatting — the ONE copy. This function lived
 * byte-identical in ChallengeCard and ChallengeFinaleCard (the 2026-08-22
 * unit-treatment sweep found the pair while spacing "5.2km" → "5.2 km");
 * fixing a duplicated formatter twice is how the two drift, so it moved
 * here instead.
 *
 * fastest_effort: seconds → "m:ss". group_goal / total_km: kilometres.
 * total_volume: kilograms. Units are SPACED ("5.2 km", "12,840 kg") —
 * the app's one unit treatment.
 */
export function formatChallengeValue(metric: string, value: number): string {
  if (metric === "fastest_effort") {
    if (value <= 0) return "—";
    const m = Math.floor(value / 60);
    const s = Math.round(value % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
  if (metric === "total_km") return `${value.toFixed(1)} km`;
  if (metric === "total_volume")
    return `${Math.round(value).toLocaleString()} kg`;
  return Math.round(value).toLocaleString();
}
