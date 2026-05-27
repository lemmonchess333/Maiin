import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  /** Stagger delay index (0-4) for sequential appearance */
  stagger?: number;
}

export function Skeleton({ className, stagger }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      aria-live="polite"
      className={cn(
        "animate-pulse rounded-lg bg-muted dark:bg-muted/60",
        className
      )}
      style={{
        backgroundImage:
          "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)",
        backgroundSize: "200% 100%",
        animation:
          "pulse 2s ease-in-out infinite, shimmer 1.5s ease-in-out infinite",
        animationDelay: stagger != null ? `${stagger * 80}ms` : undefined,
        opacity: stagger != null ? 0 : undefined,
        animationFillMode: stagger != null ? "forwards" : undefined,
      }}
    />
  );
}

function CardSkeleton({ stagger = 0 }: { stagger?: number }) {
  return (
    <div
      className="bg-card rounded-2xl p-4 space-y-3"
      style={{ animationDelay: `${stagger * 80}ms` }}
    >
      <Skeleton className="h-4 w-1/3" stagger={stagger} />
      <Skeleton className="h-8 w-full" stagger={stagger + 1} />
      <Skeleton className="h-4 w-2/3" stagger={stagger + 2} />
    </div>
  );
}

export function ChartSkeleton({ stagger = 0 }: { stagger?: number }) {
  return (
    <div
      className="bg-card rounded-2xl p-4 space-y-3"
      style={{ animationDelay: `${stagger * 80}ms` }}
    >
      <Skeleton className="h-4 w-1/4" stagger={stagger} />
      <Skeleton className="h-48 w-full rounded-lg" stagger={stagger + 1} />
    </div>
  );
}

/**
 * Matches the shape of an ActivityCard so the feed doesn't visually
 * jump when real data swaps in. Used for the initial-load state of
 * the Following and Discover feeds.
 */
export function ActivityCardSkeleton({ stagger = 0 }: { stagger?: number }) {
  return (
    <div className="bg-card rounded-2xl overflow-hidden">
      {/* Map / route preview area */}
      <Skeleton className="h-28 rounded-none" stagger={stagger} />
      <div className="p-4 space-y-3">
        {/* Author row — avatar + name + time */}
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" stagger={stagger} />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-24" stagger={stagger + 1} />
            <Skeleton className="h-2.5 w-14" stagger={stagger + 1} />
          </div>
        </div>
        {/* Activity title + stat line */}
        <Skeleton className="h-4 w-2/3" stagger={stagger + 2} />
        <Skeleton className="h-3 w-1/2" stagger={stagger + 2} />
        {/* Kudos / comment row */}
        <div className="flex items-center gap-4 pt-2">
          <Skeleton className="h-6 w-14 rounded-full" stagger={stagger + 3} />
          <Skeleton className="h-6 w-14 rounded-full" stagger={stagger + 3} />
        </div>
      </div>
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" stagger={0} />
        <Skeleton className="h-4 w-32" stagger={1} />
      </div>
      <Skeleton className="h-16 w-full rounded-xl" stagger={2} />
      <CardSkeleton stagger={3} />
      <ChartSkeleton stagger={5} />
      <CardSkeleton stagger={7} />
    </div>
  );
}
