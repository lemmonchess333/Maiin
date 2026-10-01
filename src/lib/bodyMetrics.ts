/**
 * Body metrics: the ranges a profile accepts, and a height as people say it.
 *
 * The ranges are the server's, not a guess.
 *
 * `functions/profileSanitizer.js` drops a `heightCm` or `weightKg` outside
 * them, and `completeOnboarding` then refuses the save as a missing field.
 * A wider range on the phone lets an answer pass every check there and then
 * fail the save as "Check your connection", which no connection can fix.
 * Onboarding and Settings validate against these so a value the app takes
 * is one the server keeps; the sanitizer side is pinned by
 * `bodyMetrics.cross.test.ts`.
 */
export const HEIGHT_CM = { min: 120, max: 230 } as const;
export const WEIGHT_KG = { min: 30, max: 300 } as const;

const CM_PER_INCH = 2.54;

/** A whole-inch height as people say it: "4 ft", "7 ft 6 in". */
function feetAndInches(totalInches: number): string {
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return inches === 0 ? `${feet} ft` : `${feet} ft ${inches} in`;
}

/** A stored height in the unit the person chose: "175 cm", "5 ft 9 in". */
export function formatHeight(cm: number, unit: "cm" | "ft"): string {
  return unit === "ft"
    ? feetAndInches(Math.round(cm / CM_PER_INCH))
    : `${Number(cm.toFixed(1))} cm`;
}

/** The height range in feet and inches, inside the centimetre bounds:
 *  "4 ft to 7 ft 6 in". */
export function heightRangeInFeet(): string {
  return `${feetAndInches(Math.ceil(HEIGHT_CM.min / CM_PER_INCH))} to ${feetAndInches(
    Math.floor(HEIGHT_CM.max / CM_PER_INCH)
  )}`;
}
