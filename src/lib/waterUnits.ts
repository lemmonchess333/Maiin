/**
 * Water units + presets (Water "B" model — millilitres).
 *
 * The water card moved from a whole-"glasses" count (each tap = one
 * 0.25 L glass) to a real millilitre model so users can log actual
 * container sizes in one tap (Glass / Bottle / Large / custom), the
 * way Cal AI, MyFitnessPal and Cronometer do.
 *
 * Pure + dependency-free so it's trivially unit-tested and shared by
 * `useWaterLog` (read/migrate/write) and the card UI. Legacy docs +
 * the legacy `profile.targetWaterGlasses` field are read through the
 * migration helpers below — a glass is exactly 250 ml, so old data
 * maps forward losslessly.
 */

/** One legacy "glass" in millilitres. */
export const GLASS_ML = 250;

/** Default daily target when the profile carries none: 2 L (= the old
 *  8-glass default × 250 ml). */
export const DEFAULT_TARGET_ML = 2000;

/** Reasonable ceiling for a single custom entry (guards fat-finger /
 *  pathological input). 3 L in one go is already unusual. */
export const MAX_SINGLE_LOG_ML = 3000;

export interface WaterPreset {
  id: string;
  label: string;
  ml: number;
}

/** The one-tap container presets surfaced in the size sheet. */
export const WATER_PRESETS: readonly WaterPreset[] = [
  { id: "glass", label: "Glass", ml: 250 },
  { id: "bottle", label: "Bottle", ml: 500 },
  { id: "large", label: "Large", ml: 750 },
] as const;

/** Non-negative integer millilitres, clamped. Firestore stores whole
 *  numbers here — no fractional ml. */
export function clampMl(ml: number): number {
  if (!Number.isFinite(ml) || ml <= 0) return 0;
  return Math.round(ml);
}

/**
 * Resolve today's consumed millilitres from a raw waterLog doc.
 * Prefers the new `ml` field; falls back to the legacy `glasses`
 * count (× 250) so pre-migration days still render + count.
 */
export function resolveConsumedMl(raw: {
  ml?: unknown;
  glasses?: unknown;
}): number {
  if (typeof raw.ml === "number" && Number.isFinite(raw.ml)) {
    return clampMl(raw.ml);
  }
  if (typeof raw.glasses === "number" && Number.isFinite(raw.glasses)) {
    return clampMl(raw.glasses * GLASS_ML);
  }
  return 0;
}

/**
 * Resolve the daily target in millilitres. Prefers a stored `targetMl`
 * (day snapshot or, in future, an editable ml target), then the legacy
 * `targetGlasses` / `targetWaterGlasses` (× 250), then the 2 L default.
 */
export function resolveTargetMl(raw: {
  targetMl?: unknown;
  targetGlasses?: unknown;
  targetWaterGlasses?: unknown;
}): number {
  // Number.isFinite, not just typeof: Infinity passes `typeof === "number"
  // && > 0`, then clampMl collapses it to 0 — short-circuiting the
  // documented 2 L fallback and zeroing the target (waterProgress(x, 0) is
  // 0, so the wave never fills). The sibling resolveConsumedMl already
  // checks finiteness; this was the asymmetric half (probe sweep
  // 2026-08-05, verifier-confirmed).
  if (
    typeof raw.targetMl === "number" &&
    Number.isFinite(raw.targetMl) &&
    raw.targetMl > 0
  ) {
    return clampMl(raw.targetMl);
  }
  const legacyGlasses =
    (typeof raw.targetGlasses === "number" ? raw.targetGlasses : undefined) ??
    (typeof raw.targetWaterGlasses === "number"
      ? raw.targetWaterGlasses
      : undefined);
  if (
    typeof legacyGlasses === "number" &&
    Number.isFinite(legacyGlasses) &&
    legacyGlasses > 0
  ) {
    return clampMl(legacyGlasses * GLASS_ML);
  }
  return DEFAULT_TARGET_ML;
}

/** Fraction of target consumed, clamped 0..1 (for the wave fill). */
export function waterProgress(ml: number, targetMl: number): number {
  if (targetMl <= 0) return 0;
  return Math.min(Math.max(ml, 0) / targetMl, 1);
}

/**
 * Compact volume label. Sub-litre reads in ml ("250 ml", "750 ml");
 * ≥1 L reads in litres with trailing zeros trimmed ("1 L", "1.25 L",
 * "2.5 L"). Container sizes stay in ml where that's how people think;
 * running totals cross into litres.
 */
export function formatVolume(ml: number): string {
  const v = clampMl(ml);
  if (v < 1000) return `${v} ml`;
  const litres = (v / 1000).toFixed(2).replace(/\.?0+$/, "");
  return `${litres} L`;
}

/** Litres value only (no unit), trimmed — for the card's hero number
 *  where the "L" unit is rendered separately. */
export function formatLitresValue(ml: number): string {
  return (clampMl(ml) / 1000).toFixed(2).replace(/\.?0+$/, "");
}
