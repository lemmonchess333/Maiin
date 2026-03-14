import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        "animate-pulse rounded-lg bg-muted dark:bg-muted/60",
        className
      )}
      style={{
        backgroundImage: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)",
        backgroundSize: "200% 100%",
        animation: "pulse 2s ease-in-out infinite, shimmer 1.5s ease-in-out infinite",
      }}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-card rounded-2xl border border-border/50 p-4 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="bg-card rounded-2xl border border-border/50 p-4 space-y-3">
      <Skeleton className="h-4 w-1/4" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-16 w-full rounded-xl" />
      <CardSkeleton />
      <ChartSkeleton />
      <CardSkeleton />
    </div>
  );
}
