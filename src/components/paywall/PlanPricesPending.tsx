import { Skeleton } from "@/components/LoadingSkeleton";
import { Button } from "@/components/ui/Button";

/**
 * Where a paywall's prices go on the iPhone while the App Store's are on
 * their way, or after they could not be read (`useProPlanPrices`). The
 * iPhone paywall prints only the App Store's prices, never a stand-in, so
 * it holds the place and, if the store didn't answer, offers to ask again.
 * Shared by the Upgrade page and ProModal.
 */
export default function PlanPricesPending({
  failed,
  onRetry,
}: {
  failed: boolean;
  onRetry: () => void;
}) {
  if (!failed) {
    return (
      <div className="space-y-2" data-testid="plan-prices-pending">
        <Skeleton className="h-6 w-2/3 mx-auto" />
        <p role="status" className="sr-only">
          Getting prices from the App Store
        </p>
      </div>
    );
  }
  return (
    <div role="note" className="space-y-2 text-center">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Couldn’t get prices from the App Store.
      </p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
