import SustainedOfflineBanner from "@/components/ui/SustainedOfflineBanner";

interface HistoryOfflineBannerProps {
  /** Overrides the 30s threshold. Exposed for tests. */
  thresholdMs?: number;
}

/**
 * Hist4 cross-cutting offline banner. Thin wrapper over the shared
 * SustainedOfflineBanner primitive — the timer / a11y / animation
 * logic lives there; this file just owns the History-specific copy.
 *
 * Per the Hist4 lock: "Firestore offline persistence + reconnect
 * banner if disconnected >30s". History is largely read-only —
 * Firestore's local cache covers the data display transparently —
 * so the copy explains the user is looking at cached data rather
 * than implying anything is broken.
 */
export default function HistoryOfflineBanner({ thresholdMs }: HistoryOfflineBannerProps) {
  return (
    <SustainedOfflineBanner thresholdMs={thresholdMs} bannerKey="history-offline">
      You&rsquo;re viewing cached data. Latest activity will sync when you
      reconnect.
    </SustainedOfflineBanner>
  );
}
