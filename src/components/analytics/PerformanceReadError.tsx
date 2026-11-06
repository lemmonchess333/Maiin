import ErrorState from "@/components/ui/ErrorState";

/** A failed score read is not an empty training history. */
export default function PerformanceReadError({
  onRetry,
}: {
  onRetry?: () => void;
}) {
  return (
    <ErrorState
      title="Performance could not load"
      description="Your scores are unavailable right now."
      retry={onRetry ? { onClick: onRetry } : undefined}
    />
  );
}
