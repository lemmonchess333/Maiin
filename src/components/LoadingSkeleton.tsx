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
        // Never wider than its box: a placeholder's width is in rem, so at
        // 2x text a `w-40` bar (320px) ran off a 320px phone's screen.
        "ds-skeleton max-w-full rounded-lg bg-muted dark:bg-muted/60",
        className
      )}
      style={{
        /* Theme-flipped token, not a literal. The hardcoded
           rgba(255,255,255,0.04) this replaced assumed a dark canvas: over
           light `bg-muted` (rgb 248,248,249) it changed the pixel by ZERO
           bytes, so every light-mode skeleton in the app had no sweep at
           all — only the `pulse` opacity. Same shape as the ChallengeCard
           marker that rendered invisibly on the white card. */
        backgroundImage:
          "linear-gradient(90deg, transparent 0%, var(--skeleton-shimmer) 50%, transparent 100%)",
        backgroundSize: "200% 100%",
        /* The stagger offsets each block's place in the pulse (the
           `.ds-skeleton` animation in animations.css), so a column breathes
           in sequence. It must never hide a block: an opacity of 0 here,
           filled `forwards` into a keyframe with no end state, leaves every
           staggered block invisible under Reduce Motion, a blank Home and
           feed while loading (skeletonReducedMotion.test.tsx). */
        animationDelay: stagger != null ? `${stagger * 80}ms` : undefined,
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
 * These use `Bar`, NOT `Skeleton` above: `Skeleton` fills with
 * `bg-muted`, which is ~the same colour as the grouped page background —
 * so a block placed directly on the page (a title, a pill row) is
 * invisible. `Bar` fills with a translucent `foreground` tint that
 * contrasts on BOTH the page background and the white card surface, and
 * uses Tailwind's built-in `motion-safe:animate-pulse`.
 */
function Bar({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "motion-safe:animate-pulse rounded-lg bg-foreground/[0.07] dark:bg-foreground/[0.10]",
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

/** Bar's fill, for a placeholder that is text rather than a block. */
const BAR_FILL =
  "motion-safe:animate-pulse rounded-lg bg-foreground/[0.07] dark:bg-foreground/[0.10]";

/**
 * A placeholder for one line of text, set in that line's own classes
 * (Pol1). It is a no-break space in the line's type, so it is exactly one
 * line of it tall and grows with the reader's text size as the line will.
 * A bar sized in pixels matched one text size and moved everything under
 * it at every other.
 */
function LineBar({
  text,
  className,
  as: Tag = "p",
}: {
  /** The classes of the line it stands for: its size, weight, leading. */
  text?: string;
  /** The placeholder's own width and shape. */
  className?: string;
  as?: "p" | "span";
}) {
  return (
    <Tag aria-hidden className={cn(Tag === "span" && "block", text)}>
      {/* Top-aligned, so the line is its leading and nothing more: on the
          baseline, the bar's own descent space made each line a pixel
          taller than the text it stands for. */}
      <span
        className={cn("inline-block max-w-full align-top", BAR_FILL, className)}
      >
        {"\u00a0"}
      </span>
    </Tag>
  );
}

/**
 * The Performance card's shape while its week loads (Pol1): the score,
 * the change on last week, two lines of words, the six-week line and its
 * dates, each in the box it holds the place of. A shorter placeholder,
 * or one without the Details beside its heading, drops the range pills
 * and everything under them when the score lands. The steady state is
 * what it copies: a new account's empty card is shorter, and a week
 * without a change has no chip.
 */
export function PerformanceCardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading"
      data-skeleton="performance-card"
      className="bg-card card-shadow rounded-2xl p-4 space-y-3"
    >
      <div className="flex flex-wrap items-start gap-3">
        <LineBar
          text="text-display font-extrabold font-mono tabular-nums leading-none"
          className="w-[2ch]"
        />
        <div className="min-w-[min(100%,9em)] flex-1 space-y-1 pt-0.5">
          {/* The change chip is inline in the real card, on a line of its
              own above the words, so it is inline here too. */}
          <span
            aria-hidden
            className={cn(
              "inline-block w-12 px-2 py-0.5 text-xs align-top",
              BAR_FILL,
              "rounded-full"
            )}
          >
            {"\u00a0"}
          </span>
          <div>
            <LineBar text="text-sm" className="w-full" />
            <LineBar text="text-sm" className="w-2/3" />
          </div>
        </div>
      </div>
      <div>
        {/* Sparkline draws 300 by 44 at the card's width. */}
        <Bar className="w-full aspect-[300/44]" />
        <div className="mt-1 flex justify-between text-xs">
          <LineBar as="span" className="w-12" />
          <LineBar as="span" className="w-14" />
        </div>
      </div>
    </div>
  );
}

/**
 * Social's Circles card while the list of Circles loads: an icon tile, a
 * title, two lines of words and two buttons, the card an account with no
 * Circle meets (every account starts there). The list arrives after the
 * rest of the Together tab's reads, seconds after the heading on a phone,
 * and a bare block in the page's grey reads as an empty box for all that
 * time. The buttons sit side by side while they fit and stack on a narrow
 * card, as the real ones do.
 */
export function CirclesCardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading"
      data-skeleton="circles-card"
      className="@container rounded-2xl bg-card p-4 space-y-3"
    >
      <div className="flex items-start gap-3">
        <Bar className="size-9 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <LineBar text="text-sm font-semibold" className="w-2/5" />
          <div className="mt-1">
            <LineBar text="text-xs" className="w-full" />
            <LineBar text="text-xs" className="w-3/4" />
          </div>
        </div>
      </div>
      <div className="flex gap-2 @max-[18em]:flex-col">
        <Bar className="h-[44px] flex-1 rounded-xl" />
        <Bar className="h-[44px] flex-1 rounded-xl" />
      </div>
    </div>
  );
}

