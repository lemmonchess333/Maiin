import { THEME } from "@/lib/theme";
import SectionLabel from "@/components/ui/SectionLabel";
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

/**
 * Steps tile gate. HealthKit shipped (iOS) — the tile is enabled, but only
 * renders on the native shell (steps are impossible on web) AND when Health
 * is actually available; `stepsStatus === "unavailable"` (web / no Health)
 * keeps it hidden so there's never a dead affordance. See POST_LAUNCH.md
 * "Steps tile → HealthKit / Health Connect wiring".
 */
const STEPS_TILE_ENABLED = true;

/* The component reads the gate through this mutable holder so the flip
   path can be exercised in tests without editing source. Flipping
   STEPS_TILE_ENABLED above remains the one-line change that ships. */
// eslint-disable-next-line react-refresh/only-export-components -- test-only gate seam, not a component; fast-refresh impact is nil (module already re-renders on the default export)
export const stepsTileGate = { enabled: STEPS_TILE_ENABLED };

export default function WeightStepsTiles({
  lastWeight,
  weightUnit,
  onLogWeight,
  lastWeightDate,
  hideNumber = false,
  weightTrend = null,
  stepsStatus = "unavailable",
  steps = null,
  onConnectSteps,
}: {
  lastWeight: string | null;
  weightUnit: string;
  onLogWeight: () => void;
  lastWeightDate: string;
  /* #984 "Hide the number" anti-anxiety mode. When true AND a weight
     exists, the raw figure is replaced with a calm direction
     indicator (arrow + short phrase) + the date. */
  hideNumber?: boolean;
  /* Trend direction derived from logged weight history. null = we
     have a weight but not enough history to call a direction. */
  weightTrend?: WeightTrendDirection;
  /* HealthKit steps (native only). Defaults keep the tile hidden for any
     caller that doesn't wire steps (web, isolated renders). */
  stepsStatus?: StepsStatus;
  steps?: number | null;
  onConnectSteps?: () => void;
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

  const weightAriaLabel = !lastWeight
    ? "Weight not yet logged. Log your weight to start tracking trends."
    : hidden
      ? `Weight ${trendPhrase?.toLowerCase()}, last logged ${lastWeightDate}. Tap to log weight.`
      : `Weight ${lastWeight} ${weightUnitDisplay}, last logged ${lastWeightDate}. Tap to log weight.`;
  // Native-only + available-only: hide on web and when Health is unavailable
  // so a dead affordance never ships. The mutable gate keeps the flip
  // testable; isNativePlatform() + the status guard add the runtime rules.
  const stepsTileEnabled =
    stepsTileGate.enabled &&
    isNativePlatform() &&
    stepsStatus !== "unavailable";

  // Connected / ambiguous both render the number (ambiguous = connected but
  // zero/no-data, an iOS read-permission quirk we don't error on). Only
  // `unprompted` shows the Connect affordance.
  const stepsConnected =
    stepsStatus === "connected" || stepsStatus === "ambiguous";
  const stepsValue = steps ?? 0;
  const stepsAriaLabel = stepsConnected
    ? `${stepsValue.toLocaleString()} steps today.`
    : "Steps not yet connected. Connect Apple Health to track steps.";

  return (
    /* home-declutter pyramid: this component now lives in the RIGHT
       column of the water/weight duo, so the tiles stack vertically
       (weight above steps on native) instead of going 2-up — 2-up
       inside a half-width cell would cramp both. h-full lets the
       weight tile stretch to match the water tile beside it. */
    <div className="grid grid-cols-1 gap-2 h-full">
      <button
        type="button"
        onClick={function () {
          haptic();
          trackHomeEvent("home_card_tapped", { card: "weight" });
          onLogWeight();
        }}
        aria-label={weightAriaLabel}
        className="p-3 rounded-xl text-left active:scale-[0.97] bg-muted h-full flex flex-col"
      >
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className="size-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: THEME.iconBg }}
          >
            <Scale
              className="size-3.5"
              style={{ color: THEME.semantic.activity }}
              aria-hidden="true"
            />
          </div>
          <SectionLabel style={{ color: THEME.text.muted }}>
            Weight
          </SectionLabel>
        </div>
        {/* Value centred in the tile's remaining height so the number
            fills the (water-matched) tile instead of clustering at the
            top. No chevron \u2014 the whole tile taps to log, same as the
            water card. */}
        <div className="flex-1 flex flex-col justify-center min-h-0">
          {hidden ? (
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
            <div className="flex items-baseline gap-1">
              <p className="text-2xl font-extrabold leading-none text-foreground font-mono tabular-nums">
                {lastWeight ? lastWeight : "\u2014"}
              </p>
              {lastWeight && (
                <span
                  className="text-sm font-medium"
                  style={{ color: THEME.text.muted }}
                >
                  {weightUnitDisplay}
                </span>
              )}
            </div>
          )}
          <p className="text-micro mt-1" style={{ color: THEME.text.muted }}>
            {lastWeightDate}
          </p>
        </div>
      </button>
      {stepsTileEnabled && (
        <button
          type="button"
          onClick={function () {
            haptic();
            trackHomeEvent("home_card_tapped", { card: "steps" });
            // Only the unprompted tile drives a connect; a connected tile
            // tap is ambient (foreground refresh already keeps it current).
            if (!stepsConnected) onConnectSteps?.();
          }}
          aria-label={stepsAriaLabel}
          className="p-3 rounded-xl text-left active:scale-[0.97] bg-muted group"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <div
              className="size-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: THEME.iconBg }}
            >
              <Footprints
                className="size-3.5"
                style={{ color: THEME.semantic.positive }}
                aria-hidden="true"
              />
            </div>
            <SectionLabel style={{ color: THEME.text.muted }}>
              Steps
            </SectionLabel>
          </div>
          {stepsConnected ? (
            <>
              <div className="flex items-baseline gap-1">
                <p className="text-xl font-bold leading-none text-foreground font-mono tabular-nums">
                  {stepsValue.toLocaleString()}
                </p>
              </div>
              <p
                className="text-micro mt-1"
                style={{ color: THEME.text.muted }}
              >
                today
              </p>
            </>
          ) : (
            <div className="flex items-center gap-1.5">
              <span
                className="text-xs font-medium"
                style={{ color: THEME.brand }}
              >
                Connect Health
              </span>
              <ArrowRight
                className="size-3"
                style={{ color: THEME.brand }}
                aria-hidden="true"
              />
            </div>
          )}
        </button>
      )}
    </div>
  );
}
