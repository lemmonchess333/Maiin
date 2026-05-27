import { THEME } from "@/lib/theme";
import { Scale, Footprints, ArrowRight, ChevronRight } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";

export default function WeightStepsTiles({
  lastWeight,
  weightUnit,
  onLogWeight,
  lastWeightDate,
}: {
  lastWeight: string | null;
  weightUnit: string;
  onLogWeight: () => void;
  lastWeightDate: string;
}) {
  /* Home2c a11y pin: each tile button gets an aria-label that
     surfaces its state compactly for screen readers. Without these,
     the reader walks the visual content (icon container \u2192 "Weight"
     micro label \u2192 value or em-dash \u2192 date) which is verbose and
     loses the empty-state intent. */
  const weightUnitDisplay = weightUnit === "lbs" ? "lb" : weightUnit;
  const weightAriaLabel = lastWeight
    ? `Weight ${lastWeight} ${weightUnitDisplay}, last logged ${lastWeightDate}. Tap to log weight.`
    : "Weight not yet logged. Log your weight to start tracking trends.";
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
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
          <p
            className="text-micro uppercase tracking-wider font-medium"
            style={{ color: THEME.text.muted }}
          >
            Weight
          </p>
        </div>
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
        <p className="text-micro mt-1" style={{ color: THEME.text.muted }}>
          {lastWeightDate}
        </p>
        <ChevronRight
          className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3"
          style={{ color: THEME.text.muted }}
          aria-hidden="true"
        />
      </button>
      <button
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
          <p
            className="text-micro uppercase tracking-wider font-medium"
            style={{ color: THEME.text.muted }}
          >
            Steps
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium" style={{ color: THEME.brand }}>
            Connect Health
          </span>
          <ArrowRight
            className="size-3"
            style={{ color: THEME.brand }}
            aria-hidden="true"
          />
        </div>
      </button>
    </div>
  );
}
