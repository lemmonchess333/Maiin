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
        backgroundImage: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)",
        backgroundSize: "200% 100%",
        animation: "pulse 2s ease-in-out infinite, shimmer 1.5s ease-in-out infinite",
        animationDelay: stagger != null ? `${stagger * 80}ms` : undefined,
        opacity: stagger != null ? 0 : undefined,
        animationFillMode: stagger != null ? "forwards" : undefined,
      }}
    />
  );
}

export function CardSkeleton({ stagger = 0 }: { stagger?: number }) {
  return (
    <div className="bg-card rounded-2xl p-4 space-y-3" style={{ animationDelay: `${stagger * 80}ms` }}>
      <Skeleton className="h-4 w-1/3" stagger={stagger} />
      <Skeleton className="h-8 w-full" stagger={stagger + 1} />
      <Skeleton className="h-4 w-2/3" stagger={stagger + 2} />
    </div>
  );
}

export function ChartSkeleton({ stagger = 0 }: { stagger?: number }) {
  return (
    <div className="bg-card rounded-2xl p-4 space-y-3" style={{ animationDelay: `${stagger * 80}ms` }}>
      <Skeleton className="h-4 w-1/4" stagger={stagger} />
      <Skeleton className="h-48 w-full rounded-lg" stagger={stagger + 1} />
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