/**
 * The range card's shape while the range loads (Pol1): its title and the
 * line under it, three figures with their change, the bar chart at its
 * own proportions, its dates and its key, so the chart arriving moves
 * nothing under it.
 */
export function PeriodSummarySkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading"
      data-skeleton="period-summary"
      className="bg-card card-shadow rounded-2xl p-4 space-y-4"
    >
      <div>
        <LineBar text="text-h3 font-bold" className="w-32" />
        <LineBar text="text-sm" className="w-48" />
      </div>
      <div className="@container -mx-2">
        <div className="grid grid-cols-3 @max-[17em]:grid-cols-1 gap-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="min-w-0 px-2 py-2">
              <LineBar
                as="span"
                text="text-h2 font-extrabold font-mono tabular-nums leading-tight"
                className="w-14"
              />
              <LineBar as="span" text="text-sm" className="w-16" />
              <LineBar
                as="span"
                text="text-xs font-semibold"
                className="w-10"
              />
            </div>
          ))}
        </div>
      </div>
      <div>
        {/* PeriodSummaryCard's chart is a 300 by 88 viewBox at full width. */}
        <Bar className="w-full aspect-[300/88]" />
        <div className="mt-1 flex justify-between text-xs">
          <LineBar as="span" className="w-10" />
          <LineBar as="span" className="w-14" />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <LineBar as="span" className="w-12" />
          <LineBar as="span" className="w-12" />
        </div>
      </div>
    </div>
  );
}

/** A segmented control's track: 44 px segments in a 0.25rem inset,
 *  which grows with the text size as the control's own does. */
function TrackBar() {
  return <Bar className="h-[calc(44px+0.5rem)] w-full rounded-xl" />;
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

/**
 * Analytics while its page loads, block for block in the overview's own
 * order and rhythm (Pol1): PageShell's title, the Analytics / PRs /
 * Badges switch, Performance under its heading, the range, and the range
 * card. In any other order the whole page reshuffles as it arrives. `historySkeleton
 * .test.tsx` holds the order to History's.
 */
export function HistorySkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <div data-skeleton-for="title" className="pt-1 pb-1">
        <LineBar
          text="text-h1 leading-tight tracking-tight font-extrabold"
          className="w-40"
        />
      </div>
      <div data-skeleton-for="tabs">
        <TrackBar />
      </div>
      <div data-skeleton-for="performance" className="space-y-2">
        {/* SectionHeading with its Details action: one 44 px row. */}
        <div className="flex min-h-11 items-center">
          <LineBar
            text="text-h3 font-bold tracking-tight leading-tight"
            className="w-36"
          />
        </div>
        <PerformanceCardSkeleton />
      </div>
      <div data-skeleton-for="range">
        <TrackBar />
      </div>
      <div data-skeleton-for="period-summary">
        <PeriodSummarySkeleton />
      </div>
    </div>
  );
}

export function FoodSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <Bar className="h-7 w-24" />
      {/* Match the compact summary and standing logging group. */}
      <Bar className="h-32 w-full rounded-2xl" />
      <Bar className="h-36 w-full rounded-xl" />
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
