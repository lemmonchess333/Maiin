/**
 * Pure helpers for parsing food-related values from external sources
 * (Open Food Facts API, manual entry, Gemini AI responses).
 *
 * Extracted from FoodAnalyzer.tsx so each helper can be tested in
 * isolation without mounting the 1000+-line component. Same call
 * sites; behaviour preserved.
 */

/**
 * Coerce an unknown value to a finite number, returning 0 on
 * NaN/Infinity/null/undefined. Used to normalise the Open Food Facts
 * nutriments payload (whose fields can be missing, strings, or null
 * depending on how the product was curated).
 */
export function safeNum(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Pull the grams component out of an Open Food Facts `serving_size`
 * string. Returns the gram value when present and positive,
 * otherwise null.
 *
 * Open Food Facts serving sizes are free-form strings like `"30g"`,
 * `"1 bar (45g)"`, `"100 ml"`. We only handle the simple `<n>g`
 * shape — when no grams are declared the caller defaults to 100g
 * (the universal per-100g basis).
 *
 * DECIMAL COMMAS ARE ACCEPTED, and their absence was a live bug rather
 * than a missing nicety. Open Food Facts is a French-origin, community-
 * edited database, so `"32,5 g"` is an ordinary value in it — and a
 * dot-only pattern did not fail closed on those. It matched the FRACTIONAL
 * digits as if they were the whole serving:
 *
 *   "12,5 g" -> 5     (2.5x under)
 *   "32,5 g" -> 5     (6.5x under)
 *   "0,5 g"  -> 5     (10x OVER)
 *
 * The caller scales every macro by `grams / 100`, so a scanned 32.5 g
 * cereal bar logged a sixth of its real calories under a row still
 * labelled "32,5 g" — the numbers were wrong and the label looked right.
 * Wrong in BOTH directions depending on the digits before the comma,
 * which is why no plausibility check downstream would have caught it.
 *
 * The greedy group handles this without a lookbehind: against "12,5 g"
 * the engine takes "12", extends through ",5", then matches " g". A
 * lookbehind would also work and is deliberately avoided — it needs
 * iOS 16.4+, and this runs in the Capacitor WKWebView.
 */
export function parseServingGrams(servingSize?: string): number | null {
  if (!servingSize) return null;
  const m = servingSize.match(/(\d+(?:[.,]\d+)?)\s*g/i);
  if (!m) return null;
  const grams = Number(m[1].replace(",", "."));
  return Number.isFinite(grams) && grams > 0 ? grams : null;
}

/**
 * Round to one decimal place. Used for macro values (protein, carbs,
 * fat) that need single-decimal precision to avoid 0.13g + 0.27g
 * compounding into integer-rounded totals that disagree with what the
 * user sees on the row.
 */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
