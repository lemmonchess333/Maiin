import type { ProFeatureKey } from "@/lib/proFeatures";

/** The product frames the paywall can lead with. Drawn in `ProPreview`. */
export type ProPreviewFrame = "scan" | "target";

/**
 * The frame order for the feature that brought the user here. The
 * feature they tapped leads; the other follows. Only the gated features
 * have frames — running progression, the Performance Index and the
 * week's verdict are free (Sub2), so a paywall never previews them: it
 * advertises only what is runtime-gated. No feature → the canonical
 * order, scan first: AI logging is the headline.
 *
 * A plain module rather than an export of `ProPreview.tsx` because a
 * component file that also exports a function breaks Fast Refresh for
 * every component in it.
 */
export function framesForFeature(
  featureKey?: ProFeatureKey | null
): ProPreviewFrame[] {
  switch (featureKey) {
    case "adaptive_tdee":
    case "adaptive_macros":
      return ["target", "scan"];
    case "ai_food_logging":
    default:
      return ["scan", "target"];
  }
}
