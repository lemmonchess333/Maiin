import { ThermometerSun } from "lucide-react";
import Button from "@/components/ui/Button";
import { HEAT_LINE, heatSwapLine } from "@/lib/heatAdjustment";
import { WEATHER_CREDIT } from "@/lib/weather";
import { cn } from "@/lib/utils";

interface HotDayNoteProps {
  /** A quality session's swap for an easy run of its minutes (Pgm8 (E8)),
   *  or none: an easy or long run, a free run, a race. */
  swap?: {
    minutes: number;
    /** `HEAT_SWAP_START` where the tap starts the easy run,
     *  `HEAT_SWAP_SWITCH` where it changes the run being set up. */
    label: string;
    onSwap: () => void;
  } | null;
  className?: string;
}

/**
 * A hot day's note where a run is started or looked at (Pgm8 (E8)): the
 * heat line, with no number, then, for a quality session, the offer of an
 * easy run of the same minutes. The caller draws it only on a hot day
 * (`isHotDay`, `useHotDay`). The line is read from MET Norway's weather,
 * so its credit goes with it (CC BY 4.0, weather.ts).
 */
export default function HotDayNote({
  swap = null,
  className,
}: HotDayNoteProps) {
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
          <p className="text-sm text-foreground">{HEAT_LINE}</p>
          {swap && (
            <p className="text-xs text-muted-foreground">
              {heatSwapLine(swap.minutes)}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{WEATHER_CREDIT}</p>
        </div>
      </div>
      {swap && (
        <Button
          variant="sport-tinted"
          fullWidth
          className="mt-2.5"
          onClick={swap.onSwap}
        >
          {swap.label}
        </Button>
      )}
    </div>
  );
}
