import { ThermometerSun } from "lucide-react";
import Button from "@/components/ui/Button";
import {
  EXTREME_HEAT_TITLE,
  HEAT_ADJUST,
  HEAT_CLEAR,
  HEAT_TITLE,
} from "@/lib/heatAdjustment";
import { WEATHER_CREDIT } from "@/lib/weather";
import { cn } from "@/lib/utils";

export interface HeatPanelAdjust {
  /** The runner tapped Adjust for heat, for this run. */
  accepted: boolean;
  /** What the adjustment set (`heatAdjustedLine`), shown once accepted. */
  adjustedLine: string;
  onAccept: () => void;
  onClear: () => void;
}

export interface HeatPanelSwap {
  line: string;
  label: string;
  onSwap: () => void;
}

interface HeatPanelProps {
  level: "hot" | "extreme";
  /** The heat line (`heatLine`): the rule of thumb's slowdown, or the
   *  extreme day's advice. */
  line: string;
  /** A line under it where the panel only looks ahead (Home's day). */
  note?: string | null;
  /** The offer to adjust this run for heat, or none where there is
   *  nothing to adjust (a free run, a run with no targets). */
  adjust?: HeatPanelAdjust | null;
  /** A swap beside it: a quality session for an easy run of its minutes,
   *  or a structured long run for easy running all the way. */
  swap?: HeatPanelSwap | null;
  className?: string;
}

/**
 * A hot day where a run is started or looked at (heatAdjustment.ts): the
 * heading, the heat line, and for a planned run the offer to adjust it for
 * heat (offered, never applied by itself, and cleared as easily) and any
 * swap. The caller draws it only on a hot or extreme day. Its numbers come
 * from MET Norway's weather, so the credit goes with it (CC BY 4.0,
 * weather.ts).
 */
export default function HeatPanel({
  level,
  line,
  note = null,
  adjust = null,
  swap = null,
  className,
}: HeatPanelProps) {
  return (
    <div
      role="note"
      aria-label="Hot day"
      className={cn(
        "rounded-xl bg-muted/40 border border-border/50 px-3.5 py-3",
        className
      )}
    >
      <div className="flex items-start gap-2.5">
        <ThermometerSun
          className="size-4 shrink-0 mt-0.5 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-foreground">
            {level === "extreme" ? EXTREME_HEAT_TITLE : HEAT_TITLE}
          </p>
          <p className="text-xs text-muted-foreground">{line}</p>
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
          {adjust?.accepted && (
            <p className="text-sm text-foreground">{adjust.adjustedLine}</p>
          )}
          {swap && <p className="text-xs text-muted-foreground">{swap.line}</p>}
          <p className="text-xs text-muted-foreground">{WEATHER_CREDIT}</p>
        </div>
      </div>
      {(adjust || swap) && (
        <div className="mt-2.5 grid gap-2">
          {adjust &&
            (adjust.accepted ? (
              <Button variant="ghost" fullWidth onClick={adjust.onClear}>
                {HEAT_CLEAR}
              </Button>
            ) : (
              <Button
                variant="sport-tinted"
                fullWidth
                onClick={adjust.onAccept}
              >
                {HEAT_ADJUST}
              </Button>
            ))}
          {swap && (
            <Button variant="outline" fullWidth onClick={swap.onSwap}>
              {swap.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
