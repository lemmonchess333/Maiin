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

/** Format distance, showing "—" when zero/null */
export function formatDistance(km: number | null | undefined): string {
  if (!km || km <= 0) return "\u2014";
  return km.toFixed(1);
}

/** Format a stat value, showing "—" when zero/null */
export function formatStat(value: number | null | undefined, suffix = ""): string {
  if (value == null || value <= 0) return "\u2014";
  return String(value) + suffix;
}

/** Calculate macro ring percentage (clamped 0–1.3) and done state (±10% of target) */
export function macroRingState(value: number, target: number): { pct: number; done: boolean } {
  const pct = Math.min(value / Math.max(target, 1), 1.3);
  return { pct, done: pct >= 0.90 && pct <= 1.10 };
}
