import { THEME } from "@/lib/theme";
import SectionLabel from "@/components/ui/SectionLabel";
import {
  Scale,
  Footprints,
  ArrowRight,
  ChevronRight,
  ArrowDown,
  ArrowUp,
  Minus,
} from "lucide-react";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";
import { isNativePlatform } from "@/lib/platform";

export type WeightTrendDirection = "down" | "up" | "flat" | null;

export default function WeightStepsTiles({
  lastWeight,
  weightUnit,
  onLogWeight,
  lastWeightDate,
  hideNumber = false,
  weightTrend = null,
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

  // The Steps tile is a HealthKit / Health Connect placeholder: web
  // browsers have no step data, so "Connect Health" is a dead CTA on
  // web (POST_LAUNCH.md "Steps tile → HealthKit wiring"). Show it only
  // on native, where the real integration will land; on web Weight goes
  // full-width so there's no fake health-connection affordance. Keep the
  // native placeholder until the plugin work is approved.
  const showSteps = isNativePlatform();

  return (
    <div
      className={
        showSteps ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-2"
      }
    >
      <button
        type="button"
        onClick={function () {
          haptic();
          trackHomeEvent("home_card_tapped", { card: "weight" });
          onLogWeight();
        }}
        aria-label={weightAriaLabel}
        className="p-3 rounded-xl text-left active:scale-[0.97] bg-muted relative"
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
        {hidden ? (
          <div className="flex items-center gap-1.5">
            <TrendIcon
              className="size-4 flex-shrink-0"
              style={{ color: THEME.semantic.activity }}
              aria-hidden="true"
            />
            <p className="text-base font-bold leading-none text-foreground">
              {trendPhrase}
            </p>
          </div>
        ) : (
          <div className="flex items-baseline gap-1">
            <p className="text-xl font-bold leading-none text-foreground font-mono tabular-nums">
              {lastWeight ? lastWeight : "\u2014"}
            </p>
            {lastWeight && (
              <span className="text-xs" style={{ color: THEME.text.muted }}>
                {weightUnitDisplay}
              </span>
            )}
          </div>
        )}
        <p className="text-micro mt-1" style={{ color: THEME.text.muted }}>
          {lastWeightDate}
        </p>
        <ChevronRight
          className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3"
          style={{ color: THEME.text.muted }}
          aria-hidden="true"
        />
      </button>
      {showSteps && (
        <button
          type="button"
          onClick={function () {
            haptic();
            trackHomeEvent("home_card_tapped", { card: "steps" });
          }}
          aria-label="Steps not yet connected. Connect Apple Health to track steps."
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
        </button>
      )}
    </div>
  );
}
