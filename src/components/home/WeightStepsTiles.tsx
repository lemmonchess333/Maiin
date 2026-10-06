import { THEME } from "@/lib/theme";
import SectionLabel from "@/components/ui/SectionLabel";
import { Skeleton } from "@/components/LoadingSkeleton";
import {
  Scale,
  Footprints,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Minus,
} from "lucide-react";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";
import { isNativePlatform } from "@/lib/platform";
import type { StepsStatus } from "@/hooks/useSteps";

export type WeightTrendDirection = "down" | "up" | "flat" | null;

export default function WeightStepsTiles({
  lastWeight,
  weightUnit,
  onLogWeight,
  lastWeightDate,
  syncStatus,
  saveAnnouncement,
  hideNumber = false,
  weightTrend = null,
  stepsStatus = "unavailable",
  steps = null,
  onConnectSteps,
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
  /* HealthKit steps. On the native shell the default ("unavailable")
     keeps the tile hidden for a caller that doesn't wire steps; on the
     web the tile shows its Connect state whatever the status. */
  stepsStatus?: StepsStatus;
  steps?: number | null;
  onConnectSteps?: () => void;
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
  // Steps (ADR-0007 Q5, and the owner's call). A browser can't read
  // Apple Health, but the web still shows the tile, in the state a new
  // iPhone user sees ("Connect Health"), so the web preview has the
  // phone's layout. There it is a picture, not a control: a plain element
  // that connects nothing. On the phone the tile hides only when the
  // device has no Health at all. See POST_LAUNCH.md "Steps tile".
  const native = isNativePlatform();
  const stepsTileEnabled = !native || stepsStatus !== "unavailable";

  // Connected / ambiguous both render the number (ambiguous = connected but
  // zero/no-data, an iOS read-permission quirk we don't error on). Every
  // other state shows Connect: `unprompted` on the phone, and the web.
  const stepsConnected =
    stepsStatus === "connected" || stepsStatus === "ambiguous";
  const stepsValue = steps ?? 0;
  const stepsAriaLabel = stepsConnected
    ? `${stepsValue.toLocaleString()} steps today.`
    : "Steps not yet connected. Connect Apple Health to track steps.";

  const stepsBody = (
    <>
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className="size-8 rounded-lg flex @max-[9em]:hidden items-center justify-center flex-shrink-0"
          style={{ backgroundColor: THEME.iconBg }}
        >
          {/* The weight tile's colour: steps are a reading like weight,
              and green means a good result (DS3, one colour per job). */}
          <Footprints
            className="size-3.5"
            style={{ color: THEME.semantic.activity }}
            aria-hidden="true"
          />
        </div>
        <SectionLabel>Steps</SectionLabel>
      </div>
      {stepsConnected ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-1 gap-y-1">
            {/* Same tier as the weight figure directly above it: peer
                tiles stacked in one column, so the same size and weight
                (DESIGN_GUIDE: never mix 700 and 800 in one tier). Only
                the phone shows this state; the web shows Connect. */}
            <p className="text-2xl font-extrabold leading-none text-foreground font-mono tabular-nums">
              {stepsValue.toLocaleString()}
            </p>
          </div>
          <p
            className="text-micro mt-1"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            today
          </p>
        </>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-lifting-strong">
            Connect Health
            {!native && (
              <span className="sr-only"> in the Tropos iPhone app</span>
            )}
          </span>
          <ArrowRight
            className="size-3"
            style={{ color: THEME.brand }}
            aria-hidden="true"
          />
        </div>
      )}
    </>
  );

  return (
    /* home-declutter pyramid: this component lives in the RIGHT column
       of the water/weight duo, so the tiles stack vertically (weight
       above steps on native) instead of going 2-up — 2-up inside a
       half-width cell would cramp both. h-full lets the weight tile
       stretch to match the water tile beside it. DS3: both tiles sit on
       the card surface, like the water tile, rather than the darker
       muted tile. Under 9em of tile (larger text on the phone) the
       icons give their room to the labels, which ran off the tile. */
    <div className="@container grid grid-cols-1 gap-2 h-full">
      <button
        type="button"
        onClick={function () {
          haptic();
          trackHomeEvent("home_card_tapped", { card: "weight" });
          onLogWeight();
        }}
        aria-label={weightAriaLabel}
        className="p-3 rounded-xl text-left motion-safe:active:scale-[0.97] bg-card card-shadow h-full flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
              <p className="text-2xl font-extrabold leading-none text-foreground font-mono tabular-nums">
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
            <p
              className="text-micro mt-1"
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
      {stepsTileEnabled &&
        (native ? (
          <button
            type="button"
            onClick={function () {
              haptic();
              trackHomeEvent("home_card_tapped", { card: "steps" });
              // Only the unprompted tile connects; a connected tile tap is
              // ambient (foreground refresh already keeps it current).
              if (stepsStatus === "unprompted") onConnectSteps?.();
            }}
            aria-label={stepsAriaLabel}
            className="p-3 rounded-xl text-left motion-safe:active:scale-[0.97] bg-card card-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {stepsBody}
          </button>
        ) : (
          <div className="p-3 rounded-xl bg-card card-shadow">{stepsBody}</div>
        ))}
    </div>
  );
}
