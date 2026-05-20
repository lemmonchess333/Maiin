import SustainedOfflineBanner from "@/components/ui/SustainedOfflineBanner";

interface FoodOfflineBannerProps {
  /** Overrides the 30s threshold. Exposed for tests. */
  thresholdMs?: number;
}

/**
 * Food6 cc2: page-level offline notice with Food-specific copy.
 * Thin wrapper over the shared SustainedOfflineBanner primitive —
 * the timer / a11y / animation logic lives there; this file just
 * owns the wording.
 *
 * The global Layout banner ("You're offline — changes will sync
 * when reconnected") fires immediately on disconnect. This banner
 * surfaces only after the disconnect has lasted 30s and explains
 * which Food features specifically degrade (image AI + barcode
 * lookup both require network; text NL logging keeps working via
 * offlineQueue; hero card uses cached data).
 */
export default function FoodOfflineBanner({ thresholdMs }: FoodOfflineBannerProps) {
  return (
    <SustainedOfflineBanner thresholdMs={thresholdMs} bannerKey="food-offline">
      Image AI and barcode scanner are unavailable offline. Text logging keeps
      working — entries sync when you reconnect.
    </SustainedOfflineBanner>
  );
}
