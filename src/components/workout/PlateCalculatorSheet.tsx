import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import {
  DEFAULT_BAR_KG,
  LB_BAR,
  LIGHT_BAR_KG,
  LIGHT_BAR_LB,
  platesInKit,
} from "@/lib/plateMath";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import { formatLoad, liftUnitLabel } from "@/lib/liftLoad";
import { cn } from "@/lib/utils";

interface PlateCalculatorSheetProps {
  open: boolean;
  onClose: () => void;
  weightKg: number;
  /** Whether the lifter's plan has small plates (1.25 kg / 2.5 lb barbell steps). */
  smallPlates?: boolean;
  /**
   * The exercise's warm-up sets as the session lists them, in kg: the rows
   * `warmupRamp` built from its working weight and reps (Lift4 (5)), with
   * any change the lifter made to them. The sheet plates up these rows and
   * never works out a ramp of its own, so the two can't disagree on one
   * screen. None for an exercise the session gives no warm-up.
   */
  warmups?: readonly { weight: number; reps: number }[];
}

/**
 * Plate calculator (#985 — the last in-session logging primitive vs
 * Hevy/Strong). Shows the per-side breakdown for the current set's
 * weight on a standard (20 kg / 45 lb) or lighter (15 kg / 35 lb) bar,
 * honouring `smallPlates` when enabled; when the weight isn't exactly
 * loadable, says so and names the nearest loadable weight instead of
 * pretending. Below it, the session's own warm-up sets for the exercise,
 * each with its plates.
 */
export default function PlateCalculatorSheet({
  open,
  onClose,
  weightKg,
  smallPlates = false,
  warmups = [],
}: PlateCalculatorSheetProps) {
  const titleId = useId();
  const warmupListId = useId();
  const unit = useLiftUnit();
  const label = liftUnitLabel(unit);
  const [useLightBar, setUseLightBar] = useState(false);
  const [showWarmup, setShowWarmup] = useState(false);
  const standardBar = unit === "lbs" ? LB_BAR : DEFAULT_BAR_KG;
  const lightBar = unit === "lbs" ? LIGHT_BAR_LB : LIGHT_BAR_KG;
  const bar = useLightBar ? lightBar : standardBar;
  const kitOptions = { smallPlates, barWeight: bar };
  const breakdown = platesInKit(weightKg, unit, kitOptions);
  const warmupSteps = warmups.map((set) => ({
    ...set,
    breakdown: platesInKit(set.weight, unit, kitOptions),
  }));

  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} size="sm">
      <div className="p-5 space-y-4">
        <div>
          <h3 id={titleId} className="text-base font-bold text-foreground">
            Plate up{" "}
            <span className="font-mono tabular-nums">
              {formatLoad(weightKg, unit)}
            </span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {bar} {label} bar · per side{smallPlates ? " · small plates" : ""}
          </p>
        </div>

        <div
          role="group"
          aria-label="Bar weight"
          className="grid grid-cols-2 gap-2"
        >
          <Button
            variant={!useLightBar ? "lifting-tinted" : "secondary"}
            aria-pressed={!useLightBar}
            onClick={() => setUseLightBar(false)}
          >
            <span className="font-mono tabular-nums">{standardBar}</span>{" "}
            {label} bar
          </Button>
          <Button
            variant={useLightBar ? "lifting-tinted" : "secondary"}
            aria-pressed={useLightBar}
            onClick={() => setUseLightBar(true)}
          >
            <span className="font-mono tabular-nums">{lightBar}</span> {label}{" "}
            bar
          </Button>
        </div>

        {!breakdown && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            That’s below the bar ({bar} {label}). Try dumbbells or a lighter
            bar.
          </p>
        )}

        {breakdown && breakdown.perSide.length === 0 && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            Just the bar.
          </p>
        )}

        {breakdown && breakdown.perSide.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {breakdown.perSide.map(({ plate, count }) => (
              <span
                key={plate}
                className="inline-block whitespace-nowrap rounded-xl bg-lifting/10 px-3 py-2 text-sm font-semibold text-lifting-strong"
              >
                {/* One run of text, so a space and not a flex gap sits
                    between the plate and its unit. */}
                <span className="font-mono tabular-nums">
                  {count} × {plate}
                </span>{" "}
                {label}
              </span>
            ))}
          </div>
        )}

        {breakdown && breakdown.remainder > 0 && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {breakdown.remainder} {label} can’t be loaded with{" "}
            {smallPlates ? "this plate set" : "standard plates"}. Nearest:{" "}
            <span className="font-mono tabular-nums text-foreground">
              {breakdown.loadable} {label}
            </span>
            .
          </p>
        )}

        {warmupSteps.length > 0 && (
          <div className="border-t border-border/50 pt-3 space-y-2">
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              aria-expanded={showWarmup}
              aria-controls={warmupListId}
              className="justify-between px-1 text-foreground"
              onClick={() => setShowWarmup((openState) => !openState)}
            >
              <span>Warm-up ramp</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <span className="font-mono tabular-nums">
                  {warmupSteps.length}{" "}
                  {warmupSteps.length === 1 ? "set" : "sets"}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    "size-4 transition-transform motion-reduce:transition-none",
                    showWarmup && "rotate-180"
                  )}
                />
              </span>
            </Button>

            {showWarmup && (
              <ol id={warmupListId} className="space-y-2">
                {warmupSteps.map((step, index) => (
                  <li
                    key={index}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl bg-muted/50 px-3 py-2 text-xs"
                  >
                    <span className="font-mono font-semibold tabular-nums text-foreground">
                      {formatLoad(step.weight, unit)} × {step.reps}
                    </span>
                    {step.breakdown && (
                      <span className="font-mono tabular-nums text-lifting-strong">
                        {step.breakdown.perSide.length === 0
                          ? "Bar only"
                          : step.breakdown.perSide
                              .map(({ plate, count }) => `${count}×${plate}`)
                              .join(" + ")}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        <Button variant="outline" className="w-full" onClick={onClose}>
          Done
        </Button>
      </div>
    </Dialog>
  );
}
