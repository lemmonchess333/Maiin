/**
 * Formatting utilities for display values across the app.
 */

/** Format lifting volume for display (e.g. 500 → "500", 1500 → "1.5k") */
export function formatVolume(kg: number): { value: string; unit: string } {
  if (kg <= 0) return { value: "\u2014", unit: "" };
  if (kg >= 1000) return { value: (kg / 1000).toFixed(1) + "k", unit: "kg" };
  return { value: String(Math.round(kg)), unit: "kg" };
}

/** Format volume as a compact subtitle string (e.g. "1.5k vol" or "500 kg vol") */
export function formatVolumeSub(kg: number): string {
  if (kg <= 0) return "\u2014";
  if (kg >= 1000) return (kg / 1000).toFixed(1) + "k vol";
  return Math.round(kg) + " kg vol";
}

/**
 * Abbreviate a number with a "k" suffix past 1000 (e.g. 1500 -> "1.5k",
 * 500 -> "500"). The single home for the thousands-abbreviation that was
 * previously hand-rolled per chart with drifting decimal precision
 * (VolumeChart's axis used 0 decimals while its own tooltip used 1, so a
 * 1500 kg bar sat against a gridline labelled "2k").
 */
export function abbreviateK(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(Math.round(n));
}

/**
 * Round parts to integer percentages that sum to EXACTLY 100
 * (largest-remainder method). Independent Math.round per slice can total
 * 99 or 101 (33.3/33.3/33.4 -> 33+33+33), which reads as an arithmetic
 * error in any labelled breakdown. Zero/empty totals return all zeros.
 */
export function percentagesSummingTo100(values: number[]): number[] {
  const total = values.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
  if (total <= 0) return values.map(() => 0);
  const exact = values.map((v) => ((Number.isFinite(v) ? v : 0) / total) * 100);
  const floors = exact.map(Math.floor);
  let remainder = 100 - floors.reduce((s, v) => s + v, 0);
  // Distribute the leftover points to the largest fractional parts.
  const order = exact
    .map((v, i) => ({ frac: v - floors[i], i }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (const { i } of order) {
    if (remainder <= 0) break;
    result[i] += 1;
    remainder -= 1;
  }
  return result;
}

/** Format distance, showing "—" when zero/null */
export function formatDistance(km: number | null | undefined): string {
  if (!km || km <= 0) return "\u2014";
  return km.toFixed(1);
}

/** Format a stat value, showing "—" when zero/null */
export function formatStat(
  value: number | null | undefined,
  suffix = ""
): string {
  if (value == null || value <= 0) return "\u2014";
  return String(value) + suffix;
}

/** Calculate macro ring percentage (clamped 0–1.3) and done state (±10% of target) */
export function macroRingState(
  value: number,
  target: number
): { pct: number; done: boolean } {
  const pct = Math.min(value / Math.max(target, 1), 1.3);
  return { pct, done: pct >= 0.9 && pct <= 1.1 };
}
