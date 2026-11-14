import { THEME } from "@/lib/theme";
import SectionLabel from "@/components/ui/SectionLabel";
import { Skeleton } from "@/components/LoadingSkeleton";
import { Scale, ArrowRight, ArrowDown, ArrowUp, Minus } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";

export type WeightTrendDirection = "down" | "up" | "flat" | null;

/**
 * Home's weight tile, beside the water tile. It shared its column with a
 * steps tile until the whole-app grill's Q31 (13 November 2026): "The
 * steps tile leaves Home until it feeds something." Steps now feed the
 * activity level offer on Food, and a count on Home that fed nothing went.
 */
export default function WeightTile({
  lastWeight,
  weightUnit,
  onLogWeight,
  lastWeightDate,
  syncStatus,
  saveAnnouncement,
  hideNumber = false,
  weightTrend = null,
  loading = false,
}: {
  lastWeight: string | null;
  weightUnit: string;
  onLogWeight: () => void;
  lastWeightDate: string;
  syncStatus?: string | null;
  saveAnnouncement?: string;
  /* #984 "Hide the number" anti-anxiety mode. When true AND a weight
     exists, the raw figure is replaced with a calm direction
     indicator (arrow + short phrase) + the date. */
  hideNumber?: boolean;
  /* Trend direction derived from logged weight history. null = we
     have a weight but not enough history to call a direction. */
  weightTrend?: WeightTrendDirection;
  /* True while the home data that carries the last weight is still
     loading. The tile then shows a skeleton, not the "not yet logged"
     empty state — every new user sees this window, and an empty state
     that later fills in reads as a glitch. */
  loading?: boolean;
}) {
  /* Home2c a11y pin: each tile button gets an aria-label that
     surfaces its state compactly for screen readers. Without these,
     the reader walks the visual content (icon container \u2192 "Weight"
     micro label \u2192 value or em-dash \u2192 date) which is verbose and
     loses the empty-state intent. */
  const weightUnitDisplay = weightUnit === "lbs" ? "lb" : weightUnit;

  // #984 \u2014 when hiding the number, the phrase + arrow convey the same
  // intent without ever reading the figure aloud.
  const hidden = hideNumber && !!lastWeight;
  const trendPhrase = !hidden
    ? null
    : weightTrend === "down"
      ? "Trending down"
      : weightTrend === "up"
        ? "Trending up"
        : weightTrend === "flat"
          ? "Steady"
          : "Tracking";
  const TrendIcon =
    weightTrend === "down"
      ? ArrowDown
      : weightTrend === "up"
        ? ArrowUp
        : weightTrend === "flat"
          ? ArrowRight
          : Minus;

  const pending = loading && !lastWeight;
  const weightAriaLabel = pending
    ? "Weight loading."
    : !lastWeight
      ? "Weight not yet logged. Log your weight to start tracking trends."
      : hidden
        ? `Weight ${trendPhrase?.toLowerCase()}, last logged ${lastWeightDate}. Tap to log weight.`
        : `Weight ${lastWeight} ${weightUnitDisplay}, last logged ${lastWeightDate}. Tap to log weight.`;
  return (
    /* home-declutter pyramid: this component lives in the RIGHT column
       of the water/weight duo. h-full lets the weight tile stretch to
       match the water tile beside it. DS3: it sits on the card surface,
       like the water tile, rather than the darker muted tile. Under 9em
       of tile (larger text on the phone) the icon gives its room to the
       label, which ran off the tile. The tile has an unseen heading, so
       Home's cards can be stepped through by heading: the visible label
       sits inside the tile's button, where a heading is no heading. */
    <div className="@container grid grid-cols-1 gap-2 h-full">
      <h2 className="sr-only">Weight</h2>
      <button
        type="button"
        onClick={function () {
          haptic();
          trackHomeEvent("home_card_tapped", { card: "weight" });
          onLogWeight();
        }}
        aria-label={weightAriaLabel}
        className="p-3 rounded-xl text-left transition-transform motion-safe:active:scale-[0.97] bg-card card-shadow h-full flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className="size-8 rounded-lg flex @max-[9em]:hidden items-center justify-center flex-shrink-0"
            style={{ backgroundColor: THEME.iconBg }}
          >
            <Scale
              className="size-3.5"
              style={{ color: THEME.semantic.activity }}
              aria-hidden="true"
            />
          </div>
          <SectionLabel>Weight</SectionLabel>
        </div>
        {/* Align the reading beneath the label, like the adjacent water
            tile. Extra height stays below the date rather than displacing
            the number as water controls or sync status change. */}
        <div className="flex-1 flex flex-col min-h-0">
          {pending ? (
            <Skeleton className="h-6 w-16" />
          ) : hidden ? (
            <div className="flex items-center gap-1.5">
              <TrendIcon
                className="size-4 flex-shrink-0"
                style={{ color: THEME.semantic.activity }}
                aria-hidden="true"
              />
              <p className="text-lg font-bold leading-none text-foreground">
                {trendPhrase}
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-1 gap-y-1">
              <p className="text-2xl font-extrabold leading-none text-foreground font-figure tabular-nums">
                {lastWeight ? lastWeight : "\u2014"}
              </p>
              {lastWeight && (
                <span
                  className="text-sm font-medium"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                >
                  {weightUnitDisplay}
                </span>
              )}
            </div>
          )}
          {pending ? (
            <Skeleton className="h-3 w-20 mt-1.5" />
          ) : (
            /* "From profile" ran 2px out of the tile at double text on a
               320pt phone: a word wider than the tile hyphenates. */
            <p
              className="text-micro mt-1 break-words hyphens-auto"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              {lastWeightDate}
            </p>
          )}
        </div>
        <span
          role="status"
          className={
            syncStatus ? "text-micro text-muted-foreground mt-2" : "sr-only"
          }
        >
          {syncStatus ?? saveAnnouncement}
        </span>
      </button>
    </div>
  );
}
