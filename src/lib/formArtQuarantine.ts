/**
 * Released illustrations found to teach the wrong equipment, contact, or
 * movement in the October 2026 full-sequence audit. Keep their release
 * records intact for provenance, but show the checked motion rig instead
 * until coherent replacement frames have passed visual review.
 */
export const FORM_ART_QUARANTINE_IDS = new Set([
  "assault-bike",
  "bench-dips",
  "bench-press",
  "burpees",
  "clean-and-press",
  "close-grip-bench",
  "db-bench",
  "front-squat",
  "hip-abduction-machine",
  "inverted-row",
  "seated-row",
  "smith-bench-press",
]);

export const isFormArtQuarantined = (id: string): boolean =>
  FORM_ART_QUARANTINE_IDS.has(id);
