import type { ReactNode } from "react";
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

export function CardSkeleton({ stagger = 0 }: { stagger?: number }) {
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

/*
 * Route-shaped page-load skeletons (the app-root Suspense fallback).
 *
 * These use `Bar`, NOT the staggered `Skeleton` above, for two reasons:
 *   1. The staggered variant starts each block at opacity 0 and fades it
 *      in — on a chunk-load fallback that reads as a near-blank card for
 *      the first few hundred ms.
 *   2. `Skeleton` fills with `bg-muted`, which is ~the same colour as the
 *      grouped page background — so a block placed directly on the page
 *      (a title, a pill row) is invisible. `Bar` fills with a translucent
 *      `foreground` tint that contrasts on BOTH the page background and
 *      the white card surface, and uses Tailwind's built-in `animate-pulse`.
 */
function Bar({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-lg bg-foreground/[0.07] dark:bg-foreground/[0.10]",
        className
      )}
    />
  );
}

function SkelCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("bg-card rounded-2xl p-4 space-y-3", className)}>
      {children}
    </div>
  );
}

/** A row of N equal pills — tab strips, range selectors, chip rows. */
function PillRowSkeleton({ count }: { count: number }) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Bar key={i} className="h-9 flex-1 rounded-full" />
      ))}
    </div>
  );
}

/** A row of N equal stat tiles (e.g. History "total km / runs / pace"). */
function StatTilesSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Bar key={i} className="h-20 flex-1 rounded-xl" />
      ))}
    </div>
  );
}

export function HistorySkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-5">
      <Bar className="h-7 w-40" />
      <PillRowSkeleton count={3} />
      <PillRowSkeleton count={5} />
      <StatTilesSkeleton />
      <SkelCard>
        <Bar className="h-4 w-1/4" />
        <Bar className="h-48 w-full rounded-lg" />
      </SkelCard>
    </div>
  );
}

export function FoodSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <Bar className="h-7 w-24" />
      {/* Calorie ring hero card */}
      <Bar className="h-56 w-full rounded-2xl" />
      {/* Three macro tiles */}
      <StatTilesSkeleton />
      {/* NL input + a couple of meal sections */}
      <Bar className="h-12 w-full rounded-xl" />
      <SkelCard>
        <Bar className="h-4 w-1/3" />
        <Bar className="h-10 w-full" />
      </SkelCard>
      <SkelCard>
        <Bar className="h-4 w-1/3" />
        <Bar className="h-10 w-full" />
      </SkelCard>
    </div>
  );
}

export function ProgramSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <div className="space-y-2">
        <Bar className="h-7 w-40" />
        <Bar className="h-4 w-56" />
      </div>
      <PillRowSkeleton count={2} />
      {/* Week day selector */}
      <div className="flex justify-around">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bar key={i} className="size-12 rounded-full" />
        ))}
      </div>
      {/* Exercise rows */}
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Bar key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function SocialSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <Bar className="h-7 w-28" />
      <PillRowSkeleton count={3} />
      {[0, 1].map((i) => (
        <div key={i} className="bg-card rounded-2xl overflow-hidden">
          <Bar className="h-28 rounded-none" />
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Bar className="size-10 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Bar className="h-3 w-24" />
                <Bar className="h-2.5 w-14" />
              </div>
            </div>
            <Bar className="h-4 w-2/3" />
            <Bar className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      {/* Avatar + title row */}
      <div className="flex items-center gap-3">
        <Bar className="size-14 rounded-full" />
        <div className="flex-1 space-y-2">
          <Bar className="h-5 w-28" />
          <Bar className="h-3 w-40" />
        </div>
      </div>
      {/* List rows */}
      <div className="space-y-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <Bar key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** Fallback for routes without a bespoke shape — header + a few cards. */
export function GenericPageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <Bar className="h-7 w-40" />
      {[0, 1, 2].map((i) => (
        <SkelCard key={i}>
          <Bar className="h-4 w-1/3" />
          <Bar className="h-8 w-full" />
          <Bar className="h-4 w-2/3" />
        </SkelCard>
      ))}
    </div>
  );
}

/**
 * Route-aware content skeleton for the in-Layout Suspense boundary
 * (keeps the bottom nav persistent while a page chunk streams in).
 * Matched on pathname so the placeholder roughly mirrors the page
 * that's about to mount — no full-screen spinner, no layout jump.
 */
export function PageContentSkeleton({ pathname }: { pathname: string }) {
  if (pathname === "/") return <HomeSkeleton />;
  if (pathname.startsWith("/food")) return <FoodSkeleton />;
  if (pathname.startsWith("/history")) return <HistorySkeleton />;
  if (pathname.startsWith("/program")) return <ProgramSkeleton />;
  if (pathname.startsWith("/social")) return <SocialSkeleton />;
  if (pathname.startsWith("/settings")) return <SettingsSkeleton />;
  return <GenericPageSkeleton />;
}
