import { Suspense } from "react";
import { lazyRetry } from "@/lib/lazyRetry";
import SectionHeading from "@/components/ui/SectionHeading";
import { cardClasses } from "@/components/ui/cardClasses";
import { Skeleton } from "@/components/LoadingSkeleton";
import { haptic } from "@/lib/haptic";

/* The body diagrams carry their own chunk (`body-highlighter`); the
   overview should not pull it into the page's first paint. */
const MuscleHeatMap = lazyRetry(
  () => import("@/components/analytics/MuscleHeatMap")
);

/**
 * The overview's Muscles card (DS3): the muscle map small, beside the
 * four groups trained most in the range. The whole card opens the Lifting
 * page, which holds the full map with every group and its recovery.
 */
export default function AnalyticsMuscles({
  data,
  onOpen,
}: {
  /** Sets per muscle group in the range, as the Lifting page's map takes. */
  data: Record<string, number>;
  onOpen: () => void;
}) {
  if (!Object.values(data).some((sets) => sets > 0)) return null;
  return (
    <section aria-label="Muscles trained" className="space-y-2">
      <SectionHeading>Muscles trained</SectionHeading>
      <button
        type="button"
        onClick={() => {
          haptic();
          onOpen();
        }}
        className={cardClasses({
          className:
            "block w-full text-left transition-transform motion-safe:active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        })}
      >
        <Suspense fallback={<Skeleton className="h-32 w-full" />}>
          <MuscleHeatMap data={data} variant="compact" />
        </Suspense>
      </button>
    </section>
  );
}
